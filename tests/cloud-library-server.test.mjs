import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createFolioServer} from '../server/index.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function fixture(t,options={}) {
 const root=await mkdtemp(path.join(tmpdir(),'folio-cloud-http-'));
 const dataDir=path.join(root,'cloud'),localDataDir=path.join(root,'local');
 await mkdir(dataDir);await writeFile(path.join(dataDir,'library.json'),JSON.stringify({papers:[],collections:[],revision:0}));
 let server;
 t.after(async()=>{if(server?.listening)await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 server=await createFolioServer({dataDir,localDataDir,codexFactory:()=>({status:async()=>({installed:false,connected:false}),shutdown:async()=>{}}),secretStorage:{encrypt:s=>'wrapped-'+Buffer.from(s).toString('base64'),decrypt:s=>Buffer.from(s.slice(8),'base64').toString()},aiGenerate:async()=> 'Local conversation fixture [p. 1].',...options});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base=`http://127.0.0.1:${server.address().port}`;
 const {token}=await(await fetch(base+'/api/session')).json();
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const call=(route,method='GET',body,extra={})=>fetch(base+route,{method,headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const upload=bytes=>fetch(base+'/api/pdfs',{method:'POST',headers:{...headers,'Content-Type':'application/pdf'},body:bytes});
 return {dataDir,localDataDir,call,upload};
}

test('cloud library keeps PDFs/styles portable and credentials, reading cache, and chat local',async t=>{
 const f=await fixture(t);
 const location=await(await f.call('/api/library-location')).json();assert.equal(location.cloudFolder,true);assert.equal(location.localDataDir,f.localDataDir);
 const pdf=await(await f.upload('%PDF-cloud test')).json();
 assert.equal((await f.call('/api/capture','POST',{title:'Cloud paper',pdfId:pdf.pdfId})).status,200);
 assert.equal((await f.call('/api/reading-cache/'+pdf.pdfId,'PUT',{version:1,pages:[{number:1,paragraphs:['A scientific finding.']}],figures:[],warnings:[]})).status,200);
 assert.equal((await f.call('/api/ai/settings','POST',{provider:'openai',model:'fixture',key:'fixture-secret'})).status,200);
 const chat='/api/ai/papers/'+pdf.pdfId;
 assert.equal((await f.call(chat,'PUT',{enabled:true,provider:'openai'})).status,200);
 assert.equal((await f.call(chat,'POST',{question:'',summary:true})).status,200);
 const style='<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text"><info><title>Cloud fixture</title><id>http://www.zotero.org/styles/cloud-fixture</id></info><citation><layout><text variable="citation-number"/></layout></citation><bibliography><layout><text variable="title"/></layout></bibliography></style>';
 assert.equal((await f.call('/api/citations/style-import','POST',{xml:style})).status,200);
 assert.deepEqual((await readdir(f.dataDir)).sort(),['citation-styles','library.json','pdfs']);
 const localNames=await readdir(f.localDataDir);for(const name of ['connector-token','paper-chat','reading-cache'])assert.ok(localNames.includes(name));
 assert.ok((await readdir(path.join(f.localDataDir,'reading-cache'))).length>0);
 assert.ok((await readdir(path.join(f.dataDir,'citation-styles'))).length>0);
 assert.ok(!(await readFile(path.join(f.localDataDir,'paper-chat/settings.json'),'utf8')).includes('fixture-secret'));
 assert.equal(await readFile(path.join(f.dataDir,'pdfs',pdf.pdfId+'.pdf'),'utf8'),'%PDF-cloud test');
 const response=await f.call('/api/backup');assert.equal(response.status,200);
 const archive=gunzipSync(Buffer.from(await response.arrayBuffer()));
 assert.ok(archive.includes(Buffer.from('Local conversation fixture')));
 assert.ok(!archive.includes(Buffer.from('fixture-secret')));assert.ok(!archive.includes(Buffer.from('wrapped-')));assert.ok(!archive.includes(Buffer.from('connector-token')));
});

test('external metadata changes prevent overwriting another device and preserve disk contents',async t=>{
 const f=await fixture(t);const original=await(await f.call('/api/library')).json();
 const external=JSON.stringify({...original,collections:['From another device'],revision:8},null,2);
 await writeFile(path.join(f.dataDir,'library.json'),external);
 const put=await f.call('/api/library','PUT',original);assert.equal(put.status,409);assert.match((await put.json()).error,/outside Refhaven|changed/i);
 assert.equal((await f.call('/api/capture','POST',{title:'Conflicting paper'})).status,409);
 assert.equal(await readFile(path.join(f.dataDir,'library.json'),'utf8'),external);
 assert.equal((await(await f.call('/api/library')).json()).revision,original.revision);
});

test('native folder management rejects paired extensions and cancellation never moves',async t=>{
 let moved=0,revealed=0,restarted=0;
 const f=await fixture(t,{libraryLocation:{choose:async()=>null,move:async()=>{moved++;},reveal:async()=>{revealed++;},restart:()=>{restarted++;}}});
 const extension={Origin:'chrome-extension://'+'a'.repeat(32)};
 for(const [route,method] of [['/api/library-location','GET'],['/api/library-location/choose','POST'],['/api/library-location/reveal','POST']])assert.equal((await f.call(route,method,undefined,extension)).status,403);
 assert.equal((await f.call('/api/library-location/reveal','POST')).status,200);assert.equal(revealed,1);
 assert.deepEqual(await(await f.call('/api/library-location/choose','POST')).json(),{cancelled:true});
 assert.equal(moved,0);assert.equal(restarted,0);assert.equal((await f.call('/api/library')).status,200);
});

test('migration blocks concurrent API operations and failure restores the request gate',async t=>{
 const started=deferred(),finish=deferred();let restarts=0;
 const f=await fixture(t,{libraryLocation:{choose:async()=>'/fixture/target',move:async()=>{started.resolve();await finish.promise;},reveal:async()=>{},restart:()=>{restarts++;}}});
 const pending=f.call('/api/library-location/choose','POST');await started.promise;
 try {
  assert.equal((await f.call('/api/capture','POST',{title:'During migration'})).status,503);
  assert.equal((await f.upload('%PDF-during move')).status,503);
  assert.equal((await f.call('/api/library-location/choose','POST')).status,503);
 } finally {finish.reject(new Error('Fixture copy failed'));}
 const response=await pending;assert.equal(response.status,400);assert.match((await response.json()).error,/Fixture copy failed/);
 assert.equal(restarts,0);assert.equal((await f.call('/api/library')).status,200);
 assert.equal((await f.call('/api/capture','POST',{title:'After failed migration'})).status,200);
});

test('successful migration stays gated until the scheduled native restart',async t=>{
 const restarted=deferred();let moved;
 const f=await fixture(t,{libraryLocation:{choose:async()=>'/fixture/target',move:async target=>{moved=target;},reveal:async()=>{},restart:()=>restarted.resolve()}});
 const response=await f.call('/api/library-location/choose','POST');assert.equal(response.status,200);assert.deepEqual(await response.json(),{restarting:true});assert.equal(moved,'/fixture/target');
 assert.equal((await f.call('/api/library')).status,503);await restarted.promise;
});

test('cloud uploads do not hash cold existing PDFs but deduplicate files uploaded this session',async t=>{
 const f=await fixture(t);const coldId='00000000-0000-4000-8000-000000000001';const bytes='%PDF-cold cloud fixture';
 await writeFile(path.join(f.dataDir,'pdfs',coldId+'.pdf'),bytes);
 const firstResponse=await f.upload(bytes);assert.equal(firstResponse.status,201);const first=await firstResponse.json();assert.notEqual(first.pdfId,coldId);
 const second=await(await f.upload(bytes)).json();assert.equal(second.pdfId,first.pdfId);assert.equal(second.reused,true);
});

test('missing external library metadata fails closed instead of creating an empty replacement',async t=>{
 const f=await fixture(t);await rm(path.join(f.dataDir,'library.json'));
 const response=await f.call('/api/capture','POST',{title:'Must not recreate'});
 assert.equal(response.status,409);assert.match((await response.json()).error,/unavailable/i);
 assert.ok(!(await readdir(f.dataDir)).includes('library.json'));
});

test('stale cloud metadata cannot delete a PDF newly referenced by another device',async t=>{
 const f=await fixture(t);const bytes='%PDF-newly referenced elsewhere';
 const pdf=await(await f.upload(bytes)).json();
 const snapshot=await(await f.call('/api/library')).json();
 const paper={id:'external-paper',title:'From another device',authors:'',year:'',journal:'',doi:'',collection:'Inbox',tags:'',status:'To read',notes:'',starred:false,pdfId:pdf.pdfId};
 const external=JSON.stringify({...snapshot,revision:snapshot.revision+1,papers:[paper],collections:['Inbox']},null,2);
 await writeFile(path.join(f.dataDir,'library.json'),external);
 const response=await f.call('/api/pdfs/'+pdf.pdfId,'DELETE');
 assert.equal(response.status,409);assert.match((await response.json()).error,/changed|outside Refhaven/i);
 assert.equal(await readFile(path.join(f.dataDir,'pdfs',pdf.pdfId+'.pdf'),'utf8'),bytes);
 assert.equal(await readFile(path.join(f.dataDir,'library.json'),'utf8'),external);
});
