import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCitations, listStyles } from '../server/citations.mjs';
const a = { pmid:'12345678', title:'Alpha study', authors:'Smith, John', cslAuthors:[{family:'Smith',given:'John'}], year:'2024', journal:'Nature', volume:'12', issue:'2', pages:'11-19', doi:'10.1234/alpha' };
const b = { ...a, pmid:'87654321', title:'Beta study' };
test('repeated and grouped Vancouver citations share one ordered bibliography', () => {
 const r = generateCitations('First (87654321). Both (12345678; 87654321). Again (87654321).', [a,b], 'vancouver');
 assert.equal(r.bibliography.length,2); assert.match(r.bibliography[0],/Beta study/);
 assert.equal(r.citations[0].replacement,r.citations[2].replacement); assert.match(r.citations[1].replacement,/1.*2/);
});
test('unknown grouped markers stay intact, years and ordinary prose stay intact', () => {
 const r = generateCitations('Year (2024); missing (12345678, 99999999); known (PMID: 12345678).', [a]);
 assert.match(r.text,/Year \(2024\); missing \(12345678, 99999999\)/); assert.deepEqual(r.unresolved,['99999999']); assert.equal(r.citations.length,1);
 assert.equal(r.citations[0].original,'(PMID: 12345678)');
});
test('short PMIDs require explicit prefix', () => {
 const r = generateCitations('(123) (PMID: 123)',[{...a,pmid:'123'}]); assert.ok(r.text.startsWith('(123) (Smith')); assert.equal(r.citations.length,1);
});
test('author-date disambiguation updates earlier citations and sorted bibliography', () => {
 for (const style of ['apa','chicago-author-date']) {
  const r = generateCitations('(87654321) then (12345678) then (87654321)', [a,b], style);
  assert.match(r.citations[0].replacement,/2024b/); assert.match(r.citations[1].replacement,/2024a/); assert.equal(r.citations[0].replacement,r.citations[2].replacement); assert.match(r.bibliography[0],/Alpha/);
 }
});
test('styles are real CSL, generation is pure, metadata remains literal in text and safe HTML', () => {
 assert.equal(listStyles().length,9);
 const papers=[{...a,title:'A & B <i>literal</i> <script>alert(1)</script>'}]; const snapshot=JSON.stringify(papers);
 const r=generateCitations('Hello\n(12345678)\nEnd',papers);
 assert.ok(r.text.startsWith('Hello\n')); assert.ok(r.text.endsWith('\nEnd')); assert.ok(r.bibliography[0].includes('A & B <i>literal</i>'));
 assert.ok(!r.bibliographyHtml[0].includes('<script>')); assert.match(r.bibliographyHtml[0],/&lt;script&gt;/); assert.match(r.bibliographyHtml[0],/<i>Nature<\/i>/); assert.equal(JSON.stringify(papers),snapshot);
 assert.throws(()=>generateCitations('',[],'made-up'),/Unsupported/);
 assert.deepEqual(generateCitations('No citation (2024)',[]).bibliography,[]);
});
test('all nine bundled styles render offline, including superscripts and dependent journal aliases',()=>{
 assert.equal(listStyles().length,9);
 for(const {id} of listStyles()){
  const result=generateCitations('Example (12345678).',[a],id);
  assert.equal(result.citations.length,1);assert.equal(result.bibliography.length,1);
  if(['nature','cell','the-new-england-journal-of-medicine','nature-medicine'].includes(id))assert.match(result.citations[0].replacementHtml,/<sup>1<\/sup>/);
 }
 assert.deepEqual(generateCitations('(12345678)',[a],'nature').bibliography,generateCitations('(12345678)',[a],'nature-medicine').bibliography);
});

