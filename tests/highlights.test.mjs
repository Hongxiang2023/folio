import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFolioServer} from '../server/index.mjs';
import {validateReadingCache} from '../server/reading-cache.mjs';
const cache={version:1,layoutVersion:2,pages:[{number:1,paragraphs:['Results','Useful text.'],headings:[{paragraph:0,title:'Results',level:1}]}],figures:[],warnings:[]};
test('section metadata round trips and legacy reading caches remain valid',()=>{
 assert.deepEqual(validateReadingCache(cache),cache);
 const legacy={version:1,pages:[{number:1,paragraphs:['Text']}],figures:[],warnings:[]};assert.deepEqual(validateReadingCache(legacy),legacy);
 for(const heading of [{paragraph:2,title:'Results',level:1},{paragraph:0,title:'',level:1},{paragraph:0,title:'Results',level:3}])assert.throws(()=>validateReadingCache({...cache,pages:[{...cache.pages[0],headings:[heading]}]}),/heading/);
 assert.throws(()=>validateReadingCache({...cache,layoutVersion:'2'}),/layout/);
});
test('highlights survive notes, capture, cache removal and library restart; malformed highlights are rejected',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-highlights-'));let server,base;
 const close=async()=>{if(server?.listening)await new Promise(r=>server.close(r));};
 async function launch(){server=await createFolioServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;}
 await launch();t.after(async()=>{await close();await rm(dataDir,{recursive:true,force:true});});
 const {token}=await(await fetch(base+'/api/session')).json();const auth={Authorization:`Bearer ${token}`};
 const call=(route,method='GET',body)=>fetch(base+route,{method,headers:{...auth,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const {pdfId}=await(await fetch(base+'/api/pdfs',{method:'POST',headers:{...auth,'Content-Type':'application/pdf'},body:'%PDF-original'})).json();
 const capture={title:'A paper',url:'https://example.org/paper',pdfId};
 assert.equal((await call('/api/capture','POST',capture)).status,200);
 let library=await(await call('/api/library')).json();
 const highlight={id:'highlight-1',pdfId,page:1,paragraph:1,start:0,end:6,quote:'Useful',createdAt:new Date().toISOString(),color:'blue',note:'Check this interpretation against Figure 2.'};
 library.papers[0].highlights=[highlight];library.papers[0].notes='A reading note';
 let response=await call('/api/library','PUT',library);assert.equal(response.status,200);library=await response.json();
 assert.equal((await call('/api/reading-cache/'+pdfId,'PUT',cache)).status,200);
 assert.equal((await call('/api/reading-cache/'+pdfId,'DELETE')).status,200);
 assert.equal((await call('/api/capture','POST',capture)).status,200);
 await close();await launch();library=await(await call('/api/library')).json();
 assert.deepEqual(library.papers[0].highlights,[highlight]);assert.equal(library.papers[0].notes,'A reading note');assert.equal((await(await call('/api/reading-cache/'+pdfId)).json()).cache,null);
 assert.equal(await readFile(path.join(dataDir,'pdfs',pdfId+'.pdf'),'utf8'),'%PDF-original');
 for(const highlights of [null,{},[...Array(5001)].map((_,i)=>({...highlight,id:String(i)})),[highlight,highlight],...[
 {id:''},{id:'x'.repeat(129)},{pdfId:'../bad'},{page:0},{paragraph:-1},{start:0.5},{end:0},{quote:'x'.repeat(10001)},{quote:'Wrong length'},{createdAt:'not a date'},{color:'red'},{color:42},{note:null},{note:'x'.repeat(10001)}
 ].map(change=>[{...highlight,...change}])]){
  const invalid={...library,papers:[{...library.papers[0],highlights}]};assert.equal((await call('/api/library','PUT',invalid)).status,400);
 }
 assert.deepEqual((await(await call('/api/library')).json()).papers[0].highlights,[highlight]);
 await close();const file=path.join(dataDir,'library.json');const disk=JSON.parse(await readFile(file,'utf8'));disk.papers[0].highlights=[{...highlight,start:-1}];await writeFile(file,JSON.stringify(disk));await assert.rejects(()=>createFolioServer({dataDir}),/highlights/);
 // Existing annotations without color or passage notes remain readable.
 const legacy={...highlight};delete legacy.color;delete legacy.note;disk.papers[0].highlights=[legacy];await writeFile(file,JSON.stringify(disk));await launch();assert.deepEqual((await(await call('/api/library')).json()).papers[0].highlights,[legacy]);await close();
 // Older libraries with no annotations still open normally.
 delete disk.papers[0].highlights;await writeFile(file,JSON.stringify(disk));await launch();assert.equal((await(await call('/api/library')).json()).papers[0].highlights,undefined);
});
