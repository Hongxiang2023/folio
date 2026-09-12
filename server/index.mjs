import http from 'node:http';
import {createPaperChat} from './paper-chat.mjs';
import {readingCacheStore} from './reading-cache.mjs';
import {lookupPubmed} from './pubmed.mjs';
import {generateCitations, paperCitationIdentifiers, normalizeCitationIdentifier} from './citations.mjs';
import {lookupCitationIdentifier} from './identifier-lookup.mjs';
import {createCitationStyles} from './citation-styles.mjs';
import {extractDocx,generateDocx,createDocx} from './word.mjs';
import {streamBackup} from './archive.mjs';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uuid = /^[a-f0-9-]{36}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const safeEqual = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const defaultDataDir = () => process.env.FOLIO_DATA_DIR || (process.platform === 'darwin' ? path.join(homedir(), 'Library/Application Support/Folio') : process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || homedir(), 'Folio') : path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local/share'), 'folio'));
const normalizeDoi = value => String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
function webUrl(value) { if (!value) return ''; try { const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error(); u.hash = ''; return u.href; } catch { throw fail(400, 'Use a valid HTTP or HTTPS URL.'); } }
async function jsonBody(req) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) throw fail(413, 'Reference data exceeds 32 MB.'); chunks.push(chunk); } try { return JSON.parse(Buffer.concat(chunks)); } catch { throw fail(400, 'Invalid JSON.'); } }

async function wordBody(req){
 const multipart=/^multipart\/form-data(?:;|$)/i.test(req.headers['content-type']||'');
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>(multipart?22:20)*1024*1024)throw fail(413,'Word documents must be under 20 MB.');chunks.push(chunk);}
 const buffer=Buffer.concat(chunks);
 if(!multipart)return {buffer,papers:undefined};
 let form;try{form=await new Request('http://localhost/',{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:buffer}).formData();}catch{throw fail(400,'Invalid Word upload.');}
 const document=form.get('document'),metadata=form.get('papers');
 if(!document||typeof document==='string'||form.getAll('document').length!==1||form.getAll('papers').length>1)throw fail(400,'Choose one Word document.');
 if(document.size>20*1024*1024)throw fail(413,'Word documents must be under 20 MB.');
 let papers;try{if(metadata!==null){if(typeof metadata!=='string'||metadata.length>1024*1024)throw Error();papers=JSON.parse(metadata);}}catch{throw fail(400,'Invalid temporary citation metadata.');}
 return {buffer:Buffer.from(await document.arrayBuffer()),papers};
}
// Temporary lookup results belong to this request only. Never persist them.
function citationPapers(libraryPapers,temporary){
 if(temporary===undefined)return libraryPapers;
 if(!Array.isArray(temporary)||temporary.length>100||JSON.stringify(temporary).length>1024*1024)throw fail(400,'Use at most 100 temporary references under 1 MB.');
 const fields=['id','pmid','title','authors','year','journal','doi','arxivId','cslType','publisher','publisherPlace','eventTitle','sourceUrl','volume','issue','pages','journalAbbreviation'];
 const extra=temporary.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||!paperCitationIdentifiers(p).length||typeof p.title!=='string'||!p.title.trim()||fields.some(k=>p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>20000))||[['folio','id'],['doi','doi'],['pmid','pmid'],['arxiv','arxivId']].some(([type,key])=>p[key]&&!normalizeCitationIdentifier(type,p[key])))throw fail(400,'Invalid temporary citation metadata.');
  const value=Object.fromEntries([...fields,'cslAuthors','dateParts'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
  validateCitationFields(value);if(value.sourceUrl)webUrl(value.sourceUrl);return value;
 });
 return [...libraryPapers,...extra];
}
function validHighlights(value) {
 if(value===undefined)return true;
 if(!Array.isArray(value)||value.length>5000)return false;
 const ids=new Set();
 return value.every(h=>{
  if(!h||typeof h!=='object'||typeof h.id!=='string'||!h.id.trim()||h.id.length>128||ids.has(h.id)||typeof h.pdfId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(h.pdfId)||!Number.isSafeInteger(h.page)||h.page<1||h.page>500||!Number.isSafeInteger(h.paragraph)||h.paragraph<0||h.paragraph>=5000||!Number.isSafeInteger(h.start)||h.start<0||!Number.isSafeInteger(h.end)||h.end<=h.start||h.end>50000||typeof h.quote!=='string'||!h.quote.length||h.quote.length>10000||h.end-h.start!==h.quote.length||typeof h.createdAt!=='string'||h.createdAt.length>64||!Number.isFinite(Date.parse(h.createdAt)))return false;
  if(h.color!==undefined&&!['yellow','green','blue','pink','purple'].includes(h.color))return false;
  if(h.note!==undefined&&(typeof h.note!=='string'||h.note.length>10000))return false;
  ids.add(h.id);return true;
 });
}
function validateCitationFields(p){if(!validHighlights(p.highlights))throw fail(400,'Invalid text highlights.');for(const key of ['pmid','arxivId','cslType','publisher','publisherPlace','eventTitle','volume','issue','pages','journalAbbreviation'])if(p[key]!==undefined&&typeof p[key]!=='string')throw fail(400,'Invalid citation metadata.');if(p.pmid&&!/^[1-9]\d{0,8}$/.test(p.pmid))throw fail(400,'PMID must contain 1–9 digits without a leading zero.');if(p.arxivId&&!normalizeCitationIdentifier('arxiv',p.arxivId))throw fail(400,'Invalid arXiv identifier.');if(p.cslType&&!['article-journal','paper-conference','article','book','chapter','report','thesis','manuscript'].includes(p.cslType))throw fail(400,'Invalid reference type.');if(p.cslAuthors!==undefined&&(!Array.isArray(p.cslAuthors)||p.cslAuthors.length>1000||p.cslAuthors.some(a=>!a||typeof a!=='object'||['family','given','literal'].some(k=>a[k]!==undefined&&typeof a[k]!=='string'))))throw fail(400,'Invalid structured author metadata.');if(p.dateParts!==undefined&&(!Array.isArray(p.dateParts)||p.dateParts.length>3||!p.dateParts.every(Number.isInteger)))throw fail(400,'Invalid publication date.');}

