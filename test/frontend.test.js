import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const taskData = (pageid, title) => ({pageid, title, metadata: {}, sections: [{title: 'Guide', id: 'Guide', html: '<p>Walkthrough</p>'}], images: [], sourceUrl: 'https://escapefromtarkov.fandom.com/wiki/Test'});
function setup() {
  const dom = new JSDOM(html, {url: 'http://localhost:3000', runScripts: 'outside-only'});
  const pending = [];
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  dom.window.fetch = (path, options = {}) => path === '/api/items' ? Promise.resolve({ok: true, json: async () => ({items: [{pageid: 10, title: 'Graphics card'}, {pageid: 11, title: 'Salewa'}]})}) : path === '/api/tasks' ? Promise.resolve({ok: true, json: async () => ({tasks: [{pageid: 1, title: 'Debut'}, {pageid: 2, title: 'Introduction'}, {pageid: 3, title: 'A Debut'}, {pageid: 4, title: 'Tour', story: true}]})}) : new Promise(resolve => pending.push({path, signal: options.signal, resolve: (data, ok = true) => resolve({ok, json: async () => data})}));
  dom.window.eval(script);
  const input = dom.window.document.querySelector('#search');
  const type = value => { input.value = value; input.dispatchEvent(new dom.window.Event('input')); };
  const key = value => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: value, bubbles: true}));
  return {dom, pending, input, type, key, document: dom.window.document};
}
test('autocomplete ranks prefixes, supports keyboard and empty search state', async () => {
  const app = setup(); await tick(); app.type('DEB');
  assert.deepEqual([...app.document.querySelectorAll('[role=option]')].map(node => node.textContent), ['Debut', 'A Debut']);
  app.key('ArrowDown'); assert.equal(app.input.getAttribute('aria-activedescendant'), 'option-0');
  app.key('Escape'); assert.equal(app.input.getAttribute('aria-expanded'), 'false');
  app.type('not a real task'); assert.match(app.document.querySelector('#suggestions').textContent, /No matching/);
  app.dom.window.close();
});
test('rapid selection ignores a stale response even if upstream ignores abort', async () => {
  const app = setup(); await tick(); app.type('Debut'); app.key('Enter'); app.type('Introduction'); app.key('Enter');
  assert.equal(app.pending[0].signal.aborted, true);
  app.pending[1].resolve(taskData(2, 'Introduction')); await tick();
  app.pending[0].resolve(taskData(1, 'Debut')); await tick();
  assert.equal(app.document.querySelector('h1').textContent, 'Introduction');
  assert.equal(app.dom.window.location.search, '?task=2');
  app.dom.window.close();
});
test('detail failure preserves search and retries the same task', async () => {
  const app = setup(); await tick(); app.type('Debut'); app.key('Enter');
  app.pending[0].resolve({error: 'Wiki unavailable'}, false); await tick();
  assert.equal(app.input.value, 'Debut'); assert.equal(app.document.querySelector('#detail-retry').hidden, false);
  app.document.querySelector('#detail-retry').click(); assert.equal(app.pending[1].path, '/api/tasks/1');
  app.pending[1].resolve(taskData(1, 'Debut')); await tick(); assert.equal(app.document.querySelector('h1').textContent, 'Debut');
  app.dom.window.close();
});
test('image viewer opens the clicked image, cycles unique images and restores focus', async () => {
  const app = setup(); await tick(); app.type('Debut'); app.key('Enter');
  const data = taskData(1, 'Debut');
  data.sections[0].html = '<figure><a href="https://static.wikia.nocookie.net/map.png"><img src="https://static.wikia.nocookie.net/thumb.png" alt="Map"></a><figcaption>Camp location</figcaption></figure><a href="https://static.wikia.nocookie.net/camp.png"><img src="https://static.wikia.nocookie.net/camp.png" alt="Camp"></a><img src="https://static.wikia.nocookie.net/camp.png" alt="Duplicate">';
  app.pending[0].resolve(data); await tick();
  const opener = app.document.querySelector('#task figure a'); opener.focus(); opener.click();
  const dialog = app.document.querySelector('dialog');
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('img').src, 'https://static.wikia.nocookie.net/map.png');
  assert.match(dialog.textContent, /Camp location/);
  assert.match(dialog.textContent, /1 \/ 2/);
  dialog.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', {key: 'ArrowLeft'}));
  assert.equal(dialog.querySelector('img').alt, 'Camp');
  assert.match(dialog.textContent, /2 \/ 2/);
  dialog.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', {key: 'Escape'}));
  assert.equal(dialog.open, false); assert.equal(app.document.activeElement, opener);
  assert.equal(dialog.querySelector('img').hasAttribute('src'), false);
  app.dom.window.close();
});

