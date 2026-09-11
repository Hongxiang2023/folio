import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {createFolioServer} from '../server/index.mjs';
import {createDocx} from '../server/word.mjs';
const doiPaper={id:'doi-paper',doi:'10.1234/doi-example',title:'A DOI-only reference',authors:'Rivera, Ana',cslAuthors:[{family:'Rivera',given:'Ana'}],year:'2025',journal:'Example Journal',volume:'3',pages:'10-20'};
const localPaper={id:'manual-paper',title:'A manual reference',authors:'Chen, Li',cslAuthors:[{family:'Chen',given:'Li'}],year:'2024',journal:'Local Research'};
const manuscript='Evidence (doi:10.1234/doi-example). Further evidence (folio:manual-paper).';
async function service(t,{papers=[],identifierLookup=async()=>{throw Error('Unexpected identifier lookup');},pubmedLookup=async()=>{throw Error('Unexpected PubMed lookup');}}={}){
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-manuscript-api-'));
 const library={papers:papers.map(p=>({collection:'Unfiled',tags:'',status:'To read',notes:'Private note stays private',starred:false,doi:'',...p})),revision:7,collections:['Unfiled']};
 const file=path.join(dataDir,'library.json');await writeFile(file,JSON.stringify(library));const original=await readFile(file);
 const server=await createFolioServer({dataDir,identifierLookup,pubmedLookup});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dataDir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const session=await(await fetch(base+'/api/session')).json();const headers={Authorization:`Bearer ${session.token}`};
 const call=(route,init={})=>fetch(base+route,{...init,headers:{...headers,...init.headers}});
 const json=(route,body)=>call(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const word=(route,buffer,papers)=>{const form=new FormData();form.append('document',new Blob([buffer]),'manuscript.docx');if(papers!==undefined)form.append('papers',JSON.stringify(papers));return call(route,{method:'POST',body:form});};
 return {call,json,word,async unchanged(){assert.deepEqual(await readFile(file),original);assert.deepEqual(await(await call('/api/library')).json(),library);}};
}
test('temporary DOI and local references preview and export without persisting metadata',async t=>{
 const s=await service(t);const body={text:manuscript,style:'apa',papers:[doiPaper,localPaper]};
 const response=await s.json('/api/citations/preview',body);assert.equal(response.status,200);const preview=await response.json();
 assert.equal(preview.citations.length,2);assert.equal(preview.bibliography.length,2);assert.deepEqual(preview.unresolved,[]);assert.match(preview.text,/Rivera/);assert.match(preview.text,/Chen/);
 const exported=await s.json('/api/citations/word',body);assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/wordprocessingml/);
 const zip=await JSZip.loadAsync(Buffer.from(await exported.arrayBuffer()));assert.ok(zip.file('word/document.xml'));
 await s.unchanged();
});
test('revised DOCX uses embedded references offline and preserves ordinary revisions through export',async t=>{
 const s=await service(t);const created=await createDocx(manuscript,[doiPaper,localPaper],'apa');const source=Buffer.from(created.buffer);
 const zip=await JSZip.loadAsync(source);zip.file('word/document.xml',(await zip.file('word/document.xml').async('string')).replace('Further evidence','Revised interpretation'));
 const revised=await zip.generateAsync({type:'nodebuffer'});
 const response=await s.word('/api/word/preview?style=vancouver',revised);assert.equal(response.status,200);const preview=await response.json();
 assert.deepEqual(preview.unresolved,[]);assert.equal(preview.citations.length,2);assert.match(preview.text,/Revised interpretation/);assert.equal(preview.bibliography.length,2);
 const exported=await s.word('/api/word/generate?style=vancouver',revised);assert.equal(exported.status,200);
 const output=await JSZip.loadAsync(Buffer.from(await exported.arrayBuffer())),xml=await output.file('word/document.xml').async('string');
 assert.match(xml,/Revised interpretation/);assert.equal((xml.match(/folio:bibliography/g)||[]).length,1);assert.deepEqual(created.buffer,source);
 await s.unchanged();
});
test('temporary metadata cannot overwrite authoritative library metadata and is not saved',async t=>{
 const s=await service(t,{papers:[doiPaper]});const response=await s.json('/api/citations/preview',{text:'Evidence (doi:10.1234/doi-example).',style:'apa',papers:[{...doiPaper,title:'Injected replacement title',notes:'Attempted private-note replacement'}]});
 assert.equal(response.status,200);const result=await response.json();assert.match(result.bibliography.join(' '),/A DOI-only reference/);assert.doesNotMatch(result.bibliography.join(' '),/Injected replacement/);await s.unchanged();
});
test('malformed and excessive temporary citation records are rejected without library writes',async t=>{
 const s=await service(t);
 for(const papers of [[{title:'No identifier'}],[{...doiPaper,doi:'not-a-doi'}],[{...localPaper,id:'contains spaces'}],[{...doiPaper,cslAuthors:[{family:12}]}],Array.from({length:101},(_,n)=>({...localPaper,id:'local-'+n}))]){
  const response=await s.json('/api/citations/preview',{text:manuscript,style:'apa',papers});assert.equal(response.status,400,JSON.stringify(papers).slice(0,200));
 }
 await s.unchanged();
});
test('edited citation display and corrupt embedded metadata fail with a repair error',async t=>{
 const s=await service(t);const created=await createDocx('Evidence (doi:10.1234/doi-example).',[doiPaper],'apa');
 const display=await JSZip.loadAsync(created.buffer);display.file('word/document.xml',(await display.file('word/document.xml').async('string')).replace('Rivera, 2025','Different, 2025'));
 const response=await s.word('/api/word/preview?style=apa',await display.generateAsync({type:'nodebuffer'}));assert.equal(response.status,400);assert.match((await response.json()).error,/edited|citation|restore/i);
 const corrupt=await JSZip.loadAsync(created.buffer);const metadata=Object.keys(corrupt.files).find(name=>name.startsWith('customXml/')&&name.endsWith('.xml'));assert.ok(metadata);
 corrupt.file(metadata,(await corrupt.file(metadata).async('string')).replace('A DOI-only reference','Corrupt reference'));
 const failed=await s.word('/api/word/preview?style=apa',await corrupt.generateAsync({type:'nodebuffer'}));assert.equal(failed.status,400);assert.match((await failed.json()).error,/metadata|intact/i);await s.unchanged();
});

