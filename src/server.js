import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createWikiClient, createIndexCache, fetchItemIndex} from './wiki.js';
import {parseTask} from './parser.js';
const fixtureMode = process.argv.includes('--fixture');
const positive = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const request = createWikiClient({timeoutMs: positive(process.env.REQUEST_TIMEOUT_MS, 12000)});
const getIndex = createIndexCache(request, positive(process.env.INDEX_REFRESH_MS, 86400000));
const getItems = createIndexCache(request, positive(process.env.INDEX_REFRESH_MS, 86400000), fetchItemIndex, 'items');
const fixture = fixtureMode ? JSON.parse(await readFile(new URL('../test/fixtures/debut.json', import.meta.url), 'utf8')) : null;
const assets = {'/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css']};
createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src https: http:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const json = (status, value) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') return json(405, {error: 'Method not allowed.'});
    if (url.pathname === '/api/tasks') return json(200, fixtureMode ? {tasks: [{pageid: fixture.parse.pageid, title: fixture.parse.title}], fixture: true} : await getIndex());
    if (url.pathname === '/api/items') return json(200, fixtureMode ? {items: [], fixture: true} : await getItems());
    if (url.pathname.startsWith('/api/tasks/') || url.pathname.startsWith('/api/items/')) {
      const isItem = url.pathname.startsWith('/api/items/');
      if (fixtureMode && isItem) return json(404, {error: 'Items are unavailable in fixture mode.'});
      const id = url.pathname.slice('/api/tasks/'.length);
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return json(400, {error: 'Choose a valid task page ID.'});
      if (fixtureMode && Number(id) !== fixture.parse.pageid) return json(404, {error: 'Only Debut is available in fixture mode.'});
      const payload = fixtureMode ? fixture : await request({action: 'parse', pageid: id, prop: 'text|images|revid', disableeditsection: '1', disablelimitreport: '1'});
      return json(200, {...parseTask(payload), kind: isItem ? 'item' : 'task', fixture: fixtureMode});
    }
    if (!assets[url.pathname]) return json(404, {error: 'Not found.'});
    const [name, type] = assets[url.pathname];
    // Keep HTML and its DOM-dependent scripts in sync across updates.
    res.writeHead(200, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store'});
    res.end(await readFile(new URL(`../public/${name}`, import.meta.url)));
  } catch (error) { console.error(error.message); json(502, {error: 'Could not load content from the Tarkov Wiki. Please try again shortly.'}); }
}).on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${positive(process.env.PORT, 3000)} is already in use. If the reader is already running, open http://localhost:${positive(process.env.PORT, 3000)} in your browser. Otherwise stop the other server or set PORT=3001 in .env and try again.`);
  } else {
    console.error(`Could not start the task reader: ${error.message}`);
  }
  process.exitCode = 1;
}).listen(positive(process.env.PORT, 3000), '0.0.0.0', () => console.log(`Task reader: http://localhost:${positive(process.env.PORT, 3000)}${fixtureMode ? ' (EXPLICIT FIXTURE MODE)' : ''}`));