test('item filter, locations, retry and task switching share stale-response protection', async () => {
  const app = setup(); await tick();
  const list = app.document.querySelector('#item-suggestions');
  assert.equal(app.document.querySelector('#item-select'), null);
  const filter = app.document.querySelector('#item-filter'); filter.value = 'graphics'; filter.dispatchEvent(new app.dom.window.Event('input'));
  assert.equal(list.querySelectorAll('[role=option]').length, 1);
  filter.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', {key: 'ArrowDown'}));
  assert.equal(filter.getAttribute('aria-activedescendant'), 'item-option-0');
  filter.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', {key: 'Escape'}));
  assert.equal(filter.getAttribute('aria-expanded'), 'false');
  filter.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', {key: 'ArrowDown'}));
  filter.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', {key: 'Enter'}));
  assert.equal(list.hidden, true);
  assert.equal(filter.value, 'Graphics card');
  assert.equal(app.pending[0].path, '/api/items/10');
  app.pending[0].resolve({error: 'Offline'}, false); await tick();
  app.document.querySelector('#detail-retry').click(); assert.equal(app.pending[1].path, '/api/items/10');
  const data = taskData(10, 'Graphics card'); data.sections.push({title: 'Location', id: 'Location', html: '<h3>Interchange</h3><p>PC blocks</p>'});
  app.pending[1].resolve(data); await tick();
  assert.equal(app.document.querySelector('.task-section h2').textContent, 'Where to find it');
  assert.equal(app.dom.window.location.search, '?item=10');
  filter.dispatchEvent(new app.dom.window.Event('input')); list.querySelector('[role=option]').click(); app.type('Debut'); app.key('Enter');
  assert.equal(app.pending[2].signal.aborted, true);
  app.pending[3].resolve(taskData(1, 'Debut')); await tick(); app.pending[2].resolve(data); await tick();
  assert.equal(app.document.querySelector('h1').textContent, 'Debut');
  app.dom.window.history.replaceState({}, '', '?item=11'); app.dom.window.dispatchEvent(new app.dom.window.PopStateEvent('popstate'));
  assert.equal(app.pending[4].path, '/api/items/11'); app.pending[4].resolve(taskData(11, 'Salewa')); await tick();
  assert.match(app.document.querySelector('.location-note').textContent, /does not list/);
  app.dom.window.close();
});

test('main story chapters appear in the existing task dropdown and open as tasks', async () => {
  const app = setup(); await tick(); app.type('Tour');
  assert.equal(app.document.querySelector('#suggestions [role=option]').textContent, 'Tour · Main story');
  app.key('Enter'); assert.equal(app.pending[0].path, '/api/tasks/4');
  const data = taskData(4, 'Tour'); data.sections = [{title: 'Objectives', id: 'Objectives', html: '<ul><li>Escape Ground Zero</li></ul>'}, {title: 'Guide', id: 'Guide', html: '<h3>Stage one</h3><p>Story walkthrough</p>'}];
  app.pending[0].resolve(data); await tick();
  assert.equal(app.input.value, 'Tour'); assert.equal(app.dom.window.location.search, '?task=4');
  assert.match(app.document.querySelector('#task').textContent, /Escape Ground Zero/);
  assert.match(app.document.querySelector('#task').textContent, /Story walkthrough/);
  app.dom.window.close();
});