test('identifier lookup is explicit, injectable, authenticated and does not save its result',async t=>{
 const calls=[];const s=await service(t,{identifierLookup:async(identifier,options)=>{calls.push(identifier);assert.equal(typeof options.pubmedLookup,'function');return doiPaper;}});
 const response=await s.call('/api/citations/lookup?identifier='+encodeURIComponent('doi:10.1234/doi-example'));assert.equal(response.status,200);assert.deepEqual(await response.json(),doiPaper);assert.deepEqual(calls,['doi:10.1234/doi-example']);
 const denied=await s.call('/api/citations/lookup?identifier=doi:10.1234/doi-example',{headers:{Authorization:''}});assert.equal(denied.status,401);assert.equal(calls.length,1);await s.unchanged();
});

test('revised local citation with contradictory DOI metadata is unresolved and cannot silently change the cited work',async t=>{
 const s=await service(t,{papers:[{...doiPaper,doi:'10.1234/different-work',title:'A different work'}]});
 const created=await createDocx('Evidence (folio:doi-paper).',[doiPaper],'apa');
 const response=await s.word('/api/word/preview?style=apa',created.buffer);assert.equal(response.status,200);const result=await response.json();assert.ok(result.unresolved.length);assert.doesNotMatch(result.bibliography.join(' '),/A different work/);
 const exported=await s.word('/api/word/generate?style=apa',created.buffer);assert.equal(exported.status,400);assert.match((await exported.json()).error,/resolve|conflict|reference|citation/i);await s.unchanged();
});

test('paired extension cannot invoke manuscript conversion routes',async t=>{
 const s=await service(t);const origin='chrome-extension://'+'a'.repeat(32);
 const response=await s.call('/api/citations/preview',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({text:manuscript,style:'apa',papers:[doiPaper,localPaper]})});assert.equal(response.status,403);
 const doc=await createDocx('Evidence (doi:10.1234/doi-example).',[doiPaper],'apa');
 const word=await s.call('/api/word/preview?style=apa',{method:'POST',headers:{Origin:origin,'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:doc.buffer});assert.equal(word.status,403);await s.unchanged();
});

test('explicit saving preserves DOI conference metadata without repeating provider lookup',async t=>{
 let requests=0;const s=await service(t,{pubmedLookup:async()=>{requests++;throw Error('Network lookup was not requested');}});
 const paper={...doiPaper,cslType:'paper-conference',publisher:'Example Society',publisherPlace:'Boston',eventTitle:'Example Conference',dateParts:[2025,6,12],issue:'2'};
 const response=await s.json('/api/capture',{...paper,lookup:false});assert.equal(response.status,200);const saved=await response.json();assert.equal(requests,0);assert.deepEqual(saved.warnings,[]);
 for(const key of ['doi','cslType','publisher','publisherPlace','eventTitle','dateParts','issue','volume','pages','cslAuthors'])assert.deepEqual(saved.paper[key],paper[key],key);
 const library=await(await s.call('/api/library')).json();assert.equal(library.revision,8);assert.equal(library.papers.length,1);assert.equal(library.papers[0].id,saved.paper.id);
 const preview=await s.json('/api/citations/preview',{text:'Evidence (doi:10.1234/doi-example).',style:'apa'});assert.equal(preview.status,200);assert.equal((await preview.json()).citations.length,1);assert.equal(requests,0);
});
