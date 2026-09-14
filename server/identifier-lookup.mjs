import { DOMParser } from '@xmldom/xmldom';
import { normalizeCitationIdentifier } from './citation-identifiers.mjs';
import { lookupPubmed } from './pubmed.mjs';

const MAX_RESPONSE = 2 * 1024 * 1024;
const clean = input => typeof input === 'string' || typeof input === 'number' ? String(input).replace(/\s+/g, ' ').trim() : '';
const first = input => clean(Array.isArray(input) ? input[0] : input);
const namesText = authors => authors.map(a => a.literal || [a.family,a.given].filter(Boolean).join(', ')).join('; ');
function parseIdentifier(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter a PMID, DOI, or arXiv identifier.');
  const text = input.trim(), explicit = /^(pmid|doi|arxiv)\s*:\s*(.+)$/i.exec(text);
  const type = explicit ? explicit[1].toLowerCase() : /^[1-9]\d{0,8}$/.test(text) ? 'pmid' : /^(?:10\.|https?:\/\/(?:dx\.)?doi\.org\/)/i.test(text) ? 'doi' : 'arxiv';
  const value = normalizeCitationIdentifier(type, explicit ? explicit[2] : text);
  if (!value) throw new Error('Enter a valid PMID, DOI, or arXiv identifier.');
  return {type,value};
}
async function request(url, provider, fetchImpl) {
  const response = await fetchImpl(url, {signal:AbortSignal.timeout(12000), redirect:'error', headers:{Accept:provider === 'Crossref' ? 'application/json' : 'application/atom+xml', 'User-Agent':'Refhaven/1.0 (reference metadata lookup)'}});
  if (response.redirected || (response.url && new URL(response.url).origin !== url.origin)) throw new Error(`${provider} returned an unexpected redirect.`);
  if (!response.ok) throw new Error(`${provider} metadata is unavailable (HTTP ${response.status}). Try again later.`);
  if (Number(response.headers?.get('content-length')) > MAX_RESPONSE) throw new Error(`${provider} response is too large.`);
  if (!response.body?.getReader) throw new Error(`${provider} returned an empty response.`);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) throw new Error(`${provider} response is too large.`);
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}
function crossrefMetadata(text, doi) {
  let record;
  try { record = JSON.parse(text).message; } catch { throw new Error('Invalid Crossref metadata response.'); }
  if (!record || normalizeCitationIdentifier('doi', record.DOI) !== doi) throw new Error('Crossref returned a different DOI.');
  const title = first(record.title);
  if (!title) throw new Error('Crossref returned a record without a title.');
  const cslAuthors = (Array.isArray(record.author) ? record.author : []).map(a => {
    const family = clean(a.family), given = clean(a.given);
    return family ? {family,...(given ? {given} : {})} : {literal:clean(a.name) || given};
  }).filter(a => a.family || a.literal);
  const rawDate = (record.published || record['published-print'] || record['published-online'] || record.issued)?.['date-parts']?.[0];
  const dateParts = Array.isArray(rawDate) && rawDate.length && Number.isInteger(rawDate[0]) && rawDate[0] > 0 ? [rawDate[0]] : [];
  if (dateParts.length && Number.isInteger(rawDate[1]) && rawDate[1] >= 1 && rawDate[1] <= 12) {
    dateParts.push(rawDate[1]);
    if (Number.isInteger(rawDate[2]) && rawDate[2] >= 1 && rawDate[2] <= 31) dateParts.push(rawDate[2]);
  }
  const cslType = ({'proceedings-article':'paper-conference','posted-content':'article','book-chapter':'chapter','book':'book','monograph':'book','report':'report','dissertation':'thesis'})[record.type] || 'article-journal';
  return {title,doi,cslAuthors,authors:namesText(cslAuthors),journal:first(record['container-title']),journalAbbreviation:first(record['short-container-title']),year:dateParts.length ? String(dateParts[0]) : '',dateParts,volume:clean(record.volume),issue:clean(record.issue),pages:clean(record.page || record['article-number']),publisher:clean(record.publisher),publisherPlace:clean(record['publisher-location']),eventTitle:clean(record.event?.name),cslType,sourceUrl:`https://doi.org/${doi}`};
}
const atom = 'http://www.w3.org/2005/Atom', arxiv = 'http://arxiv.org/schemas/atom';
const nodes = (node, ns, name) => Array.from(node.getElementsByTagNameNS(ns,name));
const val = (node, ns, name) => clean(nodes(node,ns,name)[0]?.textContent);
function arxivMetadata(text, id) {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) throw new Error('Unsafe arXiv XML response.');
  const doc = new DOMParser({onError:() => {throw new Error('Invalid arXiv XML response.');}}).parseFromString(text,'text/xml');
  const entries = nodes(doc,atom,'entry');
  if (entries.length !== 1) throw new Error('No unique arXiv record was found.');
  const entry = entries[0], returnedId = val(entry,atom,'id');
  if (!/^https?:\/\/arxiv\.org\/abs\//i.test(returnedId) || normalizeCitationIdentifier('arxiv',returnedId) !== id) throw new Error('arXiv returned a different identifier.');
  const title = val(entry,atom,'title');
  if (!title) throw new Error('arXiv returned a record without a title.');
  // Atom supplies full names, not reliable family/given boundaries. Preserve them literally.
  const cslAuthors = nodes(entry,atom,'author').map(author => ({literal:val(author,atom,'name')})).filter(a => a.literal);
  const published = val(entry,atom,'published'), match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(published);
  const dateParts = match && Number(match[2]) >= 1 && Number(match[2]) <= 12 && Number(match[3]) >= 1 && Number(match[3]) <= 31 ? match.slice(1).map(Number) : [];
  return {title,arxivId:id,doi:normalizeCitationIdentifier('doi',val(entry,arxiv,'doi')) || '',cslAuthors,authors:namesText(cslAuthors),journal:'arXiv',year:dateParts.length ? String(dateParts[0]) : '',dateParts,cslType:'article',sourceUrl:`https://arxiv.org/abs/${id}`};
}
let arxivQueue = Promise.resolve(), nextArxivRequest = 0;
export async function lookupCitationIdentifier(identifier, {pubmedLookup=lookupPubmed,fetchImpl=fetch}={}) {
  const {type,value} = parseIdentifier(identifier);
  if (type === 'pmid') {
    const record = await pubmedLookup({pmid:value});
    if (!record?.title || String(record.pmid) !== value) throw new Error('PubMed returned incomplete or mismatched metadata.');
    return record;
  }
  if (type === 'doi') return crossrefMetadata(await request(new URL(`https://api.crossref.org/works/${encodeURIComponent(value)}`),'Crossref',fetchImpl),value);
  const url = new URL('https://export.arxiv.org/api/query');
  url.search = new URLSearchParams({id_list:value,max_results:'1'}).toString();
  // arXiv asks single-connection clients to leave three seconds between requests.
  const task = arxivQueue.then(async () => {
    if (fetchImpl === globalThis.fetch) {
      const delay = Math.max(0,nextArxivRequest-Date.now());
      if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
      nextArxivRequest = Date.now()+3000;
    }
    return arxivMetadata(await request(url,'arXiv',fetchImpl),value);
  });
  arxivQueue = task.catch(()=>{});
  return task;
}
