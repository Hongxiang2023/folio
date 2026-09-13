import CSL from 'citeproc';
import {citationDoi,referenceUrl,isPubMedUrl} from './reference-links.mjs';
import { resolveCitationMarkers } from './citation-identifiers.mjs';
export { parseCitationMarkers, normalizeCitationIdentifier, paperCitationIdentifiers, resolveCitationMarkers } from './citation-identifiers.mjs';
import { readFileSync } from 'node:fs';

const styles = [
  { id: 'apa', label: 'APA 7th edition' },
  { id: 'vancouver', label: 'Vancouver' },
  { id: 'chicago-author-date', label: 'Chicago 18th edition (author-date)' },
  { id: 'nature', label: 'Nature' },
  { id: 'science', label: 'Science' },
  { id: 'cell', label: 'Cell' },
  { id: 'the-new-england-journal-of-medicine', label: 'The New England Journal of Medicine' },
  { id: 'ieee', label: 'IEEE Reference Guide' },
  { id: 'nature-medicine', label: 'Nature Medicine', parent: 'nature' },
];
const xml = new Map(styles.map(s => [s.id, readFileSync(new URL(`./styles/${s.id}.csl`, import.meta.url), 'utf8')]));
const locale = readFileSync(new URL('./styles/locales-en-US.xml', import.meta.url), 'utf8');
const bundledLocales={'en-US':locale,'en-GB':readFileSync(new URL('./styles/locales-en-GB.xml', import.meta.url),'utf8')};
export function listStyles() { return styles.map(s => ({ ...s })); }
// CSL permits limited rich text in metadata. Escape user text so it stays literal.
const literal = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function authors(p) {
  if (p.cslAuthors?.length) return p.cslAuthors.map(a => Object.fromEntries(['family', 'given', 'literal'].filter(k => a[k]).map(k => [k, literal(a[k])])));
  return String(p.authors || '').split(';').map(s => s.trim()).filter(Boolean).map(name => {
    const comma = name.indexOf(',');
    if (comma >= 0) return { family: literal(name.slice(0, comma).trim()), given: literal(name.slice(comma + 1).trim()) };
    const words = name.split(/\s+/);
    return words.length > 1 ? { family: literal(words.pop()), given: literal(words.join(' ')) } : { literal: literal(name) };
  });
}
function item(p, id) {
  const year = Number(p.year);
  const parts = Array.isArray(p.dateParts) && p.dateParts.length && p.dateParts.every(Number.isInteger) ? p.dateParts.slice(0, 3) : year > 0 ? [year] : null;
  return {
    id, type: ['article-journal', 'paper-conference', 'article', 'book', 'chapter', 'report', 'thesis', 'manuscript'].includes(p.cslType || p.type) ? (p.cslType || p.type) : 'article-journal', title: literal(p.title), author: authors(p),
    'container-title': literal(p.journal), 'container-title-short': literal(p.journalAbbreviation),
    volume: literal(p.volume), issue: literal(p.issue), page: literal(p.pages),
    DOI: literal(citationDoi(p)), URL: literal(referenceUrl(p)), PMID: literal(p.pmid),
    publisher: literal(p.publisher), 'publisher-place': literal(p.publisherPlace),
    'event-title': literal(p.eventTitle),
    ...(parts ? { issued: { 'date-parts': [parts] } } : {}),
  };
}
function restoreLiteral(value, format) {
  // citeproc treats escaped metadata as literal text and escapes ampersands again in HTML.
  return format === 'html' ? value.replace(/(?:&#38;|&amp;)(amp|lt|gt);/g, '&$1;') : value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function render(style, items, markers, format, options={}) {
  const processor = new CSL.Engine({ retrieveLocale: lang => options.locales?.[lang] || options.locales?.[CSL.LANG_BASES[lang]?.replace('_','-')] || bundledLocales[lang] || locale, retrieveItem: id => items.get(String(id)) }, options.styleXml || xml.get(styles.find(s=>s.id===style)?.parent||style), options.locale || 'en-US', Boolean(options.locale));
  processor.setOutputFormat(format);
  const pre = [], rendered = [];
  for (const marker of markers) {
    const citationID = `folio-${pre.length}`;
    const result = processor.processCitationCluster({ citationID, citationItems: marker.pmids.map(id => ({ id })), properties: { noteIndex: 0 } }, pre, []);
    // Later clusters can change earlier citations (e.g. 2024a/2024b).
    for (const [index, value] of result[1]) rendered[index] = restoreLiteral(value, format);
    pre.push([citationID, 0]);
  }
  const bibliography = processor.makeBibliography();
  return { rendered, bibliography: bibliography ? bibliography[1].map(s => restoreLiteral(s.trim(), format)) : [] };
}

export function generateCitations(text, papers, styleId = 'apa', options={}) {
  if (typeof text !== 'string') throw new TypeError('Manuscript must be text.');
  if (!xml.has(styleId)&&!options.styleXml) throw new Error('Unsupported citation style.');
  const { markers, records, unresolved, warnings: resolutionWarnings } = resolveCitationMarkers(text, papers);
  const warnings = new Set(resolutionWarnings);
  const items = new Map();
  for (const marker of markers) for (const id of marker.pmids) {
    const p = records.get(id);
    if (!items.has(id)) {
      items.set(id, item(p, id));
      if(!referenceUrl(p)&&isPubMedUrl(p.sourceUrl||''))warnings.add(`Citation ${id}: only a PubMed record link is available. It is kept in your library but omitted as an article URL; verify the reference metadata and add a DOI or article URL if available.`);
      if(p.doi&&!citationDoi(p))warnings.add(`Citation ${id}: the DOI is invalid or belongs to a related publication rather than this arXiv preprint; review the cited version.`);
      const missing = ['title', 'authors', 'year', 'journal'].filter(k => !p[k] && !(k === 'authors' && p.cslAuthors?.length));
      if (missing.length) warnings.add(`Citation ${id} is missing ${missing.join(', ')}; review its reference metadata.`);
      if (!p.cslAuthors?.length && p.authors && !p.authors.includes(',')) warnings.add(`Citation ${id}: author names were inferred from text; verify family and given names.`);
    }
  }
  const plain = render(styleId, items, markers, 'text', options), html = render(styleId, items, markers, 'html', options);
  const citations = markers.map((m, i) => ({ ...m, replacement: plain.rendered[i], replacementHtml: html.rendered[i] }));
  let generated = '', cursor = 0;
  for (const c of citations) { generated += text.slice(cursor, c.start) + c.replacement; cursor = c.end; }
  generated += text.slice(cursor);
  return { text: generated, bibliography: plain.bibliography, bibliographyHtml: html.bibliography, citations, unresolved: [...unresolved], warnings: [...warnings] };
}
