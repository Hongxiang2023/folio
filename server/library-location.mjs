import {mkdir,readFile,writeFile,rename,rm,rmdir,lstat,realpath,readdir,copyFile,open} from 'node:fs/promises';
import {createReadStream,constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
const fail=message=>Object.assign(new Error(message),{status:400});
async function syncDirectory(dir){let handle;try{handle=await open(dir,'r');await handle.sync();}catch(e){if(!['EINVAL','ENOTSUP','EBADF','EISDIR','EPERM'].includes(e.code))throw e;}finally{await handle?.close();}}
const configFile=dir=>path.join(dir,'library-location.json');
const journalFile=dir=>path.join(dir,'library-migration.json');
const contains=(parent,child)=>{const rel=path.relative(parent,child);return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
async function json(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw fail('Library location settings could not be read. Restore the local settings before continuing.');}}
async function atomic(file,value){const temp=file+'.'+randomUUID()+'.tmp';let committed=false;try{const f=await open(temp,'wx',0o600);try{await f.writeFile(JSON.stringify(value,null,2));await f.sync();}finally{await f.close();}await rename(temp,file);committed=true;await syncDirectory(path.dirname(file));}catch(error){if(committed)error.committed=true;throw error;}finally{try{await rm(temp,{force:true});}catch(error){if(committed)error.committed=true;throw error;}}}
async function plainPath(input,directory=true){
 if(typeof input!=='string'||!path.isAbsolute(input))throw fail('Choose an absolute library folder path.');
 const resolved=path.resolve(input),root=path.parse(resolved).root;let cursor=root;
 for(const part of path.relative(root,resolved).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);const info=await lstat(cursor);if(info.isSymbolicLink())throw fail('Library folders and their contents cannot use symbolic links.');}
 const info=await lstat(resolved);if(directory?!info.isDirectory():!info.isFile())throw fail('The library path has an unsupported file type.');return realpath(resolved);
}
async function digest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function library(file){await plainPath(file,false);let value;try{value=JSON.parse(await readFile(file,'utf8'));}catch{throw fail('The selected library metadata could not be opened.');}if(!value||!Array.isArray(value.papers)||!Number.isSafeInteger(value.revision)||value.revision<0||value.collections!==undefined&&!Array.isArray(value.collections))throw fail('The selected folder does not contain valid Folio library metadata.');return value;}
const brief=m=>({id:m.id,sourceDir:m.sourceDir,targetDir:m.targetDir,status:m.status,fileCount:m.files.length,bytes:m.files.reduce((n,f)=>n+f.size,0)});
function checked(m){if(!m||m.version!==1||typeof m.id!=='string'||!/^[a-f0-9-]{36}$/.test(m.id)||!['prepared','activated','cleaning'].includes(m.status)||!path.isAbsolute(m.sourceDir||'')||!path.isAbsolute(m.targetDir||'')||contains(m.sourceDir,m.targetDir)||contains(m.targetDir,m.sourceDir)||!Array.isArray(m.files)||new Set(m.files.map(f=>f?.name)).size!==m.files.length||!m.files.some(f=>f?.name==='library.json')||m.files.some(f=>!f||!/^library\.json$|^pdfs\/[a-f0-9-]{36}\.pdf$|^citation-styles\/[a-f0-9]{64}\.json$/.test(f.name)||!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{64}$/.test(f.hash)||typeof f.sourceExists!=='boolean'))throw fail('Library migration recovery metadata is invalid.');return m;}
async function journal(configDir,id){const m=checked(await json(journalFile(configDir)));if(id&&m.id!==id)throw fail('This library move is no longer current.');return m;}
async function verify(m,side,allowMissing=false){await plainPath(m[side+'Dir']);for(const f of m.files){if(side==='source'&&!f.sourceExists)continue;const file=path.join(m[side+'Dir'],f.name);try{await plainPath(file,false);if((await lstat(file)).size!==f.size||await digest(file)!==f.hash)throw fail('Library files changed during the move. Both copies have been retained for recovery.');}catch(e){if(allowMissing&&e.code==='ENOENT')continue;throw e;}}}
/** Local config/journal stay in configDir. No credential, chat or cache files move. */
export async function resolveLibraryLocation({configDir,defaultDataDir}){
 const config=await json(configFile(configDir)),raw=await json(journalFile(configDir));let migration=raw?checked(raw):null;
 if(config){if(config.version!==1||typeof config.dataDir!=='string'||!path.isAbsolute(config.dataDir))throw fail('Library location settings are invalid.');try{await plainPath(config.dataDir);await library(path.join(config.dataDir,'library.json'));}catch(e){throw fail('The selected library folder is unavailable or invalid. Restore its availability before opening Folio. '+e.message);}
  if(migration&&config.migrationId===migration.id&&config.dataDir===migration.targetDir&&migration.status==='prepared'){migration={...migration,status:'activated'};await atomic(journalFile(configDir),migration);}
  return {dataDir:config.dataDir,...(migration?{migration:brief(migration)}:{})};
 }
 return {dataDir:defaultDataDir,...(migration?{migration:brief(migration)}:{})};
}
export async function prepareLibraryMove({sourceDir,targetDir,configDir}){
 await mkdir(configDir,{recursive:true,mode:0o700});await plainPath(configDir);
 const recoveryWarnings=[];const previous=await json(journalFile(configDir));if(previous){if(checked(previous).status!=='prepared')throw fail('An earlier library move needs recovery before starting another.');recoveryWarnings.push(...(await cancelLibraryMove({configDir,migrationId:previous.id})).warnings);}
 sourceDir=await plainPath(sourceDir);targetDir=await plainPath(targetDir);
 if(contains(sourceDir,targetDir)||contains(targetDir,sourceDir)||contains(targetDir,path.resolve(configDir)))throw fail('Choose a separate empty folder outside the current library and local settings.');
 if((await readdir(targetDir)).some(name=>name!=='.DS_Store'))throw fail('Choose an empty dedicated folder for your Folio library.');
 const files=[];let value;try{value=await library(path.join(sourceDir,'library.json'));}catch(e){if(e.code!=='ENOENT')throw e;value={papers:[],collections:[],revision:0};}
 const names=['library.json'];
 for(const folder of ['pdfs','citation-styles']){let entries;try{await plainPath(path.join(sourceDir,folder));entries=await readdir(path.join(sourceDir,folder));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const name of entries){if(name==='.DS_Store')continue;if(!(folder==='pdfs'?/^[a-f0-9-]{36}\.pdf$/:/^[a-f0-9]{64}\.json$/).test(name))throw fail('The '+folder+' folder contains an unexpected file. Review it before moving the library.');names.push(folder+'/'+name);}
 }
 for(const name of names){const file=path.join(sourceDir,name);try{await plainPath(file,false);files.push({name,size:(await lstat(file)).size,hash:await digest(file),sourceExists:true});}catch(e){if(name!=='library.json'||e.code!=='ENOENT')throw e;const bytes=Buffer.from(JSON.stringify(value));files.push({name,size:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),sourceExists:false});}}
 for(const p of value.papers)if(p.pdfId&&!names.includes('pdfs/'+p.pdfId+'.pdf'))throw fail('A referenced PDF is missing. Restore it before moving the library.');
 const m={version:1,id:randomUUID(),sourceDir,targetDir,status:'prepared',files};
 // Record ownership before copying. An interruption never changes the active location.
 await atomic(journalFile(configDir),m);
 try{for(const f of files){const dest=path.join(targetDir,f.name);await mkdir(path.dirname(dest),{recursive:true,mode:0o700});await plainPath(path.dirname(dest));if(f.sourceExists)await copyFile(path.join(sourceDir,f.name),dest,constants.COPYFILE_EXCL);else await writeFile(dest,JSON.stringify(value),{flag:'wx',mode:0o600});const handle=await open(dest,'r');try{await handle.sync();}finally{await handle.close();}await syncDirectory(path.dirname(dest));}
 await syncDirectory(targetDir);await verify(m,'target');await verify(m,'source');return {...brief(m),warnings:recoveryWarnings};}catch(error){try{await cancelLibraryMove({configDir,migrationId:m.id});}catch{}throw error;}
}
export async function activateLibraryMove({configDir,migrationId}){
 const m=await journal(configDir,migrationId);if(m.status!=='prepared')throw fail('This library move is already activated.');
 await verify(m,'source');await verify(m,'target');await library(path.join(m.targetDir,'library.json'));
 const warnings=[];
 try{await atomic(configFile(configDir),{version:1,dataDir:m.targetDir,migrationId:m.id});}
 catch(error){
  // A rename can commit the new location before directory fsync reports failure.
  // Never let the old library resume writing after that commit.
  let selected;try{selected=await json(configFile(configDir));}catch{}
  if(!error.committed&&!(selected?.migrationId===m.id&&selected?.dataDir===m.targetDir))throw error;
  warnings.push('The new library location was selected, but its settings durability check needs recovery after restart.');
 }
 m.status='activated';try{await atomic(journalFile(configDir),m);}catch{warnings.push('The new library location was selected. Restart Folio to finish recording and cleaning up the move.');}
 return {dataDir:m.targetDir,migration:brief(m),warnings};
}
/** Call only after successful startup at target and while old-library writers are stopped.
 * A retry after interrupted cleanup tolerates files already removed, never changed files. */
