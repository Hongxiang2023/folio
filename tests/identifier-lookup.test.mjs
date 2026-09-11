import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupCitationIdentifier} from '../server/identifier-lookup.mjs';
const crossref = {message:{DOI:'10.1145/123.456',title:['A CS paper'],author:[{family:'Smith',given:'Jane'},{name:'Research Team'}],type:'proceedings-article','container-title':['Conference on Computing'],'short-container-title':['CC'],published:{'date-parts':[[2025,8,2]]},page:'1-9',publisher:'ACM',event:{name:'Computing 2025'}}};
const feed = (id='1706.03762v7') => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry><id>http://arxiv.org/abs/${id}</id><title>Attention Is\n All You Need</title><published>2017-06-12T00:00:00Z</published><author><name>Ashish Vaswani</name></author><arxiv:doi>10.5555/3295222.3295349</arxiv:doi></entry></feed>`;
test('raw and explicit PMIDs delegate to the injected PubMed lookup',async()=>{
 for(const id of ['12345678','PMID: 12345678']){
  const record=await lookupCitationIdentifier(id,{pubmedLookup:async query=>{assert.deepEqual(query,{pmid:'12345678'});return {pmid:'12345678',title:'Paper'};},fetchImpl:()=>{throw Error('must not fetch');}});
  assert.equal(record.title,'Paper');
 }
 await assert.rejects(lookupCitationIdentifier('123',{pubmedLookup:async()=>({pmid:'456',title:'Wrong'})}),/mismatched/);
});
test('Crossref metadata preserves structured names and conference details',async()=>{
 const result=await lookupCitationIdentifier('DOI:10.1145/123.456',{fetchImpl:async(url,options)=>{
  assert.equal(url.origin,'https://api.crossref.org');assert.equal(decodeURIComponent(url.pathname),'/works/10.1145/123.456');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  return Response.json(crossref);
 }});
 assert.equal(result.title,'A CS paper');assert.equal(result.cslType,'paper-conference');assert.equal(result.eventTitle,'Computing 2025');assert.equal(result.publisher,'ACM');assert.equal(result.year,'2025');assert.deepEqual(result.dateParts,[2025,8,2]);assert.deepEqual(result.cslAuthors,[{family:'Smith',given:'Jane'},{literal:'Research Team'}]);assert.equal(result.pmid,undefined);
});
test('arXiv uses one exact metadata ID and preserves unstructured names honestly',async()=>{
 const result=await lookupCitationIdentifier('arxiv:1706.03762v7',{fetchImpl:async(url,options)=>{
  assert.equal(url.origin,'https://export.arxiv.org');assert.equal(url.searchParams.get('id_list'),'1706.03762');assert.equal(url.searchParams.get('max_results'),'1');assert.equal(options.redirect,'error');return new Response(feed());
 }});
 assert.equal(result.arxivId,'1706.03762');assert.equal(result.title,'Attention Is All You Need');assert.equal(result.cslType,'article');assert.equal(result.journal,'arXiv');assert.deepEqual(result.cslAuthors,[{literal:'Ashish Vaswani'}]);assert.equal(result.doi,'10.5555/3295222.3295349');assert.equal(result.sourceUrl,'https://arxiv.org/abs/1706.03762');
});
test('lookup accepts canonical provider URLs and rejects arbitrary URLs before networking',async()=>{
 assert.equal((await lookupCitationIdentifier('https://doi.org/10.1145/123.456',{fetchImpl:async()=>Response.json(crossref)})).doi,'10.1145/123.456');
 assert.equal((await lookupCitationIdentifier('https://arxiv.org/abs/cs/9901001',{fetchImpl:async()=>new Response(feed('cs/9901001v1'))})).arxivId,'cs/9901001');
 for(const id of ['https://evil.example/123','folio:local','doi:not-a-doi','arxiv:../secrets','']) await assert.rejects(lookupCitationIdentifier(id,{fetchImpl:()=>{throw Error('unexpected network');}}),/Enter a valid/);
});
test('provider mismatches, malformed XML, entities, and missing titles fail closed',async()=>{
 await assert.rejects(lookupCitationIdentifier('doi:10.1145/wrong',{fetchImpl:async()=>Response.json(crossref)}),/different DOI/);
 await assert.rejects(lookupCitationIdentifier('doi:10.1145/123.456',{fetchImpl:async()=>Response.json({message:{...crossref.message,title:[]}})}),/without a title/);
 for(const [xml,pattern] of [[feed('9999.99999'),/different identifier/],['<!DOCTYPE feed [<!ENTITY x "evil">]>'+feed(),/Unsafe/],['<feed><entry>',/Invalid/],[feed().replace(/<title>[\s\S]*?<\/title>/,''),/without a title/]]){
  await assert.rejects(lookupCitationIdentifier('arxiv:1706.03762',{fetchImpl:async()=>new Response(xml)}),pattern);
 }
});
test('HTTP errors, redirects, and oversized bodies fail without metadata',async()=>{
 await assert.rejects(lookupCitationIdentifier('doi:10.1145/123.456',{fetchImpl:async()=>new Response('',{status:429})}),/HTTP 429/);
 await assert.rejects(lookupCitationIdentifier('doi:10.1145/123.456',{fetchImpl:async()=>({redirected:true,url:'https://evil.example/'})}),/redirect/);
 for(const response of [new Response('x',{headers:{'content-length':String(3*1024*1024)}}),new Response('x'.repeat(2*1024*1024+1))]) await assert.rejects(lookupCitationIdentifier('doi:10.1145/123.456',{fetchImpl:async()=>response}),/too large/);
});
