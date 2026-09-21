// Explicit opt-in: node test/live-check.js (not part of node --test).
import {createWikiClient, fetchIndex} from '../src/wiki.js';
import {parseTask} from '../src/parser.js';
const request = createWikiClient();
let indexRequests = 0;
const tasks = await fetchIndex(params => { indexRequests++; return request(params); });
console.log(JSON.stringify({tasks: tasks.length, indexRequests, first: tasks[0], last: tasks.at(-1)}));
for (const title of ['Debut', 'Introduction', 'The Guide', 'Gunsmith - MP-133', 'Tour', 'Batya']) {
  const task = tasks.find(item => item.title === title);
  if (!task) { console.log(`Missing from category: ${title}`); continue; }
  const data = await request({action: 'parse', pageid: task.pageid, prop: 'text|images|revid', disableeditsection: '1', disablelimitreport: '1'});
  const result = parseTask(data);
  console.log(JSON.stringify({title, pageid: task.pageid, rawLength: data.parse.text.length, cleanedLength: result.fallbackHtml.length, sections: result.sections.map(s => s.title), imageCount: result.images.length, hasTable: result.sections.some(s => s.html.includes('<table')), hasSubheading: result.sections.some(s => s.html.includes('<h3'))}));
}
console.log(JSON.stringify(await request({action: 'query', meta: 'siteinfo', siprop: 'rightsinfo'})));