export async function finalizeLibraryMove({configDir,migrationId}){
 const warnings=[];try{
  const m=await journal(configDir,migrationId),config=await json(configFile(configDir));if(!config||config.dataDir!==m.targetDir||config.migrationId!==m.id||m.status==='prepared')throw fail('Start the moved library successfully before cleaning up its old files.');
  await verify(m,'target');await verify(m,'source',m.status==='cleaning');m.status='cleaning';await atomic(journalFile(configDir),m);
  for(const f of m.files){if(!f.sourceExists)continue;const original=path.join(m.sourceDir,f.name);try{await plainPath(original,false);if(await digest(original)!==f.hash)throw fail('The old library changed; its remaining files were retained.');await rm(original);}catch(e){if(e.code!=='ENOENT')throw e;}}
  await rm(journalFile(configDir));return {completed:true,warnings};
 }catch(e){warnings.push('The new library location is selected, but old files were retained where possible: '+e.message);return {completed:false,warnings};}
}

/** Cancel an unactivated preparation. Only unchanged, owned target files are removed. */
export async function cancelLibraryMove({configDir,migrationId}){
 const m=await journal(configDir,migrationId),config=await json(configFile(configDir));if(m.status!=='prepared'||config?.migrationId===m.id)throw fail('An activated library move cannot be cancelled.');
 try{await verify(m,'target',true);}catch(error){await rm(journalFile(configDir));return {cancelled:true,warnings:['The unfinished target was retained because its contents changed or could not be verified. Choose a different empty target. '+error.message]};}
 for(const f of m.files)await rm(path.join(m.targetDir,f.name),{force:true});
 for(const folder of ['pdfs','citation-styles'])try{await rmdir(path.join(m.targetDir,folder));}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}
 await rm(journalFile(configDir));return {cancelled:true,warnings:[]};
}
