import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePubmedXml, lookupPubmed, createPubmedLookup } from '../server/pubmed.mjs';
const xml = `<?xml version="1.0"?><!DOCTYPE PubmedArticleSet PUBLIC "pubmed" "https://example.invalid/dtd"><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>42092150</PMID><Article><Journal><JournalIssue><Volume>12</Volume><Issue>3</Issue><PubDate><Year>2026</Year><Month>Sep</Month><Day>8</Day></PubDate></JournalIssue><Title>Example Journal</Title><ISOAbbreviation>Ex J</ISOAbbreviation></Journal><ArticleTitle>A <i>rich</i> title &amp; results</ArticleTitle><Pagination><MedlinePgn>123-9</MedlinePgn></Pagination><AuthorList><Author><LastName>Smith</LastName><ForeName>Jane A</ForeName></Author><Author><CollectiveName>The Research Group</CollectiveName></Author></AuthorList></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1234/ABC</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;
test('parses full authors, rich title, bibliographic detail, DOI and PMID', () => {
  const [record] = parsePubmedXml(xml);
  assert.equal(record.pmid, '42092150');
  assert.equal(record.title, 'A rich title & results');
  assert.deepEqual(record.cslAuthors, [{ family: 'Smith', given: 'Jane A' }, { literal: 'The Research Group' }]);
  assert.equal(record.authors, 'Smith, Jane A; The Research Group');
  assert.deepEqual(record.dateParts, [2026,9,8]);
  assert.equal(record.doi, '10.1234/abc');
  assert.equal(record.pages, '123-9');
  assert.equal(record.journalAbbreviation, 'Ex J');
});
test('handles seasonal MedlineDate and empty results', () => {
  assert.deepEqual(parsePubmedXml('<PubmedArticleSet/>'), []);
  const [record] = parsePubmedXml(xml.replace('<Year>2026</Year><Month>Sep</Month><Day>8</Day>', '<MedlineDate>2025 Winter</MedlineDate>'));
  assert.deepEqual(record.dateParts, [2025]);
});
test('rejects entity declarations, malformed XML and oversized responses', () => {
  assert.throws(() => parsePubmedXml('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x/>'), /Unsafe/);
  assert.throws(() => parsePubmedXml('<PubmedArticleSet><broken></PubmedArticleSet>'), /Invalid/);
  assert.throws(() => parsePubmedXml(' '.repeat(4 * 1024 * 1024 + 1)), /oversized/);
});
test('rejects invalid identifiers before networking', async () => {
  await assert.rejects(lookupPubmed({ pmid: '0123' }), /PMID/);
  await assert.rejects(lookupPubmed({ pmid: 'https://example.org' }), /PMID/);
  await assert.rejects(lookupPubmed({ doi: '10.1234/a" OR anything' }), /valid DOI/);
});
test('DOI lookup verifies fetched record and only calls the fixed NCBI host', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(new URL(url));
    assert.equal(url.hostname, 'eutils.ncbi.nlm.nih.gov');
    assert.equal(options.redirect, 'error');
    return new Response(url.pathname.endsWith('esearch.fcgi') ? JSON.stringify({ esearchresult: { idlist: ['42092150'] } }) : xml);
  };
  try {
    assert.equal((await lookupPubmed({ doi: 'https://doi.org/10.1234/ABC' })).pmid, '42092150');
    assert.equal(urls[0].searchParams.get('term'), '"10.1234/abc"[DOI]');
    await assert.rejects(lookupPubmed({ doi: '10.1234/mismatch' }), /no verified exact DOI match/);
  } finally { globalThis.fetch = originalFetch; }
});

function retryClient(responses) {
  let time = Date.UTC(2026, 8, 14), index = 0;
  const calls = [], sleeps = [];
  const lookup = createPubmedLookup({now:()=>time,sleep:async ms=>{sleeps.push(ms);time+=ms;},fetchImpl:async(url,options)=>{
    calls.push({time,url});assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
    const response=responses[index++];return typeof response === 'function' ? response(url,time) : response;
  }});
  return {lookup,calls,sleeps};
}
test('automatically recovers from an initial429 and honors Retry-After seconds',async()=>{
  const client=retryClient([new Response('',{status:429,headers:{'retry-after':'2'}}),new Response(xml)]);
  assert.equal((await client.lookup({pmid:'42092150'})).pmid,'42092150');
  assert.equal(client.calls.length,2);assert.deepEqual(client.sleeps,[2000]);
});
test('transient gateway errors use bounded exponential backoff',async()=>{
  for (const status of [502,503,504]) {
    const client=retryClient([new Response('',{status}),new Response('',{status}),new Response(xml)]);
    assert.equal((await client.lookup({pmid:'42092150'})).pmid,'42092150');
    assert.deepEqual(client.sleeps,[1000,2000]);assert.equal(client.calls.length,3);
  }
});
test('HTTP-date Retry-After is honored and queued callers share the cooldown',async()=>{
  const client=retryClient([(_url,time)=>new Response('',{status:429,headers:{'retry-after':new Date(time+4000).toUTCString()}}),new Response(xml),new Response(xml)]);
  const results=await Promise.all([client.lookup({pmid:'42092150'}),client.lookup({pmid:'42092150'})]);
  assert.equal(results.length,2);assert.deepEqual(client.sleeps,[4000,350]);
  assert.equal(client.calls[2].time-client.calls[1].time,350);
});
test('exhausted429 retries are actionable and preserve cooldown for the next caller',async()=>{
  const client=retryClient([new Response('',{status:429}),new Response('',{status:429}),new Response('',{status:429}),new Response(xml)]);
  await assert.rejects(client.lookup({pmid:'42092150'}),error=>error.code==='PUBMED_RATE_LIMIT' && error.retryAfterMs===4000 && /not been marked invalid/.test(error.message));
  assert.equal(client.calls.length,3);
  assert.equal((await client.lookup({pmid:'42092150'})).pmid,'42092150');
  assert.deepEqual(client.sleeps,[1000,2000,4000]);
});
test('long Retry-After fails promptly without violating provider cooldown',async()=>{
  const client=retryClient([new Response('',{status:429,headers:{'retry-after':'120'}})]);
  await assert.rejects(client.lookup({pmid:'42092150'}),error=>error.code==='PUBMED_RATE_LIMIT' && error.retryAfterMs===120000);
  await assert.rejects(client.lookup({pmid:'42092150'}),/Wait 120 seconds/);
  assert.equal(client.calls.length,1);assert.deepEqual(client.sleeps,[]);
});
test('invalid identifiers,404, malformed XML and oversized successful bodies are not retried',async()=>{
  const invalid=retryClient([]);await assert.rejects(invalid.lookup({pmid:'0123'}),/PMID/);assert.equal(invalid.calls.length,0);
  for (const [response,pattern] of [[new Response('',{status:404}),/HTTP 404/],[new Response('<PubmedArticleSet><broken>'),/Invalid/],[new Response(' '.repeat(4*1024*1024+1)),/too large/]]) {
    const client=retryClient([response]);await assert.rejects(client.lookup({pmid:'42092150'}),pattern);assert.equal(client.calls.length,1);
  }
});
test('DOI search and fetch retries use the same paced transport',async()=>{
  const client=retryClient([new Response('',{status:503}),Response.json({esearchresult:{idlist:['42092150']}}),new Response('',{status:429}),new Response(xml)]);
  assert.equal((await client.lookup({doi:'10.1234/abc'})).pmid,'42092150');
  assert.deepEqual(client.sleeps,[1000,350,1000]);
  assert.deepEqual(client.calls.map(c=>c.url.pathname.split('/').pop()),['esearch.fcgi','esearch.fcgi','efetch.fcgi','efetch.fcgi']);
});
