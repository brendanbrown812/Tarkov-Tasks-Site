import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseTask} from '../src/parser.js';
import {fetchIndex, createIndexCache, createWikiClient} from '../src/wiki.js';
test('real Debut response retains content and metadata but removes navigation', async () => {
  const result = parseTask(JSON.parse(await readFile(new URL('./fixtures/debut.json', import.meta.url), 'utf8')));
  assert.equal(result.metadata.trader, 'Prapor');
  assert.match(result.metadata.location, /Customs/);
  assert.deepEqual(result.sections.map(s => s.title), ['Overview', 'Dialogue', 'Requirements', 'Objectives', 'Rewards', 'Guide']);
  assert.match(result.sections.find(s => s.title === 'Objectives').html, /Eliminate 5/);
  assert.ok(result.fallbackHtml.length < 7000);
  assert.doesNotMatch(result.fallbackHtml, /Operational Tasks|va-navbox|NewPP|tocnumber/);
});
test('DOM extraction preserves subsections, tables, captions, anchors and strips hostile markup', () => {
  const result = parseTask({parse: {pageid: 1, title: 'Test', text: `<div class="mw-parser-output"><div><h2><span id="Guide">Guide</span></h2><h3 id="step">Step one</h3><ul><li>Outer<ul><li>Inner</li></ul></li></ul><table><tr><td>Useful table</td></tr></table><figure><img src="data:bad" data-src="//static.wikia.nocookie.net/test.png" onerror="alert(1)"><figcaption>Useful caption</figcaption></figure><a href="#step">Jump</a><a href="javascript:alert(1)">Bad</a><script>evil()</script><iframe src="https://evil.test"></iframe></div><h2>Extra section</h2><p style="display:none" onclick="evil()">Keep me</p><div class="navbox">Unwanted</div></div>`}});
  assert.deepEqual(result.sections.map(s => s.title), ['Guide', 'Extra section']);
  const html = result.sections.map(s => s.html).join('');
  assert.match(html, /<h3 id="step">/); assert.match(html, /Useful table/); assert.match(html, /Useful caption/); assert.match(html, /https:\/\/static.wikia/); assert.match(html, /href="#step"/);
  assert.doesNotMatch(html, /javascript:|onerror|onclick|<script|<iframe|style=|Unwanted/);
});
test('heading-free content stays available', () => {
  const result = parseTask({parse: {pageid: 1, title: 'Test', text: '<p>A useful article.</p>'}});
  assert.match(result.sections[0].html, /useful article/); assert.match(result.fallbackHtml, /useful article/);
});
test('index follows the entire continuation object and deduplicates page IDs', async () => {
  const calls = [];
  const tasks = await fetchIndex(async params => { calls.push(params); return calls.length === 1 ? {query: {categorymembers: [{pageid: 1, title: 'A'}]}, continue: {cmcontinue: 'next', continue: '-||'}} : {query: {categorymembers: [{pageid: 1, title: 'A'}, {pageid: 2, title: 'B'}]}}; });
  assert.equal(calls[1].cmcontinue, 'next'); assert.equal(calls[1].continue, '-||'); assert.equal(tasks.length, 2);
});
test('cache coalesces requests and retains last successful index on failed refresh', async () => {
  let calls = 0;
  const cache = createIndexCache(async () => { calls++; if (calls > 1) throw new Error('offline'); return {query: {categorymembers: [{pageid: 1, title: 'A'}]}}; }, 1);
  await Promise.all([cache(), cache()]); assert.equal(calls, 1);
  await new Promise(resolve => setTimeout(resolve, 5));
  const stale = await cache(); assert.equal(stale.stale, true); assert.equal(stale.tasks[0].title, 'A');
  await cache(); assert.equal(calls, 2);
});
test('repeated pagination cursors are rejected', async () => {
  await assert.rejects(fetchIndex(async () => ({query: {categorymembers: []}, continue: {cmcontinue: 'same'}})), /repeated/);
});
test('HTTP transient failures retry, MediaWiki permanent errors do not', async () => {
  let calls = 0;
  const client = createWikiClient({delay: async () => {}, fetchImpl: async () => { calls++; return calls < 3 ? {ok: false, status: 503} : {ok: true, json: async () => ({ok: true})}; }});
  assert.deepEqual(await client({action: 'query'}), {ok: true}); assert.equal(calls, 3);
  calls = 0;
  const failing = createWikiClient({delay: async () => {}, fetchImpl: async () => { calls++; return {ok: true, json: async () => ({error: {code: 'missingtitle', info: 'Missing page'}})}; }});
  await assert.rejects(failing({}), /Missing page/); assert.equal(calls, 1);
});
