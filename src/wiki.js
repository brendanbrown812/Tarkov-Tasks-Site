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
  let continuation = {}, seen = new Set();
  do {
    const data = await request({action: 'query', list: 'categorymembers', cmtitle: 'Category:Quests', cmnamespace: '0', cmprop: 'ids|title', cmlimit: '500', ...continuation});
    if (!Array.isArray(data.query?.categorymembers)) throw new Error('Wiki returned an invalid task index.');
    for (const item of data.query.categorymembers) {
      if (Number.isSafeInteger(item.pageid) && item.pageid > 0 && typeof item.title === 'string') entries.set(item.pageid, {pageid: item.pageid, title: item.title});
    }
    continuation = data.continue;
    if (continuation) {
      const key = JSON.stringify(continuation);
      if (seen.has(key)) throw new Error('Wiki repeated its pagination cursor.');
      seen.add(key);
    }
  } while (continuation);
  if (!entries.size) throw new Error('Wiki returned an empty task index.');
  return [...entries.values()].sort((a, b) => a.title.localeCompare(b.title));
}
export function createIndexCache(request, refreshMs = 86400000) {
  let tasks, updatedAt = 0, pending, retryAfter = 0;
  return async () => {
    if ((!tasks || Date.now() - updatedAt >= refreshMs) && Date.now() >= retryAfter) {
      pending ??= fetchIndex(request).then(result => { tasks = result; updatedAt = Date.now(); retryAfter = 0; }).catch(error => { retryAfter = Date.now() + 30000; if (!tasks) throw error; }).finally(() => { pending = null; });
      await pending;
    }
    if (!tasks) throw new Error('The wiki task index is unavailable. Please retry shortly.');
    return {tasks, updatedAt, stale: Date.now() - updatedAt >= refreshMs};
  };
}
