import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createIndexCache} from '../src/wiki.js';
const entries = [{pageid: 1, title: 'Tour', story: true}];
const flush = () => new Promise(resolve => setImmediate(resolve));

test('cold cache persists and a new instance serves disk data without calling the wiki', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tarkov-cache-'));
  const cacheFile = join(directory, 'tasks.json');
  let calls = 0;
  const cache = createIndexCache(null, 1000, async () => { calls++; return entries; }, 'tasks', {cacheFile, now: () => 10000});
  await Promise.all([cache(), cache(), cache()]);
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(await readFile(cacheFile, 'utf8')).entries, entries);
  const restarted = createIndexCache(null, 1000, async () => { throw new Error('Must not fetch'); }, 'tasks', {cacheFile, now: () => 10001});
  assert.deepEqual(await restarted(), {tasks: entries, updatedAt: 10000, stale: false});
});

test('stale data returns during a pending refresh; failures retain data and respect retry cooldown', async () => {
  let time = 10000, calls = 0, rejectRefresh;
  const cache = createIndexCache(null, 100, async () => {
    calls++;
    if (calls === 1) return entries;
    return new Promise((resolve, reject) => { rejectRefresh = reject; });
  }, 'tasks', {now: () => time, warn: () => {}});
  await cache(); time += 101;
  assert.equal((await cache()).stale, true);
  assert.deepEqual((await cache()).tasks, entries);
  assert.equal(calls, 2);
  rejectRefresh(new Error('Offline')); await flush();
  await cache(); assert.equal(calls, 2);
  time += 30001; await cache(); assert.equal(calls, 3);
  rejectRefresh(new Error('Offline')); await flush();
});

test('corrupt cache is rebuilt, and persistence failure does not discard a valid memory index', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tarkov-cache-'));
  const cacheFile = join(directory, 'broken.json');
  await writeFile(cacheFile, '{bad json');
  const cache = createIndexCache(null, 1000, async () => entries, 'tasks', {cacheFile, warn: () => {}});
  assert.deepEqual((await cache()).tasks, entries);
  assert.equal(JSON.parse(await readFile(cacheFile, 'utf8')).version, 1);
  const unwritable = createIndexCache(null, 1000, async () => entries, 'tasks', {cacheFile: join(cacheFile, 'child.json'), warn: () => {}});
  assert.deepEqual((await unwritable()).tasks, entries);
});

test('cold failure retries after cooldown and accepts a later successful build', async () => {
  let time = 10000, calls = 0;
  const cache = createIndexCache(null, 1000, async () => { if (++calls === 1) throw new Error('Offline'); return entries; }, 'tasks', {now: () => time, warn: () => {}});
  await assert.rejects(cache(), /unavailable/);
  await assert.rejects(cache(), /unavailable/); assert.equal(calls, 1);
  time += 30001;
  assert.deepEqual((await cache()).tasks, entries); assert.equal(calls, 2);
});
