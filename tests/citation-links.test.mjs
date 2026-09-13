import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {generateCitations} from '../server/citations.mjs';
import {citationDoi,referenceUrl,isPubMedUrl} from '../server/reference-links.mjs';
import {createDocx,generateDocx} from '../server/word.mjs';

const paper={id:'link-fixture',pmid:'12345678',title:'Reference link fixture',authors:'Smith, Jane',cslAuthors:[{family:'Smith',given:'Jane'}],year:'2024',journal:'Example Journal',volume:'12',pages:'1-9',doi:'10.1234/example',sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/12345678/'};
const render=(p,style='apa')=>generateCitations('(12345678)',[p],style);

test('reference navigation prefers DOI, article source, arXiv, then explicitly enabled PubMed',()=>{
 assert.equal(referenceUrl(paper),'https://doi.org/10.1234/example');
 assert.equal(referenceUrl({...paper,doi:'',sourceUrl:'https://publisher.example/article/123'}),'https://publisher.example/article/123');
 assert.equal(referenceUrl({...paper,doi:'',arxivId:'1706.03762'}),'https://arxiv.org/abs/1706.03762');
 assert.ok(!referenceUrl({...paper,doi:''}));
 assert.equal(referenceUrl({...paper,doi:''},{allowPubMed:true}),'https://pubmed.ncbi.nlm.nih.gov/12345678/');
});

test('PubMed detection distinguishes database records from PMC full text and lookalike hosts',()=>{
 assert.equal(isPubMedUrl('https://pubmed.ncbi.nlm.nih.gov/12345678/'),true);
 assert.equal(isPubMedUrl('https://www.ncbi.nlm.nih.gov/pubmed/12345678'),true);
 assert.equal(isPubMedUrl('https://pmc.ncbi.nlm.nih.gov/articles/PMC123/'),false);
 assert.equal(isPubMedUrl('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123/'),false);
 assert.equal(isPubMedUrl('https://pubmed.ncbi.nlm.nih.gov.evil.example/12345678/'),false);
});

test('APA, Vancouver and IEEE references use DOI rather than PubMed metadata provenance',()=>{
 for(const style of ['apa','vancouver','ieee']){
  const result=render(paper,style);assert.equal(result.bibliography.length,1);
  assert.ok(result.bibliography[0].includes('10.1234/example'));
  assert.ok(!result.bibliography[0].includes('pubmed.ncbi.nlm.nih.gov'));
  assert.ok(!result.bibliographyHtml[0].includes('pubmed.ncbi.nlm.nih.gov'));
 }
});

test('Nature preserves the bundled style omission of URLs for complete journal references',()=>{
 const result=render(paper,'nature');assert.match(result.bibliography[0],/Example Journal 12, 1–9 \(2024\)/);
 assert.ok(!result.bibliography[0].includes('https://'));
});

test('APA omits database-only URLs without losing PMID citation identity',()=>{
 const result=render({...paper,doi:''});assert.equal(result.citations.length,1);assert.deepEqual(result.unresolved,[]);
 assert.deepEqual(result.citations[0].identifiers,[{type:'pmid',value:'12345678',key:'pmid:12345678'}]);
 assert.ok(!result.bibliography[0].includes('pubmed'));assert.ok(!result.bibliography[0].includes('https://'));
 assert.match(result.bibliography[0],/Reference link fixture/);
});

test('a valid publisher URL without DOI remains in APA and Vancouver',()=>{
 for(const style of ['apa','vancouver']){
  const result=render({...paper,doi:'',sourceUrl:'https://publisher.example/articles/example'},style);
  assert.ok(result.bibliography[0].includes('https://publisher.example/articles/example'));
 }
});

test('unsafe source URLs are not emitted in references or navigation',()=>{
 for(const sourceUrl of ['javascript:alert(1)','data:text/html,private','file:///private/manuscript.pdf','https://username:secret@publisher.example/article']){
  const p={...paper,doi:'',sourceUrl};assert.ok(!referenceUrl(p));
  const result=render(p);assert.ok(!result.bibliography[0].includes(sourceUrl));assert.ok(!result.bibliographyHtml[0].includes(sourceUrl));
 }
});

test('DOI prefixes and resolver URLs normalize before CSL without duplicated URL prefixes',()=>{
 for(const doi of ['doi:10.1234/example','https://doi.org/10.1234/example','http://dx.doi.org/10.1234/example']){
  const p={...paper,doi};assert.equal(citationDoi(p),'10.1234/example');
  const result=render(p);assert.ok(result.bibliography[0].endsWith('https://doi.org/10.1234/example'));
  assert.ok(!result.bibliography[0].includes('https://doi.org/https://'));
 }
});

test('an arXiv preprint cites its arXiv version rather than a related published DOI',()=>{
 const preprint={...paper,cslType:'article',journal:'arXiv',arxivId:'1706.03762',sourceUrl:'https://arxiv.org/abs/1706.03762v7'};
 assert.ok(!citationDoi(preprint));assert.equal(referenceUrl(preprint),'https://arxiv.org/abs/1706.03762v7');
 const result=render(preprint);assert.ok(result.bibliography[0].includes('arxiv.org/abs/1706.03762v7'));
 assert.ok(!result.bibliography[0].includes('10.1234/example'));
});

test('Word export and revision keep corrected reference URLs without accumulating bibliographies',async()=>{
 const initial=await createDocx('Evidence (12345678).',[paper],'vancouver');
 const revised=await generateDocx(initial.buffer,[paper],'apa');
 for(const result of [initial,revised]){
  const zip=await JSZip.loadAsync(result.buffer);const xml=await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('https://doi.org/10.1234/example'));assert.ok(!xml.includes('pubmed.ncbi.nlm.nih.gov'));
  assert.equal((xml.match(/>References</g)||[]).length,1);
 }
 assert.equal(revised.bibliography.length,1);
});
