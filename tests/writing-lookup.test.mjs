import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {createFolioServer} from '../server/index.mjs';

const metadata={pmid:'42092150',title:'Temporary reference title',authors:'Doe, Jane',cslAuthors:[{family:'Doe',given:'Jane'}],year:'2025',journal:'Test Journal',doi:'10.1234/test',volume:'1',issue:'2',pages:'3-4',dateParts:[2025],sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/42092150/'};
const text='A finding (42092150).';
async function fixture(){
 const zip=new JSZip();
 zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
 return zip.generateAsync({type:'nodebuffer'});
}
async function files(dir){
 const result={};
 async function visit(relative=''){
  for(const entry of await readdir(path.join(dir,relative),{withFileTypes:true})){
   const name=path.join(relative,entry.name);
   if(entry.isDirectory())await visit(name);
   else result[name]=createHash('sha256').update(await readFile(path.join(dir,name))).digest('hex');
  }
 }
 await visit();return result;
}
async function setup(t){
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-writing-lookup-'));let lookups=0;
 const server=await createFolioServer({dataDir,pubmedLookup:async({pmid})=>{lookups++;assert.equal(pmid,metadata.pmid);return {...metadata};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`,{token}=await(await fetch(base+'/api/session')).json(),headers={Authorization:`Bearer ${token}`};
 const get=route=>fetch(base+route,{headers});
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const upload=async(route,papers)=>{
  const form=new FormData();form.append('document',new Blob([await fixture()]),'manuscript.docx');form.append('papers',typeof papers==='string'?papers:JSON.stringify(papers));
  return fetch(base+route+'?style=apa',{method:'POST',headers,body:form});
 };
 return {dataDir,get,post,upload,lookups:()=>lookups,raw:async route=>fetch(base+route+'?style=apa',{method:'POST',headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:await fixture()})};
}
async function documentText(response){assert.equal(response.status,200);const zip=await JSZip.loadAsync(await response.arrayBuffer());return zip.file('word/document.xml').async('string');}

test('PMID lookup and all citation exports use temporary metadata without changing library or files',async t=>{
 const api=await setup(t),before=await(await api.get('/api/library')).json(),beforeFiles=await files(api.dataDir);
 const response=await api.get('/api/pubmed?pmid=42092150');assert.equal(response.status,200);const paper=await response.json();
 const previewResponse=await api.post('/api/citations/preview',{text,style:'apa',papers:[paper]});assert.equal(previewResponse.status,200);
 const preview=await previewResponse.json();assert.deepEqual(preview.unresolved,[]);assert.match(preview.text,/Doe, 2025/);assert.equal(preview.bibliography.length,1);
 assert.match(await documentText(await api.post('/api/citations/word',{text,style:'apa',papers:[paper]})),/Temporary reference title/);
 const uploaded=await api.upload('/api/word/preview',[paper]);assert.equal(uploaded.status,200);assert.match((await uploaded.json()).text,/Doe, 2025/);
 assert.match(await documentText(await api.upload('/api/word/generate',[paper])),/Temporary reference title/);
 assert.deepEqual(await(await api.get('/api/library')).json(),before);assert.deepEqual(await files(api.dataDir),beforeFiles);assert.equal(api.lookups(),1);
 const withoutMetadata=await(await api.post('/api/citations/preview',{text,style:'apa'})).json();assert.deepEqual(withoutMetadata.unresolved,['42092150']);
 const saved=await api.post('/api/capture',{pmid:paper.pmid});assert.equal(saved.status,200);
 const after=await(await api.get('/api/library')).json();assert.equal(after.papers.length,1);assert.equal(after.papers[0].pmid,paper.pmid);assert.equal(after.revision,before.revision+1);assert.notDeepEqual(await files(api.dataDir),beforeFiles);
});

test('Saved library metadata wins over temporary metadata and legacy Word uploads still work',async t=>{
 const api=await setup(t);assert.equal((await api.post('/api/capture',{pmid:metadata.pmid})).status,200);
 const before=await(await api.get('/api/library')).json(),beforeFiles=await files(api.dataDir);
 const alternate={...metadata,title:'Conflicting transient title',authors:'Other, Person',cslAuthors:[{family:'Other',given:'Person'}]};
 const preview=await(await api.post('/api/citations/preview',{text,style:'apa',papers:[alternate]})).json();assert.match(preview.text,/Doe, 2025/);assert.doesNotMatch(preview.text,/Other/);
 assert.match(await documentText(await api.post('/api/citations/word',{text,style:'apa',papers:[alternate]})),/Temporary reference title/);
 assert.match((await(await api.upload('/api/word/preview',[alternate])).json()).text,/Doe, 2025/);
 const word=await documentText(await api.upload('/api/word/generate',[alternate]));assert.match(word,/Temporary reference title/);assert.doesNotMatch(word,/Conflicting transient title/);
 assert.match((await(await api.raw('/api/word/preview')).json()).text,/Doe, 2025/);
 assert.match(await documentText(await api.raw('/api/word/generate')),/Temporary reference title/);
 assert.deepEqual(await(await api.get('/api/library')).json(),before);assert.deepEqual(await files(api.dataDir),beforeFiles);
});

test('Malformed or excessive temporary metadata is rejected without persistence',async t=>{
 const api=await setup(t),before=await(await api.get('/api/library')).json(),beforeFiles=await files(api.dataDir);
 const invalid=[null,{},[null],[{...metadata,pmid:'invalid'}],[{...metadata,title:42}],[{...metadata,cslAuthors:'bad'}],Array.from({length:101},(_,i)=>({...metadata,pmid:String(42092150+i)}))];
 for(const papers of invalid){
  for(const route of ['/api/citations/preview','/api/citations/word'])assert.equal((await api.post(route,{text,style:'apa',papers})).status,400,`${route} rejects ${JSON.stringify(papers).slice(0,80)}`);
  for(const route of ['/api/word/preview','/api/word/generate'])assert.equal((await api.upload(route,papers)).status,400,`${route} rejects invalid metadata`);
 }
 assert.equal((await api.upload('/api/word/preview','{bad json')).status,400);
 assert.deepEqual(await(await api.get('/api/library')).json(),before);assert.deepEqual(await files(api.dataDir),beforeFiles);assert.equal(api.lookups(),0);
});
