import {load} from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import {wikiOrigin} from './wiki.js';

function safeUrl(value, base) {
  try { const url = new URL(value, base); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function cleanHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption', 'details', 'summary'],
    allowedAttributes: {'*': ['id', 'class'], a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope']},
    allowedClasses: {'*': ['gallery', 'gallerybox', 'gallerytext', 'thumb', 'thumbinner', 'thumbcaption']},
    allowedSchemes: ['https', 'http'], allowProtocolRelative: false,
  });
}
export function parseTask(payload) {
  const page = payload.parse;
  if (!page || typeof page.text !== 'string' || !Number.isSafeInteger(page.pageid) || typeof page.title !== 'string') throw new Error('Wiki returned invalid task content.');
  const sourceUrl = `${wikiOrigin}/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`;
  const $ = load(page.text);
  const root = $('.mw-parser-output').first().length ? $('.mw-parser-output').first() : $('body');
  root.find('.navbox, .va-navbox, [class~="va-navbox-container"], #toc, .toc, .mw-editsection, script, style, iframe, form, .printfooter, .catlinks, .noprint').remove();
  root.find('*').contents().filter((_, node) => node.type === 'comment').remove();
  root.find('img').each((_, element) => {
    const img = $(element);
    const src = safeUrl(img.attr('data-src') || img.attr('data-original') || img.attr('src'), sourceUrl);
    if (!src) { img.remove(); return; }
    img.attr({src, loading: 'lazy', decoding: 'async'});
    if (!img.parent('a').length) img.wrap($('<a>').attr({href: src, target: '_blank', rel: 'noopener noreferrer'}));
  });
  root.find('a').each((_, element) => {
    const link = $(element), href = link.attr('href');
    if (href?.startsWith('#')) return;
    const url = href ? safeUrl(href, sourceUrl) : '';
    if (url) link.attr({href: url, target: '_blank', rel: 'noopener noreferrer'});
    else link.removeAttr('href');
  });
  const metadata = {};
  const infobox = root.find('.va-infobox, .infobox, .portable-infobox').first();
  infobox.find('.va-infobox-label, th, .pi-data-label').each((_, element) => {
    const label = $(element).text().trim().toLowerCase();
    const value = $(element).closest('tr').find('.va-infobox-content, td').last().text().trim() || $(element).siblings('.pi-data-value').text().trim();
    if (label === 'given by' || label === 'trader') metadata.trader = value;
    if (label === 'location') metadata.location = value;
  });
  metadata.image = infobox.find('img').first().attr('src') || null;
  const fallbackHtml = cleanHtml(root.html() || '');
  infobox.remove();
  // Flatten layout wrappers containing section headings, without disturbing tables or lists.
  root.find('div, section').get().reverse().forEach(element => {
    if ($(element).find('h2').length) $(element).replaceWith($(element).contents());
  });
  const sections = [];
  let current = {title: 'Overview', id: 'Overview', html: ''};
  const flush = () => { const html = cleanHtml(current.html).trim(); if (html) sections.push({...current, html}); };
  const hasH2 = root.children('h2').length > 0;
  root.contents().each((_, element) => {
    if (element.type === 'tag' && (element.name === 'h2' || (!hasH2 && /^h[1-6]$/.test(element.name)))) {
      flush();
      const heading = $(element);
      current = {title: heading.text().trim(), id: heading.attr('id') || heading.find('[id]').first().attr('id') || `section-${sections.length}`, html: ''};
    } else current.html += $.html(element);
  });
  flush();
  return {title: page.title, pageid: page.pageid, revid: page.revid, images: page.images || [], sourceUrl, metadata, sections, fallbackHtml};
}