test('DOI, arXiv, and library identifiers support CS papers without PubMed IDs', () => {
 const cs = {id:'cs-paper',title:'Attention architecture',authors:'Vaswani, Ashish',cslAuthors:[{family:'Vaswani',given:'Ashish'}],year:'2017',journal:'NeurIPS',doi:'10.5555/3295222.3295349',arxivId:'1706.03762',cslType:'paper-conference'};
 const local = {...cs,id:'local-only',title:'Local workshop paper',doi:'',arxivId:''};
 const r = generateCitations('(doi:10.5555/3295222.3295349) [arxiv:1706.03762v7] (folio:cs-paper; folio:local-only)',[cs,local],'ieee');
 assert.equal(r.citations.length,3);assert.equal(r.bibliography.length,2);
 assert.equal(r.citations[0].replacement,r.citations[1].replacement);
 assert.deepEqual(r.citations[2].paperIds,['cs-paper','local-only']);
 assert.match(r.bibliography.join('\n'),/Attention architecture/);
 assert.deepEqual(r.unresolved,[]);
});
test('mixed identifier groups collapse aliases and preserve unknown groups atomically',()=>{
 const r=generateCitations('(PMID:12345678; DOI:10.1234/ALPHA) [doi:10.1234/missing; PMID:12345678] (arxiv:1706.03762)',[a]);
 assert.equal(r.bibliography.length,1);assert.equal(r.citations.length,1);
 assert.equal(r.citations[0].pmids.length,1);
 assert.deepEqual(r.unresolved,['doi:10.1234/missing','arxiv:1706.03762']);
 assert.ok(r.text.includes('[doi:10.1234/missing; PMID:12345678]'));
});
test('explicit square markers never capture numeric citations, years, or equations',()=>{
 const source='[1] [12345678] (2024) (x + 12345678) (doi:invalid) [PMID:12345678]';
 const r=generateCitations(source,[a]);
 assert.equal(r.citations.length,1);assert.ok(r.text.startsWith('[1] [12345678] (2024) (x + 12345678) (doi:invalid)'));
});
test('DOI suffix parentheses and old arXiv IDs are recognized',()=>{
 const papers=[{...a,pmid:'',doi:'10.1000/(SICI)1234',id:'doi'}, {...a,pmid:'',doi:'',arxivId:'cs/9901001',id:'arxiv'}];
 const r=generateCitations('(doi:10.1000/(SICI)1234) [arxiv:cs/9901001v2]',papers);
 assert.equal(r.citations.length,2);assert.equal(r.bibliography.length,2);
});
test('duplicate imports share citations but conflicting PMIDs do not silently merge',()=>{
 const duplicate={...a,id:'duplicate',pmid:''};
 const r=generateCitations('(12345678) (folio:duplicate)',[{...a,id:'first'},duplicate],'vancouver');
 assert.equal(r.bibliography.length,1);assert.equal(r.citations[0].replacement,r.citations[1].replacement);
 const conflict=generateCitations('(12345678) (87654321) (doi:10.1234/alpha)',[a,b]);
 assert.equal(conflict.bibliography.length,2);assert.ok(conflict.text.endsWith('(doi:10.1234/alpha)'));
 assert.deepEqual(conflict.unresolved,['doi:10.1234/alpha']);
});
test('conference metadata is passed to CSL using the supplied type',()=>{
 const styleXml='<?xml version="1.0" encoding="utf-8"?><style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text"><info><title>Type test</title><id>test</id></info><citation><layout><text variable="title"/></layout></citation><bibliography><layout><choose><if type="paper-conference"><text value="Conference: "/></if><else><text value="Other: "/></else></choose><text variable="title"/></layout></bibliography></style>';
 const r=generateCitations('(folio:conference)',[{...a,id:'conference',pmid:'',cslType:'paper-conference'}],'apa',{styleXml});
 assert.match(r.bibliography[0],/^Conference: Alpha study/);
});
test('a fuller import joins DOI-only and PMID-only duplicate records',()=>{
 const papers=[{...a,id:'doi-only',pmid:''},{...a,id:'pmid-only',doi:''},{...a,id:'full'}];
 const r=generateCitations('(folio:doi-only) (12345678) (doi:10.1234/alpha) (folio:full)',papers,'vancouver');
 assert.equal(r.bibliography.length,1);assert.equal(new Set(r.citations.map(c=>c.replacement)).size,1);
});
