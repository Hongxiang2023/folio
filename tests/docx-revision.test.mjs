import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {createDocx,generateDocx,extractDocx} from '../server/word.mjs';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const a={id:'a',pmid:'42092150',title:'First study',authors:'Doe, Jane',year:'2025',journal:'Journal A',notes:'PRIVATE',pdfPath:'/private/library.pdf'};
const b={id:'b',doi:'10.1234/computing',title:'Computing study',authors:'Smith, John',year:'2026',journal:'Proceedings B',cslType:'paper-conference'};
const c={id:'c',pmid:'42092151',title:'New study',authors:'Other, Anne',year:'2024',journal:'Journal C'};
const all=[a,b,c];
async function edit(buffer,fn){const zip=await JSZip.loadAsync(buffer);const doc=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml');await fn(doc,zip);zip.file('word/document.xml',new XMLSerializer().serializeToString(doc));return zip.generateAsync({type:'nodebuffer'});}
const nodes=(d,n)=>Array.from(d.getElementsByTagNameNS(W,n));
const tag=n=>nodes(n,'tag')[0]?.getAttributeNS(W,'val');
const citations=d=>nodes(d,'sdt').filter(n=>tag(n)?.startsWith('folio:citation:'));
const p=(doc,text)=>{const p=doc.createElementNS(W,'w:p'),r=doc.createElementNS(W,'w:r'),t=doc.createElementNS(W,'w:t');t.textContent=text;r.appendChild(t);p.appendChild(r);return p;};
test('revision imports identifiers and cited metadata only, adds new DOI and PMID markers, replaces bibliography, supports library removal',async()=>{
 const first=await createDocx('Original (42092150).',all,'apa');
 const imported=await extractDocx(first.buffer);assert.equal(imported.revision,true);assert.equal(imported.text,'Original (42092150).');assert.equal(imported.embeddedPapers.length,1);assert.equal(imported.embeddedPapers[0].notes,undefined);assert.equal(imported.embeddedPapers[0].pdfPath,undefined);
 const edited=await edit(first.buffer,doc=>{const body=nodes(doc,'body')[0];body.insertBefore(p(doc,'Added (DOI: 10.1234/computing) and (PMID: 42092151).'),body.firstChild);});
 const second=await generateDocx(edited,[b,c],'vancouver');assert.equal(second.bibliography.length,3);assert.equal(second.citations.length,3);assert.equal(second.unresolved.length,0);
 const third=await generateDocx(second.buffer,[],'apa');assert.equal(third.bibliography.length,3);const recovered=await extractDocx(third.buffer);assert.match(recovered.text,/Original \(42092150\)/);assert.doesNotMatch(recovered.text,/References/);assert.equal(recovered.embeddedPapers.length,3);
});
test('moved, copied and deleted citation controls regenerate in current manuscript order',async()=>{
 const first=await createDocx('Alpha (42092150).\nBeta (DOI: 10.1234/computing).',all,'vancouver');
 const edited=await edit(first.buffer,doc=>{const cs=citations(doc),body=nodes(doc,'body')[0],copy=p(doc,'Copied ');copy.appendChild(cs[1].cloneNode(true));body.insertBefore(copy,body.firstChild);cs[0].parentNode.removeChild(cs[0]);});
 const result=await generateDocx(edited,[],'vancouver');assert.equal(result.citations.length,2);assert.equal(result.bibliography.length,1);assert.match(result.bibliography[0],/Computing study/);assert.equal((await extractDocx(result.buffer)).embeddedPapers.length,1);
});
test('current library metadata replaces the embedded reference snapshot',async()=>{
 const first=await createDocx('Alpha (42092150).',[a],'apa');const result=await generateDocx(first.buffer,[{...a,title:'Corrected title'}],'apa');assert.match(result.bibliography[0],/Corrected title/);assert.doesNotMatch(result.bibliography[0],/First study/);
});
test('manually edited citations, bibliography, missing metadata and unsupported metadata fail safely',async()=>{
 const first=await createDocx('Alpha (42092150).',[a],'apa');
 await assert.rejects(generateDocx(await edit(first.buffer,doc=>{nodes(citations(doc)[0],'t')[0].textContent='Changed';}),all,'apa'),/generated citation was edited/);
 await assert.rejects(generateDocx(await edit(first.buffer,doc=>{const bib=nodes(doc,'sdt').find(n=>tag(n)==='folio:bibliography');nodes(bib,'t')[0].textContent='Changed heading';}),all,'apa'),/reference list was edited/);
 await assert.rejects(extractDocx(await edit(first.buffer,(_,zip)=>zip.remove('customXml/folioReferences.xml'))),/metadata is missing/);
 await assert.rejects(extractDocx(await edit(first.buffer,async(_,zip)=>zip.file('customXml/folioReferences.xml',(await zip.file('customXml/folioReferences.xml').async('string')).replace('"version":1','"version":99')))),/metadata is invalid/);
});
test('deleting all managed citations removes the reference list without duplicating ordinary text',async()=>{
 const first=await createDocx('Alpha (42092150).',[a],'apa');const edited=await edit(first.buffer,doc=>citations(doc).forEach(n=>n.parentNode.removeChild(n)));const result=await generateDocx(edited,[],'apa');assert.equal(result.bibliography.length,0);assert.equal((await extractDocx(result.buffer)).text,'Alpha .');
});
test('legacy generated documents do not infer identities from plain citation numbers',async()=>{
 const zip=new JSZip();zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Claim (1).</w:t></w:r></w:p><w:p><w:bookmarkStart w:id="1" w:name="FolioGeneratedReferences"/><w:r><w:t>References</w:t></w:r></w:p></w:body></w:document>`);await assert.rejects(extractDocx(await zip.generateAsync({type:'nodebuffer'})),/older generated document/);
});
test('a conflicting identity in the current library cannot silently change an existing citation',async()=>{
 const first=await createDocx('Alpha (FOLIO: b).',[b],'apa');await assert.rejects(generateDocx(first.buffer,[{...b,doi:'10.1234/different'}],'apa'),/conflicting or missing reference identifiers/);
});
test('revision style changes retain prose baseline and original emphasis around citations',async()=>{
 const first=await createDocx('Before (42092150) after.',[a],'nature');const result=await generateDocx(first.buffer,[],'apa');await edit(result.buffer,doc=>{const para=nodes(doc,'p')[0];const ordinary=nodes(para,'r').filter(r=>!citations(doc).some(c=>nodes(c,'r').includes(r)));assert.ok(ordinary.every(r=>!nodes(r,'vertAlign').length));assert.match(nodes(para,'t').map(n=>n.textContent).join(''),/Before \(Doe, 2025\) after\./);});
});
test('embedded metadata remains untrusted even when its checksum is recomputed',async()=>{
 const {createHash}=await import('node:crypto');const first=await createDocx('Alpha (42092150).',[a],'apa');
 for(const patch of [{title:''},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://secret:password@example.com'},{pmid:'bad'},{cslType:'unknown'}]){
  const altered=await edit(first.buffer,async(_,zip)=>{const doc=new DOMParser().parseFromString(await zip.file('customXml/folioReferences.xml').async('string'),'application/xml');const meta=JSON.parse(doc.documentElement.textContent);Object.assign(meta.papers[0],patch);const data=JSON.stringify(meta);doc.documentElement.textContent=data;doc.documentElement.setAttribute('checksum',createHash('sha256').update(data).digest('hex'));zip.file('customXml/folioReferences.xml',new XMLSerializer().serializeToString(doc));});
  await assert.rejects(extractDocx(altered),/Invalid embedded reference metadata/);
 }
});
async function wordRename(buffer){return edit(buffer,async(_,zip)=>{
 const old='customXml/folioReferences.xml',path='customXml/item1.xml';zip.file(path,await zip.file(old).async('string'));zip.remove(old);
 for(const name of ['word/_rels/document.xml.rels','[Content_Types].xml'])zip.file(name,(await zip.file(name).async('string')).replaceAll('folioReferences.xml','item1.xml'));
 const rel='word/_rels/document.xml.rels';zip.file(rel,(await zip.file(rel).async('string')).replace('</Relationships>','<Relationship Id="word-other" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item2.xml"/></Relationships>'));
 zip.file('customXml/item2.xml','<Sources xmlns="http://schemas.openxmlformats.org/officeDocument/2006/bibliography"><Source>Unrelated Word data</Source></Sources>');
});}
test('Word-renamed metadata survives repeated updates without altering unrelated custom XML',async()=>{
 const first=await createDocx('Alpha (42092150).',[a],'nature');let revised=await wordRename(first.buffer);
 for(const style of ['apa','nature','vancouver']){assert.equal((await extractDocx(revised)).revision,true);revised=(await generateDocx(revised,[],style)).buffer;const zip=await JSZip.loadAsync(revised);assert.ok(zip.file('customXml/item1.xml'));assert.equal(zip.file('customXml/folioReferences.xml'),null);assert.match(await zip.file('customXml/item2.xml').async('string'),/Unrelated Word data/);assert.equal((await zip.file('word/_rels/document.xml.rels').async('string')).match(/Target="..\/customXml\/item1.xml"/g).length,1);}
 const deleted=await edit(revised,doc=>citations(doc).forEach(n=>n.parentNode.removeChild(n)));const empty=await generateDocx(deleted,[],'apa');const zip=await JSZip.loadAsync(empty.buffer);assert.equal(zip.file('customXml/item1.xml'),null);assert.ok(zip.file('customXml/item2.xml'));for(const path of ['word/_rels/document.xml.rels','[Content_Types].xml'])assert.doesNotMatch(await zip.file(path).async('string'),/item1.xml/);
});
test('duplicate, unlinked, missing, external and traversal metadata targets fail safely',async()=>{
 const first=await wordRename((await createDocx('Alpha (42092150).',[a],'nature')).buffer);
 await assert.rejects(extractDocx(await edit(first,async(_,zip)=>zip.file('customXml/duplicate.xml',await zip.file('customXml/item1.xml').async('string')))),/Multiple Folio/);
 await assert.rejects(extractDocx(await edit(first,(_,zip)=>zip.remove('customXml/item1.xml'))),/metadata is missing/);
 await assert.rejects(extractDocx(await edit(first,async(_,zip)=>zip.file('word/_rels/document.xml.rels',(await zip.file('word/_rels/document.xml.rels').async('string')).replace(/<Relationship[^>]*Target="..\/customXml\/item1.xml"[^>]*\/>/,'')))),/relationship is missing/);
 for(const target of ['../../customXml/item1.xml','../customXml/../customXml/item1.xml','https://example.com/item1.xml','../customXml/%2e%2e/item1.xml'])await assert.rejects(extractDocx(await edit(first,async(_,zip)=>zip.file('word/_rels/document.xml.rels',(await zip.file('word/_rels/document.xml.rels').async('string')).replace('Target="../customXml/item1.xml"',`Target="${target}"`)))),/Unsafe custom XML/);
 await assert.rejects(extractDocx(await edit(first,async(_,zip)=>zip.file('word/_rels/document.xml.rels',(await zip.file('word/_rels/document.xml.rels').async('string')).replace('Target="../customXml/item1.xml"','TargetMode="External" Target="../customXml/item1.xml"')))),/External custom XML/);
});
test('Word whitespace conversion is accepted only when original bibliography integrity is proved',async()=>{
 const {createHash}=await import('node:crypto');const first=await createDocx('Alpha (42092150).',[a],'nature');
 for(const legacy of [false,true]){
  const changed=await edit(await wordRename(first.buffer),async(doc,zip)=>{
   const bib=nodes(doc,'sdt').find(n=>tag(n)==='folio:bibliography');nodes(bib,'t').forEach(t=>t.textContent=t.textContent.replace(/\n/g,' '));
   if(legacy){const mdoc=new DOMParser().parseFromString(await zip.file('customXml/item1.xml').async('string'),'application/xml'),meta=JSON.parse(mdoc.documentElement.textContent);delete meta.bibliographyText;const data=JSON.stringify(meta);mdoc.documentElement.textContent=data;mdoc.documentElement.setAttribute('checksum',createHash('sha256').update(data).digest('hex'));zip.file('customXml/item1.xml',new XMLSerializer().serializeToString(mdoc));}
  });
  assert.equal((await extractDocx(changed)).revision,true);
  const altered=await edit(changed,doc=>{const bib=nodes(doc,'sdt').find(n=>tag(n)==='folio:bibliography');nodes(bib,'t')[0].textContent+=' A new reference';});await assert.rejects(extractDocx(altered),/reference list was edited/);
 }
});
