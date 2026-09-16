const search = document.querySelector('#search');
const suggestions = document.querySelector('#suggestions');
const indexStatus = document.querySelector('#index-status');
const detailStatus = document.querySelector('#detail-status');
const article = document.querySelector('#task');
const indexRetry = document.querySelector('#index-retry');
const detailRetry = document.querySelector('#detail-retry');
const initialContent = article.innerHTML;
let tasks = [], matches = [], activeIndex = -1, controller, generation = 0, selectedId;
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
async function api(path, signal) { const response = await fetch(path, {signal}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed. Please retry.'); return data; }
function closeSuggestions() { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); search.removeAttribute('aria-activedescendant'); activeIndex = -1; }
function activate(index) {
  activeIndex = index;
  [...suggestions.children].forEach((node, i) => node.setAttribute('aria-selected', String(i === index)));
  if (index >= 0) { search.setAttribute('aria-activedescendant', `option-${index}`); suggestions.children[index]?.scrollIntoView({block: 'nearest'}); }
  else search.removeAttribute('aria-activedescendant');
}
function showSuggestions() {
  const query = search.value.trim().toLocaleLowerCase();
  matches = tasks.filter(task => task.title.toLocaleLowerCase().includes(query)).sort((a, b) => Number(b.title.toLocaleLowerCase().startsWith(query)) - Number(a.title.toLocaleLowerCase().startsWith(query)) || a.title.localeCompare(b.title)).slice(0, 30);
  suggestions.replaceChildren();
  for (const [index, task] of matches.entries()) {
    const item = element('li', task.title); item.id = `option-${index}`; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
    item.addEventListener('pointerdown', event => event.preventDefault());
    item.addEventListener('click', () => choose(task.pageid)); suggestions.append(item);
  }
  if (!matches.length) { const item = element('li', 'No matching tasks. Try another title.'); item.setAttribute('role', 'presentation'); suggestions.append(item); }
  activeIndex = -1; search.removeAttribute('aria-activedescendant'); suggestions.hidden = false; search.setAttribute('aria-expanded', 'true');
}
search.addEventListener('input', showSuggestions);
search.addEventListener('focus', () => { if (tasks.length) showSuggestions(); });
search.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeSuggestions(); return; }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); if (suggestions.hidden) showSuggestions();
    if (matches.length) activate((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
  }
  if (event.key === 'Enter' && !suggestions.hidden && matches.length) { event.preventDefault(); choose(matches[Math.max(0, activeIndex)].pageid); }
});
document.addEventListener('pointerdown', event => { if (!event.target.closest('.search-wrap')) closeSuggestions(); });
search.addEventListener('blur', closeSuggestions);
function externalLink(text, href) { const a = element('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function renderTask(data) {
  article.replaceChildren();
  const heading = element('div', undefined, 'task-heading');
  const titleBlock = element('div'); titleBlock.append(element('span', 'TASK BRIEFING', 'eyebrow'), element('h1', data.title));
  const metadata = element('div', undefined, 'metadata');
  if (data.metadata.trader) metadata.append(element('span', `TRADER / ${data.metadata.trader}`));
  if (data.metadata.location) metadata.append(element('span', `LOCATION / ${data.metadata.location}`));
  titleBlock.append(metadata); heading.append(titleBlock);
  if (data.metadata.image) { const link = externalLink('', data.metadata.image); const img = element('img'); img.src = data.metadata.image; img.alt = `${data.title} quest image`; img.loading = 'lazy'; link.append(img); heading.append(link); }
  article.append(heading);
  const nav = element('nav', undefined, 'section-nav'); nav.setAttribute('aria-label', 'Task sections');
  for (const section of data.sections) { const link = element('a', section.title); link.href = `#${encodeURIComponent(section.id)}`; nav.append(link); }
  article.append(nav);
  for (const section of data.sections) {
    const collapsed = section.title.toLowerCase() === 'dialogue';
    const block = element(collapsed ? 'details' : 'section', undefined, 'task-section'); block.id = section.id;
    block.append(element(collapsed ? 'summary' : 'h2', section.title));
    const body = element('div', undefined, 'wiki-content'); body.innerHTML = section.html; block.append(body); article.append(block);
  }
  if (!data.sections.length) { const body = element('div', undefined, 'wiki-content'); body.innerHTML = data.fallbackHtml; article.append(body); }
  article.querySelectorAll('.wiki-content table').forEach(table => { const wrapper = element('div', undefined, 'table-scroll'); wrapper.tabIndex = 0; wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', 'Scrollable wiki table'); table.before(wrapper); wrapper.append(table); });
  const credits = element('div', undefined, 'credits');
  credits.append(externalLink('Source article ↗', data.sourceUrl), ' · ', externalLink('Contributors & history ↗', `${data.sourceUrl}?action=history`), ` · Revision ${data.revid ?? 'unknown'}. Extracted and reformatted. `, externalLink('Text: CC BY-NC-SA unless otherwise noted', 'https://www.fandom.com/licensing'));
  if (data.images.length) { const media = element('details'); media.append(element('summary', 'Image sources & rights')); for (const name of data.images) { const p = element('p'); p.append(externalLink(name, `https://escapefromtarkov.fandom.com/wiki/File:${encodeURIComponent(name)}`)); media.append(p); } credits.append(media); }
  article.append(credits);
}
async function choose(id, push = true, hash = '') {
  closeSuggestions(); controller?.abort(); controller = new AbortController(); const version = ++generation; selectedId = id;
  if (push) history.pushState({}, '', `?task=${id}${hash}`);
  search.value = tasks.find(task => task.pageid === Number(id))?.title || search.value;
  article.replaceChildren(); article.setAttribute('aria-busy', 'true'); detailStatus.textContent = 'Loading task briefing…'; detailRetry.hidden = true;
  try {
    const data = await api(`/api/tasks/${encodeURIComponent(id)}`, controller.signal);
    if (version !== generation) return;
    search.value = data.title; renderTask(data); detailStatus.textContent = data.fixture ? 'DEVELOPMENT FIXTURE · Attached Debut response. Live fetching is disabled in this mode.' : '';
    if (hash) { try { const target = document.getElementById(decodeURIComponent(hash.slice(1))); if (target?.tagName === 'DETAILS') target.open = true; target?.scrollIntoView(); } catch {} }
  } catch (error) { if (version !== generation || error.name === 'AbortError') return; detailStatus.textContent = error.message; detailRetry.hidden = false; }
  finally { if (version === generation) article.removeAttribute('aria-busy'); }
}
article.addEventListener('click', event => {
  const link = event.target.closest('a'); if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
  const url = new URL(link.href);
  if (url.origin === location.origin && url.hash) { const target = document.getElementById(decodeURIComponent(url.hash.slice(1))); if (target?.tagName === 'DETAILS') target.open = true; }
  if (url.origin !== 'https://escapefromtarkov.fandom.com' || !url.pathname.startsWith('/wiki/')) return;
  let title; try { title = decodeURIComponent(url.pathname.slice(6)).replaceAll('_', ' '); } catch { return; }
  const task = tasks.find(task => task.title.toLowerCase() === title.toLowerCase());
  if (task && !url.search) { event.preventDefault(); choose(task.pageid, true, url.hash); }
});
async function loadIndex() {
  indexRetry.hidden = true; indexStatus.textContent = 'Loading task index…';
  try { const data = await api('/api/tasks'); tasks = data.tasks; indexStatus.textContent = data.fixture ? 'Fixture mode · 1 supplied task' : `${tasks.length} tasks · ${data.stale ? 'Cached index; refresh unavailable' : 'Search locally, read from the wiki'}`; }
  catch (error) { indexStatus.textContent = error.message; indexRetry.hidden = false; }
}
function restoreLocation() {
  const id = new URLSearchParams(location.search).get('task');
  if (id) choose(id, false, location.hash);
  else { controller?.abort(); generation++; selectedId = null; search.value = ''; detailStatus.textContent = ''; detailRetry.hidden = true; article.removeAttribute('aria-busy'); article.innerHTML = initialContent; }
}
window.addEventListener('popstate', restoreLocation);
indexRetry.addEventListener('click', loadIndex); detailRetry.addEventListener('click', () => choose(selectedId, false, location.hash));
loadIndex(); restoreLocation();
