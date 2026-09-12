import test from 'node:test';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {resolveLibraryLocation,prepareLibraryMove,activateLibraryMove,finalizeLibraryMove,cancelLibraryMove} from '../server/library-location.mjs';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',style='a'.repeat(64);
async function setup(t,{empty=false}={}){
 const root=await mkdtemp(path.join(await realpath(tmpdir()),'folio-location-')),sourceDir=path.join(root,'local'),targetDir=path.join(root,'cloud');await mkdir(sourceDir);await mkdir(targetDir);t.after(()=>rm(root,{recursive:true,force:true}));
 const options={sourceDir,targetDir,configDir:sourceDir};
 if(!empty){await mkdir(path.join(sourceDir,'pdfs'));await writeFile(path.join(sourceDir,'library.json'),JSON.stringify({papers:[{id:'paper',title:'Local work',pdfId:id,notes:'Important annotation'}],revision:2,collections:['Research']}));await writeFile(path.join(sourceDir,'pdfs',id+'.pdf'),'%PDF original');await writeFile(path.join(sourceDir,'pdfs',other+'.pdf'),'%PDF unattached retained');await mkdir(path.join(sourceDir,'citation-styles'));await writeFile(path.join(sourceDir,'citation-styles',style+'.json'),'style metadata');}
 for(const folder of ['reading-cache','paper-chat'])await mkdir(path.join(sourceDir,folder));await writeFile(path.join(sourceDir,'connector-token'),'private token');await writeFile(path.join(sourceDir,'paper-chat','settings.json'),'private credentials');await writeFile(path.join(sourceDir,'paper-chat',id+'.json'),'local conversation');await writeFile(path.join(sourceDir,'reading-cache','cache'),'cache bytes');
 return {...options,root,resolve:()=>resolveLibraryLocation({configDir:sourceDir,defaultDataDir:sourceDir})};
}
test('move verifies data, selects target, then deletes only copied old files and keeps private state local',async t=>{
 const s=await setup(t),original=await readFile(path.join(s.sourceDir,'library.json'));const move=await prepareLibraryMove(s);assert.equal(move.status,'prepared');assert.equal(move.fileCount,4);assert.equal((await s.resolve()).dataDir,s.sourceDir);assert.deepEqual(await readFile(path.join(s.sourceDir,'library.json')),original);
 const activated=await activateLibraryMove({configDir:s.configDir,migrationId:move.id});assert.equal(activated.dataDir,s.targetDir);assert.equal((await s.resolve()).migration.status,'activated');
 assert.deepEqual(await readFile(path.join(s.targetDir,'library.json')),original);assert.equal(await readFile(path.join(s.targetDir,'pdfs',other+'.pdf'),'utf8'),'%PDF unattached retained');assert.deepEqual((await readdir(s.targetDir)).sort(),['citation-styles','library.json','pdfs']);
 assert.deepEqual(await finalizeLibraryMove({configDir:s.configDir,migrationId:move.id}),{completed:true,warnings:[]});assert.deepEqual(await readdir(path.join(s.sourceDir,'pdfs')),[]);assert.equal(await readFile(path.join(s.sourceDir,'connector-token'),'utf8'),'private token');assert.equal(await readFile(path.join(s.sourceDir,'paper-chat','settings.json'),'utf8'),'private credentials');assert.equal(await readFile(path.join(s.sourceDir,'reading-cache','cache'),'utf8'),'cache bytes');assert.equal((await s.resolve()).migration,undefined);
});
test('nonempty, contained and symlink targets fail without changing active library',async t=>{
 const s=await setup(t);await writeFile(path.join(s.targetDir,'personal.txt'),'keep');await assert.rejects(prepareLibraryMove(s),/empty/);assert.equal(await readFile(path.join(s.targetDir,'personal.txt'),'utf8'),'keep');
 const child=path.join(s.sourceDir,'nested');await mkdir(child);await assert.rejects(prepareLibraryMove({...s,targetDir:child}),/separate/);await assert.rejects(prepareLibraryMove({...s,targetDir:s.root}),/separate/);
 if(process.platform!=='win32'){const link=path.join(s.root,'link');await symlink(s.targetDir,link);await assert.rejects(prepareLibraryMove({...s,targetDir:link}),/symbolic/);}assert.equal((await s.resolve()).dataDir,s.sourceDir);
});
test('a new empty library can move without an existing metadata file',async t=>{
 const s=await setup(t,{empty:true}),move=await prepareLibraryMove(s);await activateLibraryMove({configDir:s.configDir,migrationId:move.id});assert.deepEqual(JSON.parse(await readFile(path.join(s.targetDir,'library.json'),'utf8')),{papers:[],collections:[],revision:0});assert.equal((await finalizeLibraryMove({configDir:s.configDir,migrationId:move.id})).completed,true);
});
test('missing configured cloud folder fails closed instead of creating an empty library',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);await activateLibraryMove({configDir:s.configDir,migrationId:move.id});await rm(s.targetDir,{recursive:true});await assert.rejects(s.resolve(),/unavailable/);assert.ok(await readFile(path.join(s.sourceDir,'library.json')));
});
test('changed source prevents activation and cancellation retains source changes',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);await writeFile(path.join(s.sourceDir,'pdfs',id+'.pdf'),'new source data');await assert.rejects(activateLibraryMove({configDir:s.configDir,migrationId:move.id}),/changed/);await cancelLibraryMove({configDir:s.configDir,migrationId:move.id});assert.deepEqual(await readdir(s.targetDir),[]);assert.equal(await readFile(path.join(s.sourceDir,'pdfs',id+'.pdf'),'utf8'),'new source data');
});
test('interrupted preparation can be retried while tampered target is retained for recovery',async t=>{
 const s=await setup(t);await prepareLibraryMove(s);await rm(path.join(s.targetDir,'pdfs',id+'.pdf'));const move=await prepareLibraryMove(s);assert.equal(move.status,'prepared');await writeFile(path.join(s.targetDir,'library.json'),'unrelated changed data');const cancelled=await cancelLibraryMove({configDir:s.configDir,migrationId:move.id});assert.equal(cancelled.cancelled,true);assert.ok(cancelled.warnings.length);assert.equal(await readFile(path.join(s.targetDir,'library.json'),'utf8'),'unrelated changed data');assert.ok(await readFile(path.join(s.sourceDir,'library.json')));
});
test('cleanup refuses changed target or source and preserves originals',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);await activateLibraryMove({configDir:s.configDir,migrationId:move.id});await writeFile(path.join(s.targetDir,'pdfs',id+'.pdf'),'changed');const result=await finalizeLibraryMove({configDir:s.configDir,migrationId:move.id});assert.equal(result.completed,false);assert.ok(result.warnings.length);assert.equal(await readFile(path.join(s.sourceDir,'pdfs',id+'.pdf'),'utf8'),'%PDF original');assert.ok(await readFile(path.join(s.sourceDir,'library.json')));
});
test('cleanup interrupted after deleting some originals resumes safely',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);await activateLibraryMove({configDir:s.configDir,migrationId:move.id});const file=path.join(s.configDir,'library-migration.json'),journal=JSON.parse(await readFile(file,'utf8'));journal.status='cleaning';await writeFile(file,JSON.stringify(journal));await rm(path.join(s.sourceDir,'library.json'));assert.equal((await finalizeLibraryMove({configDir:s.configDir,migrationId:move.id})).completed,true);assert.ok(await readFile(path.join(s.targetDir,'library.json')));
});
test('activation interrupted after config commit recovers as activated',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);await writeFile(path.join(s.configDir,'library-location.json'),JSON.stringify({version:1,dataDir:s.targetDir,migrationId:move.id}));assert.equal((await s.resolve()).migration.status,'activated');assert.equal((await finalizeLibraryMove({configDir:s.configDir,migrationId:move.id})).completed,true);
});

