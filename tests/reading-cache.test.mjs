import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createFolioServer} from '../server/index.mjs';
import {readingCacheStore,validateReadingCache} from '../server/reading-cache.mjs';
const cache={version:1,pages:[{number:1,paragraphs:['Abstract','A useful result.']}],figures:[],warnings:[]};
test('regeneration replaces one cache and decompression retains its output limit',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-cache-store-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
 const store=readingCacheStore(dataDir),id='11111111-1111-1111-1111-111111111111',name=id+'.json.gz';
 await store.put(id,cache);
 const revised={...cache,pages:[{number:1,paragraphs:['Updated reading text.']}]};
 await store.put(id,revised);
 assert.deepEqual((await store.get(id)).cache,revised);
 assert.deepEqual(await readdir(path.join(dataDir,'reading-cache')),[name]);
 // Valid JSON whose padding expands beyond the read limit must be rejected,
 // even though its compressed file is small and its cache fields are valid.
 await writeFile(path.join(dataDir,'reading-cache',name),gzipSync(JSON.stringify(cache)+' '.repeat(32*1024*1024)));
 await assert.rejects(store.get(id),{status:400,message:'Reading cache could not be opened. Remove it and generate it again.'});
});
test('cache validation rejects unsafe images, malformed pages, and dangling figures',()=>{
 assert.throws(()=>validateReadingCache({...cache,pages:[{number:1,paragraphs:[],image:'https://example.org/track'}]}),/image/);
 assert.throws(()=>validateReadingCache({...cache,pages:[{number:3,paragraphs:[]}]}),/text/);
 assert.throws(()=>validateReadingCache({...cache,figures:[{page:1,label:'Figure 1',caption:'No image'}]}),/figure/);
 assert.throws(()=>validateReadingCache({...cache,version:2}),/cache/);
});
test('cache persists across restarts, stays out of backup, and can be removed without altering PDF',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-reading-'));let server,base;
 async function launch(){server=await createFolioServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;}
 await launch();t.after(async()=>{await new Promise(r=>server.close(r));await rm(dataDir,{recursive:true,force:true});});
 const {token}=await(await fetch(base+'/api/session')).json();const auth={Authorization:`Bearer ${token}`};
 const uploaded=await(await fetch(base+'/api/pdfs',{method:'POST',headers:{...auth,'Content-Type':'application/pdf'},body:'%PDF-fixture-original-bytes'})).json();
 const id=uploaded.pdfId,route='/api/reading-cache/'+id;
 const hash=async()=>createHash('sha256').update(await readFile(path.join(dataDir,'pdfs',id+'.pdf'))).digest('hex');const originalHash=await hash();
 const call=(method='GET',body)=>fetch(base+route,{method,headers:{...auth,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await fetch(base+route)).status,401);
 assert.equal((await(await call()).json()).cache,null);
 const saved=await(await call('PUT',cache)).json();assert.deepEqual(saved.cache,cache);assert.ok(saved.bytes>0);
 const stats=await(await fetch(base+'/api/storage',{headers:auth})).json();assert.equal(stats.cacheCount,1);assert.equal(stats.cacheBytes,saved.bytes);
 const backup=gunzipSync(Buffer.from(await(await fetch(base+'/api/backup',{headers:auth})).arrayBuffer()));assert.ok(!backup.includes(Buffer.from('reading-cache/')));
 await new Promise(r=>server.close(r));await launch();assert.deepEqual((await(await call()).json()).cache,cache);
 assert.equal((await call('DELETE')).status,200);assert.equal((await(await call()).json()).cache,null);assert.equal(await hash(),originalHash);
 assert.deepEqual(await readdir(path.join(dataDir,'reading-cache')),[]);
 assert.equal((await call('PUT',cache)).status,200);
 assert.equal((await fetch(base+'/api/pdfs/'+id,{method:'DELETE',headers:auth})).status,200);assert.deepEqual(await readdir(path.join(dataDir,'reading-cache')),[]);
 assert.equal((await call('PUT',cache)).status,404);
 // Bundled module workers must not be served as application/octet-stream under nosniff.
 const index=await fetch(base+'/papers');assert.match(index.headers.get('content-security-policy'),/worker-src 'self'/);
 const assets=await readdir(new URL('../dist/assets/',import.meta.url));const worker=assets.find(file=>file.endsWith('.mjs'));assert.ok(worker);
 const workerResponse=await fetch(base+'/assets/'+worker);assert.equal(workerResponse.headers.get('content-type'),'text/javascript');
});

test('synthetic section labels survive cache validation without replacing source paragraphs',()=>{
 const updated={...cache,layoutVersion:3,pages:[{number:1,paragraphs:['The original abstract text.'],headings:[{paragraph:0,title:'Abstract',level:1,synthetic:true}]}]};
 assert.deepEqual(validateReadingCache(updated),updated);
 assert.throws(()=>validateReadingCache({...updated,pages:[{...updated.pages[0],headings:[{paragraph:0,title:'Abstract',level:1,synthetic:'yes'}]}]}),/section/);
});

test('figure crops and cross-page captions round trip with bounds validation',()=>{
 const value={version:1,layoutVersion:6,pages:[{number:1,paragraphs:[],image:'data:image/jpeg;base64,YQ=='},{number:2,paragraphs:[]}],figures:[{page:1,label:'Fig. 1',caption:'Full legend',captionPage:2,crop:{x:.1,y:.1,width:.8,height:.6}}],warnings:[]};
 assert.deepEqual(validateReadingCache(value),value);
 for(const crop of [{x:0,y:0,width:2,height:1},{x:-.1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:NaN,y:0,width:1,height:1}])assert.throws(()=>validateReadingCache({...value,figures:[{...value.figures[0],crop}]}),/crop/);
 assert.throws(()=>validateReadingCache({...value,figures:[{...value.figures[0],captionPage:3}]}),/caption page/);
});
test('equation images round trip and reject unsafe images or invalid anchors',()=>{
 const value={...cache,pages:[{number:1,paragraphs:['Equation'],equations:[{paragraph:0,image:'data:image/jpeg;base64,YQ=='}]}]};assert.deepEqual(validateReadingCache(value),value);
 for(const equation of [{paragraph:3,image:'data:image/jpeg;base64,YQ=='},{paragraph:0,image:'https://example.org/equation'}])assert.throws(()=>validateReadingCache({...value,pages:[{...value.pages[0],equations:[equation]}]}),/equation/);
});
