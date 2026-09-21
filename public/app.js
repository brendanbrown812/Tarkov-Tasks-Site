const search = document.querySelector('#search');
const suggestions = document.querySelector('#suggestions');
const indexStatus = document.querySelector('#index-status');
const detailStatus = document.querySelector('#detail-status');
const article = document.querySelector('#task');
const indexRetry = document.querySelector('#index-retry');
const detailRetry = document.querySelector('#detail-retry');
const itemSuggestions = document.querySelector('#item-suggestions');
const itemFilter = document.querySelector('#item-filter');
const itemStatus = document.querySelector('#item-status');
const itemRetry = document.querySelector('#item-retry');
let items = [], selectedKind = 'task';
const initialContent = article.innerHTML;
let tasks = [], controller, generation = 0, selectedId;
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const viewer = element('dialog', undefined, 'image-viewer');
viewer.setAttribute('aria-label', 'Wiki image viewer');
const viewerClose = element('button', 'Close ×');
const viewerPrevious = element('button', '← Previous');
const viewerNext = element('button', 'Next →');
const viewerImage = element('img');
const viewerCaption = element('p');
const viewerCount = element('span');
const viewerStatus = element('p');
viewerStatus.setAttribute('role', 'status');
viewerCount.setAttribute('aria-live', 'polite');
const viewerControls = element('div', undefined, 'viewer-controls');
viewerControls.append(viewerPrevious, viewerCount, viewerNext, viewerClose);
viewer.append(viewerControls, viewerImage, viewerCaption, viewerStatus);
document.body.append(viewer);
let gallery = [], galleryIndex = 0, viewerOpener;
function imageSource(img) {
  const href = img.closest('a')?.href;
  if (href) {
    const url = new URL(href);
    if (['http:', 'https:'].includes(url.protocol) && (url.hostname === 'static.wikia.nocookie.net' || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(url.pathname))) return url.href;
  }
  return img.src;
}
function showImage(index) {
  galleryIndex = (index + gallery.length) % gallery.length;
  const image = gallery[galleryIndex];
  viewerImage.alt = image.caption;
  viewerCaption.textContent = image.caption;
  viewerCount.textContent = `${galleryIndex + 1} / ${gallery.length}`;
  viewerPrevious.disabled = viewerNext.disabled = gallery.length < 2;
  viewerStatus.textContent = 'Loading image…';
  viewerImage.src = image.src;
}
function closeViewer() { if (viewer.open) viewer.close(); }
viewerImage.addEventListener('load', () => { viewerStatus.textContent = ''; });
viewerImage.addEventListener('error', () => { viewerStatus.textContent = 'This image could not load. Try another image or reopen the viewer.'; });
viewerClose.addEventListener('click', closeViewer);
viewerPrevious.addEventListener('click', () => showImage(galleryIndex - 1));
viewerNext.addEventListener('click', () => showImage(galleryIndex + 1));
viewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); showImage(galleryIndex + (event.key === 'ArrowRight' ? 1 : -1)); }
  if (event.key === 'Escape') { event.preventDefault(); closeViewer(); }
});
viewer.addEventListener('click', event => { if (event.target === viewer) closeViewer(); });
viewer.addEventListener('close', () => {
  document.body.classList.remove('viewer-open');
  viewerImage.removeAttribute('src');
  if (viewerOpener?.isConnected) viewerOpener.focus();
});
function openViewer(img) {
  const unique = new Map();
  for (const image of article.querySelectorAll('img')) {
    const src = imageSource(image);
    if (!unique.has(src)) unique.set(src, {src, caption: image.closest('.gallerybox, figure, .thumb')?.querySelector('.gallerytext, figcaption, .thumbcaption')?.textContent.trim() || image.alt || 'Task image'});
  }
  gallery = [...unique.values()];
  viewerOpener = img.closest('a') || img;
  showImage(gallery.findIndex(image => image.src === imageSource(img)));
  viewer.showModal();
  document.body.classList.add('viewer-open');
  viewerClose.focus();
}
async function api(path, signal) { const response = await fetch(path, {signal}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed. Please retry.'); return data; }
function createPicker(input, list, getEntries, kind, optionPrefix) {
  let matches = [], activeIndex = -1;
  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); activeIndex = -1; }
  function activate(index) {
    activeIndex = index;
    [...list.children].forEach((node, i) => node.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) { input.setAttribute('aria-activedescendant', optionPrefix + index); list.children[index]?.scrollIntoView({block: 'nearest'}); }
    else input.removeAttribute('aria-activedescendant');
  }
  function show() {
    const query = input.value.trim().toLocaleLowerCase();
    matches = getEntries().filter(entry => entry.title.toLocaleLowerCase().includes(query)).sort((a, b) => Number(b.title.toLocaleLowerCase().startsWith(query)) - Number(a.title.toLocaleLowerCase().startsWith(query)) || a.title.localeCompare(b.title)).slice(0, 30);
    list.replaceChildren();
    for (const [index, entry] of matches.entries()) {
      const option = element('li', entry.title + (entry.story ? ' · Main story' : '')); option.id = optionPrefix + index; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => choose(entry.pageid, true, '', kind)); list.append(option);
    }
    if (!matches.length) { const option = element('li', 'No matching ' + (kind === 'item' ? 'items' : 'tasks') + '. Try another title.'); option.setAttribute('role', 'presentation'); list.append(option); }
    activeIndex = -1; input.removeAttribute('aria-activedescendant'); list.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  input.addEventListener('input', show);
  input.addEventListener('focus', () => { if (getEntries().length) show(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); if (list.hidden) show();
      if (matches.length) activate(activeIndex < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    }
    if (event.key === 'Enter' && !list.hidden && matches.length) { event.preventDefault(); choose(matches[Math.max(0, activeIndex)].pageid, true, '', kind); }
  });
  document.addEventListener('pointerdown', event => { if (!input.closest('.search-wrap').contains(event.target)) close(); });
  input.addEventListener('blur', close);
  return {close};
}
const taskPicker = createPicker(search, suggestions, () => tasks, 'task', 'option-');
const itemPicker = createPicker(itemFilter, itemSuggestions, () => items, 'item', 'item-option-');
function closeSuggestions() { taskPicker.close(); itemPicker.close(); }
function externalLink(text, href) { const a = element('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function renderTask(data) {
  article.replaceChildren();
  const heading = element('div', undefined, 'task-heading');
  const titleBlock = element('div'); titleBlock.append(element('span', data.kind === 'item' ? 'ITEM REFERENCE' : 'TASK BRIEFING', 'eyebrow'), element('h1', data.title));
  const metadata = element('div', undefined, 'metadata');
  if (data.metadata.trader) metadata.append(element('span', `TRADER / ${data.metadata.trader}`));
  if (data.metadata.location) metadata.append(element('span', `LOCATION / ${data.metadata.location}`));
  titleBlock.append(metadata); heading.append(titleBlock);
  if (data.metadata.image) { const link = externalLink('', data.metadata.image); const img = element('img'); img.src = data.metadata.image; img.alt = `${data.title} image`; img.loading = 'lazy'; link.append(img); heading.append(link); }
  article.append(heading);
  const nav = element('nav', undefined, 'section-nav'); nav.setAttribute('aria-label', 'Article sections');
  if (data.kind === 'item') {
    const locations = data.sections.filter(section => /^(locations?|spawn locations?|where to find)$/i.test(section.title));
    if (locations.length) data = {...data, sections: [...locations.map(section => ({...section, title: 'Where to find it'})), ...data.sections.filter(section => !locations.includes(section))]};
    else article.append(element('p', 'The wiki does not list a dedicated location section for this item. Check the article below for other details.', 'location-note'));
  }
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
async function choose(id, push = true, hash = '', kind = 'task') {
  closeViewer();
  closeSuggestions(); controller?.abort(); controller = new AbortController(); const version = ++generation; selectedId = id; selectedKind = kind;
  if (push) history.pushState({}, '', `?${kind}=${id}${hash}`);
  if (kind === 'task') search.value = tasks.find(task => task.pageid === Number(id))?.title || search.value;
  itemFilter.value = kind === 'item' ? (items.find(item => item.pageid === Number(id))?.title || itemFilter.value) : '';
  article.replaceChildren(); article.setAttribute('aria-busy', 'true'); detailStatus.textContent = kind === 'item' ? 'Loading item locations…' : 'Loading task briefing…'; detailRetry.hidden = true;
  try {
    const data = await api(`/api/${kind === 'item' ? 'items' : 'tasks'}/${encodeURIComponent(id)}`, controller.signal);
    if (version !== generation) return;
    (kind === 'task' ? search : itemFilter).value = data.title; renderTask({...data, kind}); detailStatus.textContent = data.fixture ? 'DEVELOPMENT FIXTURE · Attached Debut response. Live fetching is disabled in this mode.' : '';
    if (hash) { try { const target = document.getElementById(decodeURIComponent(hash.slice(1))); if (target?.tagName === 'DETAILS') target.open = true; target?.scrollIntoView(); } catch {} }
  } catch (error) { if (version !== generation || error.name === 'AbortError') return; detailStatus.textContent = error.message; detailRetry.hidden = false; }
  finally { if (version === generation) article.removeAttribute('aria-busy'); }
}
article.addEventListener('click', event => {
  const image = event.target.closest('img') || event.target.closest('a')?.querySelector('img');
  if (image && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.button) { event.preventDefault(); openViewer(image); return; }
  const link = event.target.closest('a'); if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
  const url = new URL(link.href);
  if (url.origin === location.origin && url.hash) { const target = document.getElementById(decodeURIComponent(url.hash.slice(1))); if (target?.tagName === 'DETAILS') target.open = true; }
  if (url.origin !== 'https://escapefromtarkov.fandom.com' || !url.pathname.startsWith('/wiki/')) return;
  let title; try { title = decodeURIComponent(url.pathname.slice(6)).replaceAll('_', ' '); } catch { return; }
  const task = tasks.find(task => task.title.toLowerCase() === title.toLowerCase());
  const item = items.find(item => item.title.toLowerCase() === title.toLowerCase());
  if ((task || item) && !url.search) { event.preventDefault(); choose((task || item).pageid, true, url.hash, task ? 'task' : 'item'); }
});
async function loadIndex() {
  indexRetry.hidden = true; indexStatus.textContent = 'Loading task index…';
  try { const data = await api('/api/tasks'); tasks = data.tasks; indexStatus.textContent = data.fixture ? 'Fixture mode · 1 supplied task' : `${tasks.length} tasks · ${data.stale ? 'Cached index; refresh unavailable' : 'Search locally, read from the wiki'}`; }
  catch (error) { indexStatus.textContent = error.message; indexRetry.hidden = false; }
}
function restoreLocation() {
  closeViewer();
  closeSuggestions();
  const params = new URLSearchParams(location.search);
  const kind = params.has('item') ? 'item' : 'task';
  const id = params.get(kind);
  if (id) choose(id, false, location.hash, kind);
  else { controller?.abort(); generation++; selectedId = null; itemFilter.value = ''; search.value = ''; detailStatus.textContent = ''; detailRetry.hidden = true; article.removeAttribute('aria-busy'); article.innerHTML = initialContent; }
}
window.addEventListener('popstate', restoreLocation);
indexRetry.addEventListener('click', loadIndex); detailRetry.addEventListener('click', () => choose(selectedId, false, location.hash, selectedKind));
async function loadItems() {
  itemRetry.hidden = true;
  itemStatus.textContent = 'Loading item index; the first load can take a minute…';
  try {
    const data = await api('/api/items'); items = data.items;
    itemFilter.disabled = !items.length;
    itemStatus.textContent = data.fixture ? 'Items are unavailable in development fixture mode.' : items.length + ' wiki inventory entries · ' + (data.stale ? 'Cached index; refresh unavailable' : 'Locations vary by item; spawns are not guaranteed');
  } catch (error) { itemStatus.textContent = error.message; itemRetry.hidden = false; }
}
itemRetry.addEventListener('click', loadItems);
loadIndex(); loadItems(); restoreLocation();
