import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/model.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {empty,valid,bib,deduplicate,importReferences,normalizedDoi,citationMarker}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('RIS preserves authors, DOI and collection defaults',()=>{
 const [p]=importReferences('TY  - JOUR\nTI  - A study\nAU  - Doe, Jane\nAU  - Smith, Jo\nPY  - 2025/01\nDO  - https://doi.org/10.1234/test\nER  -','ris');
 assert.equal(p.title,'A study');assert.equal(p.authors,'Doe, Jane; Smith, Jo');assert.equal(p.year,'2025');assert.equal(p.doi,'10.1234/test');assert.ok(valid(p));
});
test('portable backup imports remove device attachment IDs',()=>{
 const p={...empty(),title:'Paper',pdfId:'old-id',pdfName:'paper.pdf',collection:''};
 const [restored]=importReferences(JSON.stringify([p]),'json');assert.equal(restored.pdfId,undefined);assert.equal(restored.collection,'Unfiled');
 assert.throws(()=>importReferences('[{"title":"broken"}]','json'));
});
test('deduplication catches both IDs and DOI regardless of URL formatting',()=>{
 const p={...empty(),title:'Paper',doi:'10.1234/abc'};
 assert.equal(deduplicate([p],[{...p,doi:'10.1234/changed'}]).length,0);
 assert.equal(deduplicate([p],[{...p,id:'new',doi:'https://doi.org/10.1234/ABC'}]).length,0);
 assert.equal(normalizedDoi('doi:10.1234/abc'),'10.1234/abc');
});
test('BibTeX escapes values and author list',()=>{
 const p={...empty(),title:'A & B {study}',authors:'Doe, Jane; Roe, John'};
 assert.match(bib(p),/A \\& B \\{study\\}/);assert.match(bib(p),/Doe, Jane and Roe, John/);
});
test('RIS accession numbers become PMIDs only for identified PubMed records',()=>{
 assert.equal(importReferences('TY  - JOUR\nTI  - Sample\nAN  - 12345678\nER  -','ris')[0].pmid,undefined);
 assert.equal(importReferences('TY  - JOUR\nTI  - Sample\nAN  - 12345678\nDB  - PubMed\nER  -','ris')[0].pmid,'12345678');
});

test('conference import keeps proceedings type and export uses booktitle',()=>{
 const [p]=importReferences('TY  - CPAPER\nTI  - A CS paper\nT2  - Example Conference\nDO  - 10.1234/example\nER  -','ris');
 assert.equal(p.cslType,'paper-conference');assert.match(bib(p),/^@inproceedings/);assert.match(bib(p),/booktitle = \{Example Conference\}/);
 assert.equal(citationMarker(p),'(doi:10.1234/example)');assert.equal(citationMarker({...p,doi:'',arxivId:'1706.03762'}),'(arxiv:1706.03762)');assert.equal(citationMarker({...p,doi:''}),`(folio:${p.id})`);
});