export async function createFolioServer({ dataDir = defaultDataDir(), localDataDir = dataDir, libraryLocation, storageReady=()=>true, staticDir = fileURLToPath(new URL('../dist', import.meta.url)), pubmedLookup=lookupPubmed, identifierLookup=lookupCitationIdentifier, secretStorage, cropImage, aiGenerate, codexFactory, styleFetch, extensionDir=fileURLToPath(new URL('../extension',import.meta.url)) } = {}) {
  await mkdir(path.join(dataDir, 'pdfs'), { recursive: true, mode: 0o700 });
  await mkdir(localDataDir,{recursive:true,mode:0o700});
  const externalLibrary=path.resolve(dataDir)!==path.resolve(localDataDir);
  const readingCache=readingCacheStore(localDataDir);
  const citationStyles=await createCitationStyles({dataDir,...(styleFetch?{fetchImpl:styleFetch}:{})});
  const libraryPath = path.join(dataDir, 'library.json');
  const tokenPath = path.join(localDataDir, 'connector-token');
  let token;
  try { token = (await readFile(tokenPath, 'utf8')).trim(); } catch (e) { if (e.code !== 'ENOENT') throw e; token = randomBytes(32).toString('hex'); const f = await open(tokenPath, 'wx', 0o600); try { await f.writeFile(token); await f.sync(); } finally { await f.close(); } }
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid connector token file.');
  let diskSnapshot=null;
  let library = { papers: [], revision: 0 };
  try { diskSnapshot=await readFile(libraryPath, 'utf8'); library = JSON.parse(diskSnapshot); if (!Array.isArray(library.papers) || !Number.isSafeInteger(library.revision)) throw Error('Invalid library file; restore a backup.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  library.collections = [...new Set([...(library.collections || []), ...library.papers.map(p => p.collection)])];
  let queue = Promise.resolve();
  const exclusive = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  const hashes=new Map();
  async function fileHash(id){if(hashes.has(id))return hashes.get(id);const hash=createHash('sha256');for await(const chunk of createReadStream(path.join(dataDir,'pdfs',`${id}.pdf`)))hash.update(chunk);const value=hash.digest('hex');hashes.set(id,value);return value;}
  async function storageStats(){const files=(await readdir(path.join(dataDir,'pdfs'))).filter(f=>f.endsWith('.pdf'));const sizes=new Map();for(const file of files)sizes.set(file.slice(0,-4),(await stat(path.join(dataDir,'pdfs',file))).size);const used=new Set(library.papers.map(p=>p.pdfId).filter(Boolean));const bytes=[...sizes.values()].reduce((a,b)=>a+b,0);const logicalBytes=library.papers.reduce((sum,p)=>sum+(sizes.get(p.pdfId)||0),0);const referencedBytes=[...used].reduce((sum,id)=>sum+(sizes.get(id)||0),0);return {...await readingCache.stats(),pdfCount:files.length,bytes,referenceCount:library.papers.length,logicalBytes,savedBytes:Math.max(0,logicalBytes-referencedBytes),unusedBytes:bytes-referencedBytes};}
  async function assertExternalUnchanged(){
    if(externalLibrary){let current;try{current=await readFile(libraryPath,'utf8');}catch{throw fail(409,'The library folder is unavailable. Start your cloud drive and reopen Folio.');}if(current!==diskSnapshot)throw fail(409,'The library changed outside Folio. Quit Folio, wait for cloud sync, then reopen it before saving.');}
  }
  async function persist(papers, collections = library.collections) {
    await assertExternalUnchanged();
    const next={papers,collections:[...new Set([...collections,...papers.map(p=>p.collection)])],revision:library.revision+1};const temp=`${libraryPath}.${randomUUID()}.tmp`;
    try {
      const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(next,null,2));await file.sync();}finally{await file.close();}
      await rename(temp,libraryPath);library=next;diskSnapshot=JSON.stringify(next,null,2);
      if(process.platform!=='win32'){let dir;try{dir=await open(dataDir,'r');await dir.sync();}catch(e){if(!['EINVAL','ENOTSUP','EBADF','EISDIR','EPERM'].includes(e.code))throw e;}finally{await dir?.close();}}
      return next;
    } finally {await rm(temp,{force:true});}
  }
  async function validatePaper(p) { if(p)validateCitationFields(p); const strings = ['id', 'title', 'authors', 'year', 'journal', 'doi', 'collection', 'tags', 'status', 'notes']; if (!p || strings.some(k => typeof p[k] !== 'string') || !p.id || !p.title.trim() || !p.collection.trim() || typeof p.starred !== 'boolean' || !['To read', 'Reading', 'Finished'].includes(p.status)) throw fail(400, 'Invalid paper record.'); for (const key of ['sourceUrl', 'pdfUrl']) if (p[key]) webUrl(p[key]); if (p.pdfName !== undefined && typeof p.pdfName !== 'string') throw fail(400, 'Invalid PDF filename.'); if (p.pdfId !== undefined) { if (!uuid.test(p.pdfId)) throw fail(400, 'Invalid PDF ID.'); try { await stat(path.join(dataDir, 'pdfs', `${p.pdfId}.pdf`)); } catch { throw fail(400, 'Attached PDF does not exist.'); } } }
  for(const p of library.papers){if(p)validateCitationFields(p);if(!p||['id','title','authors','year','journal','doi','collection','tags','status','notes'].some(k=>typeof p[k]!=='string')||!p.title.trim()||!p.collection.trim()||typeof p.starred!=='boolean'||!['To read','Reading','Finished'].includes(p.status)||(p.pdfId!==undefined&&!uuid.test(p.pdfId)))throw Error('Invalid library record; restore a backup.');for(const key of ['sourceUrl','pdfUrl'])if(p[key])webUrl(p[key]);}
  if(new Set(library.papers.map(p=>p.id)).size!==library.papers.length)throw Error('Duplicate library IDs; restore a backup.');
  const paperChat=await createPaperChat({dataDir:localDataDir,readingCache,getPaper:id=>library.papers.find(p=>p.pdfId===id),secretStorage,cropImage,...(aiGenerate?{apiGenerate:aiGenerate}:{}),...(codexFactory?{codexFactory}:{})});
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  let relocating=false,choosingLocation=false,activeRequests=0;
  const server = http.createServer(async (req, res) => {
    activeRequests++;let counted=true;const finished=()=>{if(counted){counted=false;activeRequests--;}};res.once('finish',finished);res.once('close',finished);
    try {
      const host = req.headers.host;
      const expectedPort = server.address()?.port;
      if (![ `127.0.0.1:${expectedPort}`, `localhost:${expectedPort}` ].includes(host)) throw fail(403, 'Unexpected host.');
      const origin = req.headers.origin;
      const ownOrigin = `http://${host}`;
      const bearer = safeEqual(req.headers.authorization?.replace(/^Bearer /, ''), token);
      const extension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
      if (origin && origin !== ownOrigin && !(extension && (bearer || req.method === 'OPTIONS'))) throw fail(403, 'Origin denied.');
      if (extension) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Folio-Filename'); res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS'); }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url, ownOrigin);
      if (url.pathname.startsWith('/api/')) {
        if(!storageReady())throw fail(503,'Folio is verifying the moved library. Please wait.');
        if (url.pathname === '/api/session' && req.method === 'GET') {
          if (extension || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) throw fail(403, 'Open Folio directly to pair the connector.');
          res.setHeader('Set-Cookie', `folio_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
          return send(res, 200, { token, dataDir, extensionDir:path.resolve(extensionDir) });
        }
        if(relocating)throw fail(503,'Folio is moving the library. Wait for it to reopen.');
        const cookie = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('folio_session='))?.slice(14);
        if (!bearer && !(safeEqual(cookie, token) && !extension)) throw fail(401, 'Open Folio or pair the connector first.');
        if (!bearer && req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Cross-site request denied.');
        if(url.pathname==='/api/library-location'&&req.method==='GET'){if(extension)throw fail(403,'Open Folio directly to manage its folder.');return send(res,200,{supported:!!libraryLocation,dataDir,localDataDir,cloudFolder:externalLibrary});}
        if(url.pathname==='/api/library-location/reveal'&&req.method==='POST'){
          if(extension||!libraryLocation)throw fail(403,'Open the Folio desktop app to manage its folder.');
          await libraryLocation.reveal();return send(res,200,{ok:true});
        }
        if(url.pathname==='/api/library-location/choose'&&req.method==='POST'){
          if(extension||!libraryLocation)throw fail(403,'Open the Folio desktop app to move its library.');
          if(choosingLocation)throw fail(409,'A folder selection is already open.');
          choosingLocation=true;
          try{
            const target=await libraryLocation.choose();if(!target)return send(res,200,{cancelled:true});
            relocating=true;
            const deadline=Date.now()+15000;
            while(activeRequests>1){if(Date.now()>deadline)throw fail(409,'Wait for downloads and other operations to finish, then try moving again.');await new Promise(resolve=>setTimeout(resolve,50));}
            await exclusive(()=>libraryLocation.move(target));
            send(res,200,{restarting:true});setTimeout(()=>libraryLocation.restart(),300);return;
          }catch(e){relocating=false;throw fail(e.status||400,e.message);}
          finally{choosingLocation=false;}
        }

        if(url.pathname.startsWith('/api/ai/')){
          if(extension)throw fail(403,'Paper chat is available only inside Folio.');
          if(url.pathname==='/api/ai/settings'){
            if(req.method==='GET')return send(res,200,await paperChat.status());
            if(req.method==='POST')return send(res,200,await paperChat.configure(await jsonBody(req)));
          }
          if(url.pathname==='/api/ai/login'&&req.method==='POST')return send(res,200,await paperChat.login());
          if(url.pathname==='/api/ai/logout'&&req.method==='POST')return send(res,200,await paperChat.logout());
          const chatMatch=url.pathname.match(/^\/api\/ai\/papers\/([a-f0-9-]{36})(\/cancel)?$/);
          if(chatMatch){const id=chatMatch[1];
            if(chatMatch[2]&&req.method==='POST')return send(res,200,paperChat.cancel(id));
            if(req.method==='GET')return send(res,200,await paperChat.get(id));
            if(req.method==='PUT')return send(res,200,await paperChat.enable(id,await jsonBody(req)));
            if(req.method==='DELETE')return send(res,200,await paperChat.clear(id));
            if(req.method==='POST'){const body=await jsonBody(req),controller=new AbortController();const stop=()=>{if(!res.writableEnded)controller.abort();};res.on('close',stop);try{return send(res,200,await paperChat.ask(id,body,controller.signal));}finally{res.removeListener('close',stop);}}
          }
          throw fail(404,'Unknown AI endpoint.');
        }
        if(url.pathname==='/api/pubmed'&&req.method==='GET'){try{return send(res,200,await pubmedLookup({pmid:url.searchParams.get('pmid')||undefined,doi:url.searchParams.get('doi')||undefined}));}catch(e){throw fail(400,e.message);}}
        if(url.pathname==='/api/citations/lookup'&&req.method==='GET'){if(extension)throw fail(403,'Reference lookup is available only inside Folio.');try{return send(res,200,await identifierLookup(url.searchParams.get('identifier')||'',{pubmedLookup}));}catch(e){throw fail(400,e.message);}}
        if(url.pathname==='/api/citations/styles'&&req.method==='GET')return send(res,200,citationStyles.list());
        if(url.pathname.startsWith('/api/citations/style-')){
          if(extension)throw fail(403,'Citation style management is available only inside Folio.');
          if(url.pathname==='/api/citations/style-catalog'&&req.method==='GET')return send(res,200,await citationStyles.search(url.searchParams.get('q')||''));
          if(req.method==='POST'){
            const body=await jsonBody(req);
            if(url.pathname==='/api/citations/style-install')return send(res,200,await citationStyles.install(body.id));
            if(url.pathname==='/api/citations/style-import')return send(res,200,await citationStyles.import(body.xml));
          }
          throw fail(405,'Unsupported citation style operation.');
        }
        if(url.pathname.startsWith('/api/citations/')&&req.method==='POST'){
          if(extension)throw fail(403,'Manuscript conversion is available only inside Folio.');
          const body=await jsonBody(req);if(typeof body.text!=='string'||body.text.length>1000000)throw fail(400,'Manuscript text must be under one million characters.');if(!citationStyles.list().some(s=>s.id===body.style))throw fail(400,'Choose a supported citation style.');
          const papers=citationPapers(library.papers,body.papers);
          if(url.pathname==='/api/citations/preview')return send(res,200,generateCitations(body.text,papers,body.style,citationStyles.options(body.style)));
          if(url.pathname==='/api/citations/word'){const output=await createDocx(body.text,papers,body.style,citationStyles.options(body.style));if(output.unresolved.length)throw fail(400,'Resolve all identifiers before exporting Word.');res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':'attachment; filename="folio-manuscript.docx"','Cache-Control':'no-store'});res.end(output.buffer);return;}
        }
        if(url.pathname.startsWith('/api/word/')&&req.method==='POST'){
          if(extension)throw fail(403,'Manuscript conversion is available only inside Folio.');
          const style=url.searchParams.get('style')||'apa';if(!citationStyles.list().some(s=>s.id===style))throw fail(400,'Choose a supported citation style.');const {buffer,papers:temporary}=await wordBody(req),papers=citationPapers(library.papers,temporary);
          if(url.pathname==='/api/word/preview'){const source=await extractDocx(buffer);const output=generateCitations(source.text,[...papers,...(source.embeddedPapers||[])],style,citationStyles.options(style));return send(res,200,{...output,revision:source.revision,warnings:[...source.warnings,...output.warnings]});}
          if(url.pathname==='/api/word/generate'){const output=await generateDocx(buffer,papers,style,citationStyles.options(style));if(output.unresolved.length)throw fail(400,'Resolve all identifiers before exporting Word.');res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':'attachment; filename="folio-manuscript.docx"','Cache-Control':'no-store'});res.end(output.buffer);return;}
        }
        if(url.pathname==='/api/storage'&&req.method==='GET')return send(res,200,await exclusive(storageStats));
        if(url.pathname==='/api/backup'&&req.method==='GET')return await exclusive(()=>streamBackup(res,library,dataDir,localDataDir));
        if (url.pathname === '/api/collections' && req.method === 'POST') {
          const body = await jsonBody(req);
          return send(res, 200, await exclusive(async () => {
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (!name || name.length > 200 || name === 'Unfiled') throw fail(400, 'Use a collection name of 1–200 characters. Unfiled is reserved.');
            if (!['create','rename','delete'].includes(body.action)) throw fail(400, 'Unknown collection action.');
            if (body.action !== 'create' && !library.collections.includes(name)) throw fail(409, 'This collection no longer exists.');
            const replacement = body.action === 'rename' && typeof body.newName === 'string' ? body.newName.trim() : name;
            if (!replacement || replacement.length > 200 || replacement === 'Unfiled') throw fail(400, 'Choose a valid collection name.');
            if (body.action !== 'delete' && library.collections.some(c => c.toLowerCase() === replacement.toLowerCase() && (body.action === 'create' || c !== name))) throw fail(409, 'A collection with this name already exists.');
            const collections = body.action === 'create' ? [...library.collections,name] : library.collections.filter(c => c !== name).concat(body.action === 'rename' ? [replacement] : []);
            const papers = body.action === 'create' ? library.papers : library.papers.map(p => p.collection === name ? {...p,collection:body.action === 'delete' ? 'Unfiled' : replacement} : p);
            return persist(papers,collections);
          }));
        }
        if (url.pathname === '/api/library' && req.method === 'GET') return send(res, 200, library);
        if (url.pathname === '/api/library' && req.method === 'PUT') { const body = await jsonBody(req); return send(res, 200, await exclusive(async () => { if (body.revision !== library.revision) throw fail(409, 'Library changed. Reload before saving.'); if (!Array.isArray(body.papers) || new Set(body.papers.map(p => p?.id)).size !== body.papers.length) throw fail(400, 'Invalid or duplicate references.'); for (const p of body.papers) await validatePaper(p); return persist(body.papers); })); }
        if (url.pathname === '/api/pdfs' && req.method === 'POST') {
          if (req.headers['content-type']?.split(';')[0] !== 'application/pdf') throw fail(415, 'Upload application/pdf.');
          let pdfName; try { pdfName = path.basename(decodeURIComponent(req.headers['x-folio-filename'] || 'paper.pdf')).replace(/[\r\n\x00]/g, '').slice(0, 255); } catch { throw fail(400, 'Invalid filename.'); }
          const pdfId = randomUUID(); const temp = path.join(dataDir, 'pdfs', `${pdfId}.tmp`); const dest = path.join(dataDir, 'pdfs', `${pdfId}.pdf`);
          const disk = await statfs(dataDir); const declared = Number(req.headers['content-length']); if (declared > disk.bavail * disk.bsize) throw fail(507, 'Not enough free disk space.');
          const f = await open(temp, 'wx', 0o600); let size = 0; let signature = Buffer.alloc(0);const digest=createHash('sha256');
          try { for await (const chunk of req) { if (signature.length < 5) signature = Buffer.concat([signature, chunk.subarray(0, 5 - signature.length)]); if (signature.length === 5 && signature.toString() !== '%PDF-') throw fail(400, 'This file is not a PDF.'); digest.update(chunk);await f.writeFile(chunk); size += chunk.length; } if (signature.length < 5) throw fail(400, 'Empty or invalid PDF.'); await f.sync(); await f.close(); } catch (e) { await f.close().catch(() => {}); await rm(temp, { force: true }); throw e; }
          return send(res,201,await exclusive(async()=>{try{const hash=digest.digest('hex');for(const name of await readdir(path.join(dataDir,'pdfs'))){if(!name.endsWith('.pdf'))continue;const id=name.slice(0,-4);if(externalLibrary&&!hashes.has(id))continue;if((await stat(path.join(dataDir,'pdfs',name))).size===size&&await fileHash(id)===hash){await rm(temp,{force:true});return {pdfId:id,pdfName,size,reused:true,savedBytes:size};}}await rename(temp,dest);hashes.set(pdfId,hash);return {pdfId,pdfName,size,reused:false,savedBytes:0};}finally{await rm(temp,{force:true});}}));
        }
        const cacheMatch = /^\/api\/reading-cache\/([a-f0-9-]{36})$/.exec(url.pathname);
        if(cacheMatch){
          const id=cacheMatch[1];
          if(req.method==='DELETE')return send(res,200,await exclusive(()=>readingCache.remove(id)));
          if(req.method==='GET'){await stat(path.join(dataDir,'pdfs',`${id}.pdf`));return send(res,200,await readingCache.get(id));}
          if(req.method==='PUT'){const body=await jsonBody(req);return send(res,200,await exclusive(async()=>{await stat(path.join(dataDir,'pdfs',`${id}.pdf`));return readingCache.put(id,body);}));}
        }
        const match = /^\/api\/pdfs\/([a-f0-9-]{36})$/.exec(url.pathname);
        if (match && req.method === 'DELETE') return send(res, 200, await exclusive(async () => { await assertExternalUnchanged();if (library.papers.some(p => p.pdfId === match[1])) throw fail(409, 'PDF is still attached to a reference.'); await rm(path.join(dataDir, 'pdfs', `${match[1]}.pdf`), { force: true }); hashes.delete(match[1]); await readingCache.remove(match[1]); return { deleted: true }; }));
        if (match && ['GET', 'HEAD'].includes(req.method)) {
          const file = path.join(dataDir, 'pdfs', `${match[1]}.pdf`); const { size } = await stat(file); let start = 0, end = size - 1, status = 200;
          if (req.headers.range) { const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range); if (!r || (!r[1] && !r[2])) { res.setHeader('Content-Range', `bytes */${size}`); throw fail(416, 'Invalid range.'); } start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2])); end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1; if (start > end || start >= size) { res.setHeader('Content-Range', `bytes */${size}`); throw fail(416, 'Range outside PDF.'); } status = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); }
          res.writeHead(status, { 'Content-Type': 'application/pdf', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Content-Disposition': url.searchParams.get('download')==='1'?`attachment; filename="paper.pdf"; filename*=UTF-8''${encodeURIComponent(library.papers.find(p=>p.pdfId===match[1])?.pdfName||'paper.pdf')}`:'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); if (req.method === 'HEAD') res.end(); else createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res); return;
        }
        if (url.pathname === '/api/capture' && req.method === 'POST') { const body = await jsonBody(req);const captureWarnings=[];if(body.lookup!==false&&(body.pmid||body.doi)){try{const found=await pubmedLookup({pmid:body.pmid,doi:body.doi});if(body.doi&&found.doi&&normalizeDoi(body.doi)!==normalizeDoi(found.doi))throw fail(400,'PMID and DOI refer to different records.');for(const key of ['title','authors','journal','year','doi','sourceUrl'])if(!body[key])body[key]=found[key];for(const key of ['pmid','arxivId','cslType','publisher','publisherPlace','eventTitle','volume','issue','pages','journalAbbreviation','cslAuthors','dateParts'])if(found[key]!==undefined)body[key]=found[key];}catch(e){if(e.status)throw e;captureWarnings.push(e.message);}} return send(res, 200, await exclusive(async () => {
          const doi = normalizeDoi(body.doi), sourceUrl = webUrl(body.url || body.sourceUrl), pdfUrl = webUrl(body.pdfUrl);
          const existing = library.papers.find(p => body.pmid&&p.pmid===body.pmid || doi && normalizeDoi(p.doi) === doi || sourceUrl && p.sourceUrl === sourceUrl);
          if(existing){const updated={...existing};for(const key of ['pmid','arxivId','cslType','publisher','publisherPlace','eventTitle','volume','issue','pages','journalAbbreviation','cslAuthors','dateParts'])if(!updated[key]&&body[key])updated[key]=body[key];if(body.pdfId&&!existing.pdfId){updated.pdfId=body.pdfId;updated.pdfName=body.pdfName||'paper.pdf';}if(JSON.stringify(updated)!==JSON.stringify(existing)){await validatePaper(updated);await persist(library.papers.map(p=>p.id===updated.id?updated:p));}return {paper:updated,duplicate:true,warnings:captureWarnings};}
          if(!body.title&&captureWarnings.length)throw fail(400,captureWarnings.join(' '));
          const paper = { id: randomUUID(), title: body.title || '', authors: Array.isArray(body.authors) ? body.authors.join('; ') : body.authors || '', year: String(body.year || ''), journal: body.journal || '', doi, collection: 'Unfiled', tags: '', status: 'To read', notes: '', starred: false, sourceUrl, pdfUrl, ...Object.fromEntries(['pmid','arxivId','cslType','publisher','publisherPlace','eventTitle','volume','issue','pages','journalAbbreviation','cslAuthors','dateParts'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]])), ...(body.pdfId ? { pdfId: body.pdfId, pdfName: body.pdfName || 'paper.pdf' } : {}) };
          await validatePaper(paper); await persist([paper, ...library.papers]); return { paper, duplicate: false, warnings:captureWarnings };
        })); }
        throw fail(404, 'API route not found.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Method not allowed.');
      let file = path.resolve(staticDir, `.${decodeURIComponent(url.pathname)}`); if (!file.startsWith(path.resolve(staticDir) + path.sep)) file = path.join(staticDir, 'index.html');
      try { if (!(await stat(file)).isFile()) file = path.join(staticDir, 'index.html'); } catch { file = path.join(staticDir, 'index.html'); }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }; const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; font-src 'self' data:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob:; object-src 'self' blob:; connect-src 'self' https://api.crossref.org https://api.openalex.org; base-uri 'none'; frame-ancestors 'none'" }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) { if (res.headersSent) { res.destroy(); return; } send(res, e.status || (e.code === 'ENOENT' ? 404 : e.code === 'ENOSPC' ? 507 : 500), { error: e.status ? e.message : e.code === 'ENOSPC' ? 'Not enough disk space.' : e.code === 'ENOENT' ? 'File not found. Run npm run build first.' : 'Unable to complete request.' }); }
  });
  server.requestTimeout=0; // Local streamed imports may take longer than Node's default request timeout.
  server.on('close',()=>{void paperChat.shutdown();});
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {resolveLibraryLocation}=await import('./library-location.mjs');
  const localDataDir=defaultDataDir(),location=await resolveLibraryLocation({configDir:localDataDir,defaultDataDir:localDataDir});
  const server = await createFolioServer({dataDir:location.dataDir,localDataDir});
  const port = Number(process.env.PORT || 47821);
  server.listen(port, '127.0.0.1', () => console.log(`Folio: http://127.0.0.1:${port}/papers\nLibrary: ${location.dataDir}`));
}
