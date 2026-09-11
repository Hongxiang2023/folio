import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {extractDocx,generateDocx,createDocx} from '../server/word.mjs';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const paper={id:'fixture',pmid:'42092150',title:'A reference formatting example',authors:'Doe, Jane',cslAuthors:[{family:'Doe',given:'Jane'}],journal:'Example Journal',year:'2025',volume:'12',issue:'2',pages:'10-15',doi:'10.1234/example'};
async function fixture(body){const zip=new JSZip();zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`);zip.file('word/media/test.bin','untouched media');return zip.generateAsync({type:'nodebuffer'});}
test('Word markers spanning formatted runs and table cells preserve other package data',async()=>{
 const original=await fixture('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>See (420</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>92150) for detail.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Repeated (42092150).</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
 const before=Buffer.from(original);const result=await generateDocx(original,[paper],'apa');assert.equal(result.citations.length,2);assert.equal(result.bibliography.length,1);assert.deepEqual(original,before);
 const zip=await JSZip.loadAsync(result.buffer);const doc=await zip.file('word/document.xml').async('string');assert.match(doc,/Doe, 2025/);assert.match(doc,/<w:b\/>/);assert.match(doc,/<w:tbl>/);assert.equal(await zip.file('word/media/test.bin').async('string'),'untouched media');assert.equal((doc.match(/>References</g)||[]).length,1);assert.match(doc,/FolioGeneratedReferences/);
 assert.equal((await extractDocx(result.buffer)).text,(await extractDocx(original)).text);
});
test('Unknown markers and ordinary parenthetical years remain unchanged',async()=>{
 const input=await fixture('<w:p><w:r><w:t>Unknown (99999999), year (2024), known (42092150).</w:t></w:r></w:p>');const result=await generateDocx(input,[paper],'vancouver');assert.deepEqual(result.unresolved,['99999999']);assert.match(result.text,/\(99999999\)/);assert.match(result.text,/\(2024\)/);
});
test('Malformed archives and tracked changes fail without editing source',async()=>{
 await assert.rejects(extractDocx(Buffer.from('not a zip')),/valid .docx/);const input=await fixture('<w:p><w:ins><w:r><w:t>(42092150)</w:t></w:r></w:ins></w:p>');await assert.rejects(generateDocx(input,[paper],'apa'),/tracked changes/);
});
test('Pasted text exports a Word document with a generated bibliography',async()=>{
 const result=await createDocx('Reference workflow\nThe source supports this point (42092150).',[paper],'apa');const zip=await JSZip.loadAsync(result.buffer);assert.ok(zip.file('[Content_Types].xml'));assert.equal(result.unresolved.length,0);const doc=await zip.file('word/document.xml').async('string');assert.match(doc,/References/);assert.match(doc,/Example Journal/);assert.match(doc,/<w:i\/>/);
});

const superscriptStyle=`<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text"><info><title>Superscript fixture</title><id>http://www.zotero.org/styles/folio-superscript-fixture</id><updated>2026-09-09T00:00:00Z</updated></info><citation><layout vertical-align="sup"><text variable="citation-number"/></layout></citation><bibliography><layout><text variable="title"/></layout></bibliography></style>`;
async function parsedDocument(buffer){const {DOMParser}=await import('@xmldom/xmldom');const zip=await JSZip.loadAsync(buffer);return new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml');}
function firstParagraphRuns(doc){const p=doc.getElementsByTagNameNS(W,'p')[0];return Array.from(p.getElementsByTagNameNS(W,'r')).filter(r=>r.textContent).map(r=>({text:r.textContent,bold:r.getElementsByTagNameNS(W,'b').length>0,italic:r.getElementsByTagNameNS(W,'i').length>0,vertical:r.getElementsByTagNameNS(W,'vertAlign')[0]?.getAttributeNS(W,'val')}));}
test('Custom superscript CSL is retained in Word while split-marker surrounding text keeps its formatting',async()=>{
 const input=await fixture('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Before (420</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>92150) after.</w:t></w:r></w:p>');
 const result=await generateDocx(input,[paper],'custom-fixture',{styleXml:superscriptStyle});
 assert.deepEqual(firstParagraphRuns(await parsedDocument(result.buffer)),[
  {text:'Before ',bold:true,italic:false,vertical:undefined},
  {text:'1',bold:true,italic:false,vertical:'superscript'},
  {text:' after.',bold:false,italic:true,vertical:undefined},
 ]);
});
test('Several rich citations in one text run preserve their order and ordinary text baseline',async()=>{
 const result=await createDocx('First (42092150), second (42092150).',[paper],'custom-fixture',{styleXml:superscriptStyle});
 const runs=firstParagraphRuns(await parsedDocument(result.buffer));assert.equal(runs.map(r=>r.text).join(''),'First 1, second 1.');assert.deepEqual(runs.filter(r=>r.vertical==='superscript').map(r=>r.text),['1','1']);assert.ok(runs.filter(r=>r.text!=='1').every(r=>r.vertical===undefined));
});
test('Marker replacement preserves text siblings and tabs within its original Word run',async()=>{
 const input=await fixture('<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Start (42092150)</w:t><w:tab/><w:t>tail (42092150) end</w:t></w:r></w:p>');
 const result=await generateDocx(input,[paper],'custom-fixture',{styleXml:superscriptStyle});const doc=await parsedDocument(result.buffer);const runs=firstParagraphRuns(doc);assert.equal(runs.map(r=>r.text).join(''),'Start 1tail 1 end');assert.equal(doc.getElementsByTagNameNS(W,'tab').length,1);assert.equal(runs.filter(r=>r.vertical==='superscript').length,2);assert.ok(runs.every(r=>r.italic));
});
