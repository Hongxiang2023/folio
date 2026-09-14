import {mkdir,readFile,readdir,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import CSL from 'citeproc';
import {listStyles,generateCitations} from './citations.mjs';
const NS='http://purl.org/net/xbiblio/csl',MAX_XML=1024*1024;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const slug=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,199}$/.test(id);
const repo='https://raw.githubusercontent.com/citation-style-language/styles/v1.0.2/';
const localeRepo='https://raw.githubusercontent.com/citation-style-language/locales/master/';
const catalogURL='https://www.zotero.org/styles-files/styles.json';
const all=(node,name)=>Array.from(node.getElementsByTagNameNS(NS,name));
function parseXML(xml,root){
 if(typeof xml!=='string'||Buffer.byteLength(xml)>MAX_XML||/<!DOCTYPE|<!ENTITY/i.test(xml))throw fail('Choose a CSL XML file under 1 MB without external entities.');
 let doc;const errors=[];
 try{doc=new DOMParser({onError:(level,message)=>errors.push(message)}).parseFromString(xml,'application/xml');}catch{throw fail('The CSL XML is malformed.');}
 if(errors.length||doc.documentElement?.namespaceURI!==NS||doc.documentElement?.localName!==root)throw fail('The file is not valid CSL XML.');
 let count=0;function visit(n,depth){if(++count>20000||depth>40)throw fail('This CSL file is too complex.');for(const c of Array.from(n.childNodes||[]))visit(c,depth+1);}visit(doc,0);
 return doc;
}
export function inspectStyle(xml){
 const doc=parseXML(xml,'style'),root=doc.documentElement;
 if(!/^1\.0(?:\.[12])?$/.test(root.getAttribute('version')||''))throw fail('Only CSL 1.0–1.0.2 styles are supported.');
 if(root.getAttribute('class')==='note')throw fail('Footnote and endnote citation styles are not supported yet. Choose an in-text style.');
 const info=Array.from(root.childNodes).find(n=>n.localName==='info'&&n.namespaceURI===NS);
 const title=info&&all(info,'title')[0]?.textContent?.trim();
 if(!title||title.length>300)throw fail('The CSL style needs a title under 300 characters.');
 const parents=info?all(info,'link').filter(n=>n.getAttribute('rel')==='independent-parent'):[];
 if(parents.length>1)throw fail('The CSL style has multiple parent styles.');
 let parent;
 if(parents.length){const match=parents[0].getAttribute('href')?.match(/^https?:\/\/www\.zotero\.org\/styles\/([a-z0-9][a-z0-9-]{0,199})$/);if(!match)throw fail('Parent styles must come from the official Zotero style repository.');parent=match[1];}
 if(!parent&&(root.getAttribute('class')!=='in-text'||!all(root,'citation').length))throw fail('Choose an in-text CSL style with a citation layout.');
 const macros=new Map();for(const n of all(root,'macro')){const name=n.getAttribute('name');if(!name||macros.has(name))throw fail('The CSL style has invalid or duplicate macros.');macros.set(name,n);}
 const edges=n=>all(n,'text').map(t=>t.getAttribute('macro')).filter(Boolean);
 for(const name of edges(root))if(!macros.has(name))throw fail('The CSL style refers to a missing macro.');
 const costs=new Map();function check(name,stack=new Set()){
  if(stack.has(name))throw fail('Recursive CSL macros are not supported.');
  if(stack.size>=80)throw fail('CSL macro expansion is too complex.');
  if(costs.has(name))return costs.get(name);
  stack.add(name);let cost=1+macros.get(name).getElementsByTagName('*').length;
  for(const next of edges(macros.get(name))){cost+=check(next,stack);if(cost>50000)throw fail('CSL macro expansion is too complex.');}
  stack.delete(name);costs.set(name,cost);return cost;
 }
 for(const name of macros.keys())check(name);
 let expansion=0;for(const name of edges(root)){expansion+=costs.get(name);if(expansion>100000)throw fail('CSL macro expansion is too complex.');}
 const languages=new Set();for(const n of [root,...all(root,'layout'),...all(root,'if'),...all(root,'else-if')])for(const language of (n.getAttribute('default-locale')||n.getAttribute('locale')||'').split(/\s+/).filter(Boolean))languages.add(language);
 return {label:title,parent,locale:root.getAttribute('default-locale')||undefined,languages:[...languages]};
}
function normalizeLocale(lang){if(!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(lang))throw fail('This style uses an unsupported locale identifier.');return (CSL.LANG_BASES[lang]||lang).replace('_','-');}
const fixture={pmid:'12345678',title:'Style validation',authors:'Example, Alex',cslAuthors:[{family:'Example',given:'Alex'}],year:'2024',journal:'Example Journal',volume:'1',pages:'1-4'};
function validateRecord(record){
 if(JSON.stringify(record)?.length>10*MAX_XML)throw fail('The installed style exceeds the supported size.');
 if(!record||!slug(record.id)||!Array.isArray(record.parents)||record.parents.length>5||!record.locales||typeof record.locales!=='object')throw fail('Invalid installed style.');
 const child=inspectStyle(record.xml);let active=child;
 for(const p of record.parents){if(p.id!==active.parent)throw fail('Invalid installed parent chain.');active=inspectStyle(p.xml);}
 if(active.parent)throw fail('A parent style is missing.');
 for(const [lang,xml] of Object.entries(record.locales)){normalizeLocale(lang);parseXML(xml,'locale');}
 const styleXml=record.parents.at(-1)?.xml||record.xml;
 const options={styleXml,locales:record.locales,locale:normalizeLocale(child.locale||record.parents.map(p=>inspectStyle(p.xml).locale).find(Boolean)||'en-US')};
 try{generateCitations('(12345678)',[fixture],record.id,options);}catch{throw fail('This style could not be rendered by Refhaven’s CSL engine.');}
 return {...record,label:child.label,parent:child.parent,options};
}
export async function createCitationStyles({dataDir,fetchImpl=fetch}){
 const root=path.join(dataDir,'citation-styles');await mkdir(root,{recursive:true,mode:0o700});
 const installed=new Map(),builtin=listStyles(),bundled=new Set(builtin.map(s=>s.id));let busy=false,catalog=[],catalogLoading;
 async function atomic(file,value){const tmp=file+'.'+randomUUID()+'.tmp';try{await writeFile(tmp,JSON.stringify(value),{flag:'wx',mode:0o600});await rename(tmp,file);}finally{await rm(tmp,{force:true});}}
 for(const name of (await readdir(root)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).slice(0,200)){
  try{const text=await readFile(path.join(root,name),'utf8');if(text.length>10*MAX_XML)continue;const record=validateRecord(JSON.parse(text));if(!bundled.has(record.id))installed.set(record.id,record);}catch{/* A broken custom style must not prevent opening the user's library. */}
 }
 const list=()=>[...builtin.map(s=>({...s,builtin:true})),...Array.from(installed.values(),r=>({id:r.id,label:r.label,source:r.source,parent:r.parent,builtin:false})).sort((a,b)=>a.label.localeCompare(b.label))];
 async function download(url,max){
  let response;try{response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{accept:'application/xml, application/json, text/plain'}});}catch{throw fail('Could not reach the citation style repository. Installed styles still work offline.',502);}
  if(!response.ok)throw fail(response.status===404?'The requested style or locale was not found.':'The citation style repository is unavailable.',response.status===404?404:502);
  if(Number(response.headers.get('content-length'))>max)throw fail('Repository response exceeds the supported size.');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>max)throw fail('Repository response exceeds the supported size.');chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
 }
 async function remoteStyle(id){
  if(!slug(id))throw fail('Choose a valid repository style ID.');
  try{return await download(repo+id+'.csl',MAX_XML);}catch(e){if(e.status!==404)throw e;return download(repo+'dependent/'+id+'.csl',MAX_XML);}
 }
 function parseCatalog(raw){if(!Array.isArray(raw)||raw.length>30000)throw fail('Invalid style catalog.');return raw.filter(s=>slug(s.name)&&typeof s.title==='string'&&s.title.length<=300&&s.categories?.format!=='note').map(s=>({id:s.name,label:s.title}));}
 try{catalog=parseCatalog(JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8')));}catch{}
 async function getCatalog(){
  if(catalog.length)return catalog;
  if(!catalogLoading)catalogLoading=(async()=>{let raw;try{raw=JSON.parse(await download(catalogURL,12*MAX_XML));}catch(e){if(e.status)throw e;throw fail('The style catalog could not be read.',502);}const parsed=parseCatalog(raw);await atomic(path.join(root,'catalog.json'),raw);catalog=parsed;return catalog;})().finally(()=>{catalogLoading=undefined;});
  return catalogLoading;
 }
 async function install(xml,id,source){
  if(busy)throw fail('Another style is being installed. Try again shortly.',409);busy=true;
  try{
   if(installed.size>=200&&!installed.has(id))throw fail('The local style limit of 200 has been reached.');
   const child=inspectStyle(xml),parents=[],visited=new Set([id]);let active=child;
   while(active.parent){if(visited.has(active.parent)||parents.length>=5)throw fail('The CSL parent chain is cyclic or too long.');visited.add(active.parent);const parentXML=await remoteStyle(active.parent);parents.push({id:active.parent,xml:parentXML});active=inspectStyle(parentXML);}
   const languages=new Set([child.locale||active.locale||'en-US',...child.languages,...parents.flatMap(p=>inspectStyle(p.xml).languages)]),locales={};
   for(const language of languages){const lang=normalizeLocale(language);if(lang==='en-US'||locales[lang])continue;if(Object.keys(locales).length>=20)throw fail('This style requires too many locales.');const value=await download(localeRepo+'locales-'+lang+'.xml',MAX_XML);parseXML(value,'locale');locales[lang]=value;}
   const record=validateRecord({id,xml,parents,locales,source,installedAt:new Date().toISOString()});
   const {options,...saved}=record;
   await atomic(path.join(root,createHash('sha256').update(id).digest('hex')+'.json'),saved);installed.set(id,record);
   return {styles:list(),installedId:id};
  }finally{busy=false;}
 }
 return {
  list,
  options(id){if(bundled.has(id))return {};const record=installed.get(id);if(!record)throw fail('Choose an installed citation style.');return record.options;},
  async search(query){if(typeof query!=='string'||query.length>200)throw fail('Use a style search under 200 characters.');const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean),all=await getCatalog();const matches=all.filter(s=>terms.every(t=>(s.label+' '+s.id).toLowerCase().includes(t)));return {styles:matches.slice(0,80),truncated:matches.length>80};},
  async install(id){if(!slug(id))throw fail('Choose a valid repository style ID.');if(bundled.has(id)||installed.has(id))return {styles:list(),installedId:id};return install(await remoteStyle(id),id,'https://www.zotero.org/styles/'+id);},
  async import(xml){inspectStyle(xml);const id='custom-'+createHash('sha256').update(xml).digest('hex');return install(xml,id,'Imported CSL file');}
 };
}
