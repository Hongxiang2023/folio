import {mkdir,readFile,writeFile,rename,rm,stat,readdir} from 'node:fs/promises';
import {gzip as gzipCallback,gunzip as gunzipCallback} from 'node:zlib';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const fail=message=>Object.assign(new Error(message),{status:400});
const gzip=promisify(gzipCallback),gunzip=promisify(gunzipCallback);
export function validateReadingCache(value){
 const text=(s,max)=>typeof s==='string'&&s.length<=max;
 if(!value||value.version!==1||!Array.isArray(value.pages)||!value.pages.length||value.pages.length>500||!Array.isArray(value.figures)||value.figures.length>200||!Array.isArray(value.warnings)||value.warnings.length>20||!value.warnings.every(s=>text(s,1000)))throw fail('Invalid reading cache.');
 if(value.layoutVersion!==undefined&&(!Number.isSafeInteger(value.layoutVersion)||value.layoutVersion<1||value.layoutVersion>1000))throw fail('Invalid reading layout version.');
 for(let i=0;i<value.pages.length;i++){
  const p=value.pages[i];
  if(!p||p.number!==i+1||!Array.isArray(p.paragraphs)||p.paragraphs.length>5000||!p.paragraphs.every(s=>text(s,50000)))throw fail('Invalid reading text.');
  if(p.headings!==undefined&&(!Array.isArray(p.headings)||p.headings.length>500||p.headings.some(h=>!h||!Number.isInteger(h.paragraph)||h.paragraph<0||h.paragraph>=p.paragraphs.length||!text(h.title,1000)||!h.title.trim()||![1,2].includes(h.level)||(h.synthetic!==undefined&&typeof h.synthetic!=='boolean'))))throw fail('Invalid section heading.');
  if(p.equations!==undefined&&(!Array.isArray(p.equations)||p.equations.length>50||p.equations.some(e=>!e||!Number.isInteger(e.paragraph)||e.paragraph<0||e.paragraph>=p.paragraphs.length||!text(e.image,4000000)||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(e.image))))throw fail('Invalid equation.');
  if(p.image!==undefined&&(!text(p.image,4000000)||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.image)))throw fail('Invalid figure image.');
 }
 for(const f of value.figures)if(!f||!Number.isInteger(f.page)||!value.pages[f.page-1]?.image||!text(f.label,200)||!text(f.caption,50000))throw fail('Invalid figure reference.');
 for(const f of value.figures){
  const c=f.crop;if(c!==undefined&&(!c||!['x','y','width','height'].every(k=>Number.isFinite(c[k]))||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>1.000001||c.y+c.height>1.000001))throw fail('Invalid figure crop.');
  if(f.captionPage!==undefined&&(!Number.isInteger(f.captionPage)||!value.pages[f.captionPage-1]))throw fail('Invalid caption page.');
 }
 return {version:1,...(value.layoutVersion!==undefined?{layoutVersion:value.layoutVersion}:{}),pages:value.pages.map(p=>({number:p.number,paragraphs:p.paragraphs,...(p.equations?{equations:p.equations.map(e=>({paragraph:e.paragraph,image:e.image}))}:{}),...(p.headings?{headings:p.headings.map(h=>({paragraph:h.paragraph,title:h.title,level:h.level,...(h.synthetic?{synthetic:true}:{})}))}:{}),...(p.image?{image:p.image}:{})})),figures:value.figures.map(f=>({page:f.page,label:f.label,caption:f.caption,...(f.crop?{crop:{x:f.crop.x,y:f.crop.y,width:f.crop.width,height:f.crop.height}}:{}),...(f.captionPage!==undefined?{captionPage:f.captionPage}:{})})),warnings:value.warnings};
}
export function readingCacheStore(dataDir){
 const root=path.join(dataDir,'reading-cache');
 const file=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw fail('Invalid PDF identifier.');return path.join(root,`${id}.json.gz`);};
 return {
  async get(id){try{const raw=await readFile(file(id));return {cache:validateReadingCache(JSON.parse(await gunzip(raw,{maxOutputLength:32*1024*1024}))),bytes:raw.length};}catch(e){if(e.code==='ENOENT')return {cache:null,bytes:0};throw Object.assign(new Error('Reading cache could not be opened. Remove it and generate it again.'),{status:400});}},
  async put(id,value){const cache=validateReadingCache(value);const json=JSON.stringify(cache);if(Buffer.byteLength(json)>24*1024*1024)throw fail('Reading cache exceeds 24 MB. Use the original PDF for this paper.');const bytes=await gzip(json);await mkdir(root,{recursive:true,mode:0o700});const dest=file(id),temp=dest+'.'+randomUUID()+'.tmp';try{await writeFile(temp,bytes,{mode:0o600,flag:'wx'});await rename(temp,dest);}finally{await rm(temp,{force:true});}return {cache,bytes:bytes.length};},
  async remove(id){await rm(file(id),{force:true});return {deleted:true};},
  async stats(){let files;try{files=(await readdir(root)).filter(f=>f.endsWith('.json.gz'));}catch(e){if(e.code==='ENOENT')return {cacheBytes:0,cacheCount:0};throw e;}let cacheBytes=0,cacheCount=0;for(const name of files){try{cacheBytes+=(await stat(path.join(root,name))).size;cacheCount++;}catch(e){if(e.code!=='ENOENT')throw e;}}return {cacheBytes,cacheCount};}
 };
}
