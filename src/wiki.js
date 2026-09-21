import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export const wikiOrigin = 'https://escapefromtarkov.fandom.com';
export function createWikiClient({fetchImpl = fetch, timeoutMs = 12000, delay = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  return async params => {
    const url = new URL('/api.php', wikiOrigin);
    url.search = new URLSearchParams({...params, format: 'json', formatversion: '2'});
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchImpl(url, {signal: AbortSignal.timeout(timeoutMs), headers: {'User-Agent': 'TarkovTaskReader/1.0', Accept: 'application/json'}, redirect: 'error'});
        if (!response.ok) throw Object.assign(new Error(`Wiki returned HTTP ${response.status}.`), {retryable: response.status === 429 || response.status >= 500});
        const data = await response.json();
        if (data.error) throw Object.assign(new Error(`Wiki: ${data.error.info || data.error.code}`), {retryable: ['maxlag', 'ratelimited', 'readonly'].includes(data.error.code)});
        return data;
      } catch (error) {
        if (error.retryable === false || attempt === 2) throw error;
        await delay(250 * (attempt + 1));
      }
    }
  };
}
export async function fetchIndex(request) {
  const entries = new Map();
  for (const category of ['Category:Quests', 'Category:Story chapters']) {
    let continuation = {}, seen = new Set();
    do {
      const data = await request({action: 'query', list: 'categorymembers', cmtitle: category, cmnamespace: '0', cmprop: 'ids|title', cmlimit: '500', ...continuation});
      if (!Array.isArray(data.query?.categorymembers)) throw new Error('Wiki returned an invalid task index.');
      for (const item of data.query.categorymembers) {
        if (Number.isSafeInteger(item.pageid) && item.pageid > 0 && typeof item.title === 'string') {
          if (item.title === 'Story chapters') continue;
          entries.set(item.pageid, {...entries.get(item.pageid), pageid: item.pageid, title: item.title, ...(category === 'Category:Story chapters' ? {story: true} : {})});
        }
      }
      continuation = data.continue;
      if (continuation) {
        const key = JSON.stringify(continuation);
        if (seen.has(key)) throw new Error('Wiki repeated its pagination cursor.');
        seen.add(key);
      }
    } while (continuation);
  }
  if (!entries.size) throw new Error('Wiki returned an empty task index.');
  return [...entries.values()].sort((a, b) => a.title.localeCompare(b.title));
}
export function createIndexCache(request, refreshMs = 86400000, loader = fetchIndex, key = 'tasks', {cacheFile, now = Date.now, warn = console.warn} = {}) {
  let entries, updatedAt = 0, pending, retryAfter = 0, initialized;
  const validEntries = value => Array.isArray(value) && value.length > 0 && value.every(entry => Number.isSafeInteger(entry.pageid) && entry.pageid > 0 && typeof entry.title === 'string' && entry.title.length > 0 && (entry.story === undefined || typeof entry.story === 'boolean'));
  async function restore() {
    if (!cacheFile) return;
    try {
      const saved = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (saved.version !== 1 || saved.key !== key || !Number.isSafeInteger(saved.updatedAt) || saved.updatedAt <= 0 || saved.updatedAt > now() || !validEntries(saved.entries)) throw new Error('Invalid cache file');
      entries = saved.entries; updatedAt = saved.updatedAt;
    } catch (error) { if (error.code !== 'ENOENT') warn('Could not restore ' + key + ' cache: ' + error.message); }
  }
  async function persist() {
    if (!cacheFile) return;
    const temporary = cacheFile + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(dirname(cacheFile), {recursive: true});
      await writeFile(temporary, JSON.stringify({version: 1, key, updatedAt, entries}), 'utf8');
      await rename(temporary, cacheFile);
    } catch (error) {
      warn('Could not save ' + key + ' cache: ' + error.message);
      await rm(temporary, {force: true}).catch(() => {});
    }
  }
  function refresh() {
    pending ??= Promise.resolve().then(() => loader(request)).then(async result => {
      if (!validEntries(result)) throw new Error('Invalid ' + key + ' index');
      entries = result; updatedAt = now(); retryAfter = 0;
      await persist();
    }).catch(error => {
      retryAfter = now() + 30000;
      warn('Could not refresh ' + key + ' cache: ' + error.message);
    }).finally(() => { pending = null; });
    return pending;
  }
  return async () => {
    await (initialized ??= restore());
    if ((!entries || now() - updatedAt >= refreshMs) && now() >= retryAfter) {
      const work = refresh();
      // Existing indexes stay available while the wiki refresh runs.
      if (!entries) await work;
    }
    if (!entries) throw new Error('The wiki ' + key + ' index is unavailable. Please retry shortly.');
    return {[key]: entries, updatedAt, stale: now() - updatedAt >= refreshMs};
  };
}

export async function fetchItemIndex(request) {
  const categories = ['Category:Inventory'], visited = new Set(), entries = new Map();
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    if (visited.has(category)) continue;
    visited.add(category);
    let continuation = {}, cursors = new Set();
    do {
      const data = await request({action: 'query', list: 'categorymembers', cmtitle: category, cmnamespace: '0|14', cmprop: 'ids|title', cmlimit: '500', ...continuation});
      if (!Array.isArray(data.query?.categorymembers)) throw new Error('Wiki returned an invalid item index.');
      for (const entry of data.query.categorymembers) {
        if (typeof entry.title !== 'string') continue;
        if (entry.title.startsWith('Category:')) categories.push(entry.title);
        else if (Number.isSafeInteger(entry.pageid) && entry.pageid > 0) entries.set(entry.pageid, {pageid: entry.pageid, title: entry.title});
      }
      continuation = data.continue;
      if (continuation) {
        const cursor = JSON.stringify(continuation);
        if (cursors.has(cursor)) throw new Error('Wiki repeated its pagination cursor.');
        cursors.add(cursor);
      }
    } while (continuation);
  }
  if (!entries.size) throw new Error('Wiki returned an empty item index.');
  return [...entries.values()].sort((a, b) => a.title.localeCompare(b.title));
}
