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
  dom.window.fetch = (path, options = {}) => path === '/api/tasks' ? Promise.resolve({ok: true, json: async () => ({tasks: [{pageid: 1, title: 'Debut'}, {pageid: 2, title: 'Introduction'}, {pageid: 3, title: 'A Debut'}]})}) : new Promise(resolve => pending.push({path, signal: options.signal, resolve: (data, ok = true) => resolve({ok, json: async () => data})}));
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
