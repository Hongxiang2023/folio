import { DOMParser } from '@xmldom/xmldom';

const MAX_RESPONSE = 4 * 1024 * 1024;
const PMID = /^[1-9]\d{0,8}$/;
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const elements = (node, tag) => Array.from(node.getElementsByTagName(tag));
const value = (node, tag) => clean(elements(node, tag)[0]?.textContent);
const normalizeDoi = input => clean(input).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();

export function parsePubmedXml(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_RESPONSE || /<!ENTITY\b/i.test(xml) || /<!DOCTYPE[^>]*\[/i.test(xml)) throw new Error('Unsafe or oversized PubMed response.');
  // PubMed supplies a public DTD declaration. Strip it; never resolve external resources.
  const safeXml = xml.replace(/<!DOCTYPE[^>]*>/gi, '');
  const doc = new DOMParser({ onError: () => { throw new Error('Invalid PubMed XML response.'); } }).parseFromString(safeXml, 'text/xml');
  return elements(doc, 'PubmedArticle').map(record => {
    const article = elements(record, 'Article')[0];
    const citation = elements(record, 'MedlineCitation')[0];
    if (!article || !citation) throw new Error('Incomplete PubMed record.');
    const pmid = value(citation, 'PMID');
    if (!PMID.test(pmid)) throw new Error('Invalid PMID in PubMed record.');
    const journalNode = elements(article, 'Journal')[0];
    const date = journalNode && elements(journalNode, 'PubDate')[0];
    const yearText = date ? value(date, 'Year') || value(date, 'MedlineDate').match(/\b\d{4}\b/)?.[0] || '' : '';
    const monthText = date ? value(date, 'Month') : '';
    const month = /^\d{1,2}$/.test(monthText) ? Number(monthText) : ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(monthText.toLowerCase().slice(0,3)) + 1;
    const day = date ? Number(value(date, 'Day')) : 0;
    const dateParts = yearText ? [Number(yearText)] : [];
    if (month >= 1 && month <= 12) { dateParts.push(month); if (day >= 1 && day <= 31) dateParts.push(day); }
    const cslAuthors = elements(article, 'Author').map(author => {
      const literal = value(author, 'CollectiveName');
      if (literal) return { literal };
      const family = value(author, 'LastName');
      const given = value(author, 'ForeName') || value(author, 'Initials');
      return family ? { family, given } : { literal: given };
    }).filter(author => author.family || author.literal);
    const doiId = elements(record, 'ArticleId').find(node => node.getAttribute('IdType') === 'doi');
    const doiLocation = elements(article, 'ELocationID').find(node => node.getAttribute('EIdType') === 'doi');
    return {
      pmid, title: value(article, 'ArticleTitle'), cslAuthors,
      authors: cslAuthors.map(author => author.literal || [author.family, author.given].filter(Boolean).join(', ')).join('; '),
      journal: journalNode ? value(journalNode, 'Title') : '',
      journalAbbreviation: journalNode ? value(journalNode, 'ISOAbbreviation') : '',
      year: yearText, dateParts, doi: normalizeDoi(doiId?.textContent || doiLocation?.textContent),
      volume: journalNode ? value(journalNode, 'Volume') : '', issue: journalNode ? value(journalNode, 'Issue') : '',
      pages: value(article, 'MedlinePgn'), sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    };
  });
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_WAIT = 15000;
function retryDelay(response, now, attempt) {
  const header = response.headers?.get('retry-after')?.trim();
  const parsed = header && (/^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now);
  return Math.max(1000 * 2 ** attempt, Number.isFinite(parsed) ? parsed : 0);
}
function unavailable(status, delay = 0) {
  const wait = Math.max(1, Math.ceil(delay / 1000));
  const error = new Error(status === 429
    ? `PubMed is temporarily rate-limiting requests (HTTP 429). Wait ${wait} seconds and generate again; the identifier has not been marked invalid.`
    : `PubMed is temporarily unavailable (HTTP ${status}). Try again in ${wait} seconds.`);
  error.code = status === 429 ? 'PUBMED_RATE_LIMIT' : 'PUBMED_UNAVAILABLE';
  error.retryAfterMs = delay;
  return error;
}
// The default instance shares a request queue and cooldown across all callers.
// Injecting transport and time makes retry behavior testable without real delays.
export function createPubmedLookup({ fetchImpl = (...args) => fetch(...args), now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let requestQueue = Promise.resolve(), nextRequest = 0, cooldownStatus = 429;
  function ncbi(endpoint, parameters) {
    const request = requestQueue.then(async () => {
      const url = new URL(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${endpoint}`);
      url.search = new URLSearchParams({ db: 'pubmed', tool: 'folio', ...parameters }).toString();
      let waited = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        // Keep request starts below NCBI's three-per-second limit, including retries.
        const delay = Math.max(0, nextRequest - now());
        if (delay > MAX_WAIT - waited) throw unavailable(cooldownStatus, delay);
        if (delay) { await sleep(delay); waited += delay; }
        nextRequest = now() + 350;
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { Accept: 'application/xml, application/json' } });
        if (!response.ok) {
          await response.body?.cancel();
          if (!RETRYABLE.has(response.status)) throw new Error(`PubMed is unavailable (HTTP ${response.status}). Check the identifier or try again later.`);
          const backoff = retryDelay(response, now(), attempt);
          nextRequest = Math.max(nextRequest, now() + backoff);
          cooldownStatus = response.status;
          if (attempt === 2 || backoff > MAX_WAIT - waited) throw unavailable(response.status, backoff);
          continue;
        }
        const reader = response.body.getReader();
        let size = 0;
        const chunks = [];
        try {
          for (;;) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            size += chunk.byteLength;
            if (size > MAX_RESPONSE) throw new Error('PubMed response is too large.');
            chunks.push(Buffer.from(chunk));
          }
        } finally { await reader.cancel(); }
        return Buffer.concat(chunks).toString('utf8');
      }
    });
    requestQueue = request.catch(() => {});
    return request;
  }
  return parameters => lookupWithClient(ncbi, parameters);
}
export const lookupPubmed = createPubmedLookup();

async function lookupWithClient(ncbi, { pmid, doi } = {}) {
  if (pmid !== undefined && pmid !== '') {
    const id = String(pmid).trim();
    if (!PMID.test(id)) throw new Error('Enter a PMID containing 1–9 digits, without a leading zero.');
    const records = parsePubmedXml(await ncbi('efetch.fcgi', { id, retmode: 'xml' }));
    const record = records.find(item => item.pmid === id);
    if (!record) throw new Error(`PubMed did not return PMID ${id}. Check the identifier and try again.`);
    return record;
  }
  const normalized = normalizeDoi(doi);
  if (!/^10\.\d{4,9}\/[^\s"\[\]]+$/i.test(normalized) || normalized.length > 512) throw new Error('Enter a valid DOI or PMID.');
  const response = JSON.parse(await ncbi('esearch.fcgi', { term: `"${normalized}"[DOI]`, retmode: 'json', retmax: '10' }));
  const ids = response.esearchresult?.idlist;
  if (!Array.isArray(ids) || !ids.length) throw new Error('PubMed could not match this DOI. The paper may be unindexed or metadata may differ; keep the DOI and add a verified PMID manually.');
  if (ids.some(id => !PMID.test(String(id))) || ids.length > 10) throw new Error('Unexpected PubMed search response.');
  const records = parsePubmedXml(await ncbi('efetch.fcgi', { id: ids.join(','), retmode: 'xml' }));
  const match = records.find(record => normalizeDoi(record.doi) === normalized);
  if (!match) throw new Error('PubMed returned no verified exact DOI match. No PMID was assigned; check the identifier or try again later.');
  return match;
}