test('Finder metadata is ignored without moving or deleting unrelated files',async t=>{
 const s=await setup(t);for(const dir of [s.targetDir,path.join(s.sourceDir,'pdfs'),path.join(s.sourceDir,'citation-styles')])await writeFile(path.join(dir,'.DS_Store'),'finder metadata');
 const move=await prepareLibraryMove(s);assert.equal(move.fileCount,4);await cancelLibraryMove({configDir:s.configDir,migrationId:move.id});assert.deepEqual(await readdir(s.targetDir),['.DS_Store']);assert.equal(await readFile(path.join(s.sourceDir,'pdfs','.DS_Store'),'utf8'),'finder metadata');
});

async function withOpenFailure(t,intercept,operation){
 const original=fsPromises.open;t.mock.method(fsPromises,'open',async(...args)=>{const failure=intercept(...args);if(failure)throw Object.assign(new Error('Injected filesystem failure'),{code:'EIO'});return original(...args);});syncBuiltinESMExports();
 try{return await operation();}finally{t.mock.restoreAll();syncBuiltinESMExports();}
}
test('activation remains successful after config commit even when journal recording fails',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);
 const result=await withOpenFailure(t,file=>String(file).includes('library-migration.json.'),()=>activateLibraryMove({configDir:s.configDir,migrationId:move.id}));
 assert.equal(result.dataDir,s.targetDir);assert.equal(result.migration.status,'activated');assert.ok(result.warnings.length);
 assert.equal(JSON.parse(await readFile(path.join(s.configDir,'library-location.json'),'utf8')).dataDir,s.targetDir);
 assert.equal(JSON.parse(await readFile(path.join(s.configDir,'library-migration.json'),'utf8')).status,'prepared');
 assert.equal((await s.resolve()).migration.status,'activated');assert.ok(await readFile(path.join(s.sourceDir,'library.json')));
});
test('activation returns the committed location when directory sync fails after config rename',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);let injected=false;
 const result=await withOpenFailure(t,file=>{if(!injected&&file===s.configDir){injected=true;return true;}return false;},()=>activateLibraryMove({configDir:s.configDir,migrationId:move.id}));
 assert.equal(injected,true);assert.equal(result.dataDir,s.targetDir);assert.ok(result.warnings.length);assert.equal((await s.resolve()).dataDir,s.targetDir);assert.ok(await readFile(path.join(s.sourceDir,'library.json')));
});
test('a failure before config commit still rejects activation and leaves the original selected',async t=>{
 const s=await setup(t),move=await prepareLibraryMove(s);
 await withOpenFailure(t,file=>String(file).includes('library-location.json.'),()=>assert.rejects(activateLibraryMove({configDir:s.configDir,migrationId:move.id}),/Injected/));
 assert.equal((await s.resolve()).dataDir,s.sourceDir);assert.equal((await s.resolve()).migration.status,'prepared');
});

test('copied files use writable handles for durable flush, including read-only source documents',async t=>{
 const s=await setup(t),pdf=path.join(s.sourceDir,'pdfs',id+'.pdf');await fsPromises.chmod(pdf,0o444);const flushed=[];
 const original=fsPromises.open;t.mock.method(fsPromises,'open',async(file,flags,...rest)=>{
  if(typeof file==='string'&&file.startsWith(s.targetDir+path.sep)&&/\.(pdf|json)$/.test(file)){
   // Windows FlushFileBuffers rejects read-only handles; model that behavior.
   assert.equal(flags,'r+');flushed.push(file);
  }
  return original(file,flags,...rest);
 });syncBuiltinESMExports();
 try{const move=await prepareLibraryMove(s);assert.equal(flushed.length,move.fileCount);assert.equal(await readFile(path.join(s.targetDir,'pdfs',id+'.pdf'),'utf8'),'%PDF original');if(process.platform!=='win32')assert.equal((await fsPromises.stat(pdf)).mode&0o777,0o444);}
 finally{t.mock.restoreAll();syncBuiltinESMExports();await fsPromises.chmod(pdf,0o600);}
});
