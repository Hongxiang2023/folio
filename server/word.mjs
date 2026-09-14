import JSZip from 'jszip';
import {randomUUID, createHash} from 'node:crypto';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {generateCitations, listStyles, resolveCitationMarkers, paperCitationIdentifiers, normalizeCitationIdentifier, parseCitationMarkers} from './citations.mjs';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MAX_INPUT=20*1024*1024, MAX_EXPANDED=100*1024*1024;
const META='customXml/folioReferences.xml';
const RELS='word/_rels/document.xml.rels';
const R='http://schemas.openxmlformats.org/package/2006/relationships';
const CUSTOM_XML='http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';
const FOLIO='urn:folio:references:v1';
const hash=text=>createHash('sha256').update(text).digest('hex');
const fail=message=>Object.assign(new Error(message),{status:400});
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS(W,name));
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw fail('Unsupported XML declarations in Word document.');const errors=[];let doc;try{doc=new DOMParser({onError:(level,message)=>{if(level!=='warning')errors.push(message);}}).parseFromString(text,'application/xml');}catch{throw fail('Invalid Word document XML.');}if(errors.length)throw fail('Invalid Word document XML.');return doc;}
function ancestor(node,name){for(let parent=node.parentNode;parent;parent=parent.parentNode)if(parent.namespaceURI===W&&parent.localName===name)return parent;return null;}
function paragraphs(doc){return elements(doc,'p').filter(p=>!ancestor(p,'txbxContent')).map(p=>{const entries=[];let text='';for(const node of elements(p,'t')){if(ancestor(node,'p')!==p||ancestor(node,'txbxContent'))continue;entries.push({node,start:text.length,end:text.length+node.textContent.length});text+=node.textContent;}return {node:p,entries,text};});}
async function openDocx(buffer){
 if(buffer.length>MAX_INPUT)throw fail('Word documents must be under 20 MB.');
 let zip;try{zip=await JSZip.loadAsync(buffer);}catch{throw fail('Choose a valid .docx file.');}
 const entries=Object.values(zip.files);if(entries.length>2000||entries.reduce((sum,f)=>sum+(f._data?.uncompressedSize||0),0)>MAX_EXPANDED)throw fail('This Word document expands beyond the supported size.');
 if(zip.file('word/vbaProject.bin'))throw fail('Macro-enabled Word documents are not supported.');
 const documentPart=zip.file('word/document.xml');if(!documentPart)throw fail('Word document body is missing.');
 const doc=xml(await documentPart.async('string'));if(!elements(doc,'body').length)throw fail('Word document body is missing.');
 if(elements(doc,'ins').length||elements(doc,'del').length||elements(doc,'moveFrom').length||elements(doc,'moveTo').length)throw fail('Accept or reject tracked changes in a copy before generating references.');
 const revision=await restoreManagedReferences(zip,doc);
 if(!revision&&elements(doc,'bookmarkStart').some(n=>n.getAttributeNS(W,'name')==='FolioGeneratedReferences'))throw fail('This older generated document has no editable citation identifiers. Use your original PMID manuscript to update its references.');
 const parts=paragraphs(doc);let offset=0;for(const p of parts){p.offset=offset;offset+=p.text.length+1;}
 return {zip,doc,parts,text:parts.map(p=>p.text).join('\n'),revision:Boolean(revision),embeddedPapers:revision?.papers||[],managedSources:revision?.activeSources||[],metadataPath:revision?.metadataPath};
}
export async function extractDocx(buffer){const opened=await openDocx(buffer);return {text:opened.text,embeddedPapers:opened.embeddedPapers,revision:opened.revision,warnings:['Word conversion covers main-body paragraphs and tables. Headers, footnotes, endnotes and text boxes are not converted.']};}
function control(doc,tag,nodes){
 const node=doc.createElementNS(W,'w:sdt'),props=doc.createElementNS(W,'w:sdtPr'),label=doc.createElementNS(W,'w:tag'),content=doc.createElementNS(W,'w:sdtContent');
 label.setAttributeNS(W,'w:val',tag);props.appendChild(label);node.appendChild(props);node.appendChild(content);for(const child of nodes)content.appendChild(child);return node;
}
const visible=node=>elements(node,'t').map(n=>n.textContent).join('');
const paperFields=['id','pmid','doi','arxivId','title','authors','cslAuthors','journal','journalAbbreviation','year','dateParts','volume','issue','pages','sourceUrl','cslType','arxiv','publisher','publisherPlace','eventTitle'];
function snapshotPapers(papers){
 const snapshots=papers.map(p=>Object.fromEntries(paperFields.filter(k=>p[k]!==undefined&&p[k]!==null).map(k=>[k,k==='cslAuthors'?p[k].map(a=>Object.fromEntries(['family','given','literal'].filter(key=>a[key]).map(key=>[key,String(a[key])]))):k==='dateParts'?p[k]:String(p[k])])));
 if(snapshots.some(p=>!validPaper(p)))throw fail('Reference metadata exceeds the supported editable Word document limits.');return snapshots;
}
function validPaper(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!paperFields.includes(k)))return false;
 if(typeof p.title!=='string'||!p.title.trim()||!paperCitationIdentifiers(p).length)return false;
 for(const [field,type] of [['id','folio'],['pmid','pmid'],['doi','doi'],['arxivId','arxiv'],['arxiv','arxiv']])if(p[field]&&!normalizeCitationIdentifier(type,p[field]))return false;
 if(p.cslType&&!['article-journal','paper-conference','article','book','chapter','report','thesis','manuscript'].includes(p.cslType))return false;
 if(p.sourceUrl){try{const url=new URL(p.sourceUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return false;}catch{return false;}}

 return Object.entries(p).every(([k,v])=>k==='dateParts'?Array.isArray(v)&&v.length<=3&&v.every(Number.isInteger):k==='cslAuthors'?Array.isArray(v)&&v.length<=1000&&v.every(a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.entries(a).every(([key,value])=>['family','given','literal'].includes(key)&&typeof value==='string'&&value.length<=2000)):typeof v==='string'&&v.length<=20000);
}
function mergePapers(papers,embedded){return [...papers,...embedded];}

// Word can rename custom XML parts on save. Resolve only package-local custom XML
// relationships and recognize our namespace, never a particular Word-assigned name.
function customXmlTarget(rel){
 if(rel.getAttribute('TargetMode')&&rel.getAttribute('TargetMode')!=='Internal')throw fail('External custom XML relationships are not supported.');
 const target=rel.getAttribute('Target');
 const match=/^(?:\.\.\/|\/)customXml\/([A-Za-z0-9_.-]+\.xml)$/.exec(target);
 if(!match||match[1].includes('..'))throw fail('Unsafe custom XML relationship target.');
 return 'customXml/'+match[1];
}
async function findMetadata(zip){
 const relationshipPart=zip.file(RELS),linked=new Set();
 if(relationshipPart){const rels=xml(await relationshipPart.async('string'));for(const rel of Array.from(rels.getElementsByTagNameNS(R,'Relationship')))if(rel.getAttribute('Type')===CUSTOM_XML){const path=customXmlTarget(rel);if(!zip.file(path))throw fail('Custom XML relationship metadata is missing. Restore an intact document copy.');linked.add(path);}}
 const candidates=[];
 for(const part of Object.values(zip.files).filter(p=>!p.dir&&/^customXml\/[^/]+\.xml$/.test(p.name))){
  const raw=await part.async('string');
  // Namespace test avoids parsing unrelated application data and preserves it verbatim.
  if(!raw.includes(FOLIO))continue;
  if(raw.length>2*1024*1024)throw fail('Refhaven citation metadata exceeds the supported size.');
  const root=xml(raw).documentElement;
  if(root.namespaceURI===FOLIO&&root.localName==='references')candidates.push({path:part.name,root});
 }
 if(candidates.length>1)throw fail('Multiple Refhaven citation metadata parts were found. Restore one intact document copy.');
 if(candidates.length&&!linked.has(candidates[0].path))throw fail('Refhaven citation metadata relationship is missing. Restore an intact document copy.');
 return candidates[0]||null;
}
async function removeMetadata(zip,path){
 if(!path)return;
 zip.remove(path);zip.remove(path.replace(/([^/]+)$/,'_rels/$1.rels'));
 const relPart=zip.file(RELS);if(relPart){const rel=xml(await relPart.async('string'));for(const n of Array.from(rel.getElementsByTagNameNS(R,'Relationship')))if(n.getAttribute('Type')===CUSTOM_XML&&customXmlTarget(n)===path)n.parentNode.removeChild(n);zip.file(RELS,new XMLSerializer().serializeToString(rel));}
 const typesPart=zip.file('[Content_Types].xml');if(typesPart){const types=xml(await typesPart.async('string'));for(const n of Array.from(types.documentElement.childNodes))if(n.getAttribute?.('PartName')==='/'+path)n.parentNode.removeChild(n);zip.file('[Content_Types].xml',new XMLSerializer().serializeToString(types));}
}
function bibliographyMatches(doc,content,meta){
 const actual=visible(content);if(hash(actual)===meta.bibliographyHash)return true;
 const normalize=text=>text.replace(/\s+/g,' ').trim();
 if(meta.bibliographyText!==undefined)return typeof meta.bibliographyText==='string'&&hash(meta.bibliographyText)===meta.bibliographyHash&&normalize(actual)===normalize(meta.bibliographyText);
 // Older exports stored only a checksum. Reconstruct their original output and
 // prove it against that checksum before allowing Word's whitespace conversion.
 // Citation records were inserted in reverse document order on export.
 const records=Object.values(meta.citations);if(records.length>200||records.some(c=>!c||typeof c.source!=='string'||c.source.length>20000))return false;
 const source=records.reverse().map(c=>c.source).join('\n');
 for(const style of listStyles()){
  const result=generateCitations(source,meta.papers,style.id);
  const expected='References'+result.bibliography.map((text,i)=>richRuns(doc,text,result.bibliographyHtml?.[i]).map(run=>visible(run)).join('')).join('');
  if(hash(expected)===meta.bibliographyHash)return normalize(actual)===normalize(expected);
 }
 return false;
}
async function restoreManagedReferences(zip,doc){
 const managed=elements(doc,'sdt').map(node=>({node,tag:elements(node,'sdtPr')[0]?.getElementsByTagNameNS(W,'tag')[0]?.getAttributeNS(W,'val')})).filter(c=>c.tag?.startsWith('folio:'));
 const found=await findMetadata(zip);if(!found){if(managed.length)throw fail('Refhaven citation metadata is missing. Restore a copy with its citation controls intact.');return null;}
 let meta;try{const {root}=found;if(root.getAttribute('checksum')!==hash(root.textContent))throw Error();meta=JSON.parse(root.textContent);}catch{throw fail('Refhaven citation metadata is invalid. Restore an intact document copy.');}
 if(meta.version!==1||!meta.citations||typeof meta.citations!=='object'||Array.isArray(meta.citations)||!Array.isArray(meta.papers)||meta.papers.length>5000||Object.keys(meta.citations).length>10000)throw fail('Unsupported Refhaven citation metadata. Restore an intact document copy.');
 if(meta.papers.some(p=>!validPaper(p)))throw fail('Invalid embedded reference metadata.');
 const bibliographies=managed.filter(c=>c.tag==='folio:bibliography');
 if(bibliographies.length!==1)throw fail('The managed reference list is missing or duplicated. Restore one intact Refhaven reference list before updating.');
 meta.activeSources=[];meta.metadataPath=found.path;
 for(const c of managed){
  if(ancestor(c.node,'sdt')||ancestor(c.node,'txbxContent'))throw fail('Refhaven citation controls were moved into an unsupported document region.');
  const content=Array.from(c.node.childNodes).find(n=>n.namespaceURI===W&&n.localName==='sdtContent');
  if(!content)throw fail('A Refhaven citation control is incomplete.');
  if(c.tag==='folio:bibliography'){
   if(!bibliographyMatches(doc,content,meta))throw fail('The generated reference list was edited manually. Restore it, then update the source metadata in Refhaven.');
   c.node.parentNode.removeChild(c.node);continue;
  }
  const id=c.tag.slice('folio:citation:'.length),record=Object.hasOwn(meta.citations,id)?meta.citations[id]:null;
  if(!c.tag.startsWith('folio:citation:')||!record||typeof record.source!=='string'||record.source.length>20000||typeof record.display!=='string'||visible(content)!==record.display)throw fail('A generated citation was edited or its identifiers are missing. Restore that citation control; insert new identifier markers outside existing citations.');
  if(!ancestor(c.node,'p')||Array.from(content.childNodes).some(n=>n.nodeType===1&&(n.namespaceURI!==W||!['r','proofErr'].includes(n.localName)))||elements(content,'r').some(r=>Array.from(r.childNodes).some(n=>n.nodeType===1&&(n.namespaceURI!==W||!['rPr','t'].includes(n.localName)))))throw fail('A Refhaven citation control has unsupported content.');
  if(parseCitationMarkers(record.source).length!==1||parseCitationMarkers(record.source)[0].original!==record.source||record.baseProps&&(typeof record.baseProps!=='string'||record.baseProps.length>20000))throw fail('Invalid Refhaven citation source metadata.');
  const props=record.baseProps?xml(record.baseProps).documentElement:null;
  if(props&&(props.namespaceURI!==W||props.localName!=='rPr'))throw fail('Invalid Refhaven citation formatting metadata.');
  meta.activeSources.push(record.source);c.node.parentNode.replaceChild(textRun(doc,record.source,{},props),c.node);
 }
 return meta;
}
async function writeMetadata(zip,meta,path=META){
 const data=JSON.stringify(meta);if(data.length>2*1024*1024)throw fail('Too many embedded references for an editable Word document.');
 zip.file(path,`<references xmlns="${FOLIO}" checksum="${hash(data)}">${data.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</references>`);
 const rel=xml(zip.file(RELS)?await zip.file(RELS).async('string'):`<Relationships xmlns="${R}"/>`);
 if(!Array.from(rel.getElementsByTagNameNS(R,'Relationship')).some(n=>n.getAttribute('Type')===CUSTOM_XML&&customXmlTarget(n)===path)){const r=rel.createElementNS(R,'Relationship');r.setAttribute('Id','folio-'+randomUUID());r.setAttribute('Type',CUSTOM_XML);r.setAttribute('Target','../'+path);rel.documentElement.appendChild(r);}
 zip.file(RELS,new XMLSerializer().serializeToString(rel));
 const typesPath='[Content_Types].xml',C='http://schemas.openxmlformats.org/package/2006/content-types';const types=xml(zip.file(typesPath)?await zip.file(typesPath).async('string'):`<Types xmlns="${C}"/>`);
 if(!Array.from(types.documentElement.childNodes).some(n=>n.getAttribute?.('PartName')==='/'+path)){const t=types.createElementNS(C,'Override');t.setAttribute('PartName','/'+path);t.setAttribute('ContentType','application/xml');types.documentElement.appendChild(t);}
 zip.file(typesPath,new XMLSerializer().serializeToString(types));
}

function textRun(doc,text,{bold=false,italic=false,superscript=false,subscript=false,smallcaps=false}={},baseProps){
 const run=doc.createElementNS(W,'w:r');const props=baseProps?.cloneNode(true)||doc.createElementNS(W,'w:rPr');
 for(const [enabled,tag] of [[bold,'b'],[italic,'i'],[smallcaps,'smallCaps']])if(enabled&&!elements(props,tag).length)props.appendChild(doc.createElementNS(W,`w:${tag}`));
 if(superscript||subscript){for(const node of elements(props,'vertAlign'))node.parentNode.removeChild(node);const vert=doc.createElementNS(W,'w:vertAlign');vert.setAttributeNS(W,'w:val',superscript?'superscript':'subscript');props.appendChild(vert);}
 if(props.childNodes.length)run.appendChild(props);const t=doc.createElementNS(W,'w:t');t.setAttribute('xml:space','preserve');t.textContent=text;run.appendChild(t);return run;
}
function richRuns(doc,plain,html,baseProps){
 if(!html)return [textRun(doc,plain,{},baseProps)];
 try{const htmlDoc=xml(`<root>${html.replace(/&nbsp;/g,'&#160;')}</root>`);const runs=[];const walk=(node,format={})=>{if(node.nodeType===3){runs.push(textRun(doc,node.data,format,baseProps));return;}const tag=node.localName;const style=node.getAttribute?.('style')||'';const next={...format,bold:format.bold||tag==='b'||tag==='strong'||/font-weight:\s*bold/.test(style),italic:format.italic||tag==='i'||tag==='em'||/font-style:\s*italic/.test(style),superscript:tag==='sub'?false:format.superscript||tag==='sup',subscript:tag==='sup'?false:format.subscript||tag==='sub',smallcaps:format.smallcaps||/font-variant:\s*small-caps/.test(style)};for(const child of Array.from(node.childNodes||[]))walk(child,next);if(node.getAttribute?.('class')==='csl-left-margin')runs.push(textRun(doc,' ',{},baseProps));};walk(htmlDoc.documentElement);return runs;}catch{return [textRun(doc,plain,{},baseProps)];}
}
function bibliographyRuns(doc,paragraph,plain,html){for(const run of richRuns(doc,plain,html))paragraph.appendChild(run);}
function replaceCitation(doc,touched,start,end,citation,meta){
 const first=touched[0];const run=first.node.parentNode;if(run.namespaceURI!==W||run.localName!=='r')throw fail('A PMID marker uses unsupported Word text formatting.');
 const original=first.node.textContent;const prefix=original.slice(0,start-first.start);const suffix=touched.length===1?original.slice(end-first.start):'';
 // Split only the first run. Moving following nodes preserves their identities,
 // so earlier markers in this paragraph still point to valid text nodes.
 const tail=run.cloneNode(false);const props=Array.from(run.childNodes).find(n=>n.namespaceURI===W&&n.localName==='rPr');if(props)tail.appendChild(props.cloneNode(true));
 if(suffix){const text=first.node.cloneNode(false);text.textContent=suffix;text.setAttribute('xml:space','preserve');tail.appendChild(text);}
 while(first.node.nextSibling)tail.appendChild(first.node.nextSibling);
 first.node.textContent=prefix;first.node.setAttribute('xml:space','preserve');
 for(let i=1;i<touched.length;i++){const entry=touched[i];entry.node.textContent=i===touched.length-1?entry.node.textContent.slice(end-entry.start):'';entry.node.setAttribute('xml:space','preserve');}
 const parent=run.parentNode;const after=run.nextSibling;const id=randomUUID();const generated=control(doc,'folio:citation:'+id,richRuns(doc,citation.replacement,citation.replacementHtml,props));meta.citations[id]={source:citation.original,display:visible(generated),...(props?{baseProps:new XMLSerializer().serializeToString(props)}:{})};parent.insertBefore(generated,after);
 if(Array.from(tail.childNodes).some(n=>n.namespaceURI!==W||n.localName!=='rPr'))parent.insertBefore(tail,after);
}
export async function generateDocx(buffer,papers,styleId,citationOptions){
 const {zip,doc,parts,text,embeddedPapers,managedSources,metadataPath}=await openDocx(buffer);const references=mergePapers(papers,embeddedPapers);const result=generateCitations(text,references,styleId,citationOptions);
 if(managedSources.some(source=>!result.citations.some(c=>c.original===source)))throw fail('An existing citation has conflicting or missing reference identifiers. Resolve the metadata conflict before updating this document.');
 const resolved=resolveCitationMarkers(text,references);const cited=new Set(result.citations.flatMap(c=>c.pmids));
 const sourceAliases=new Set(result.citations.flatMap(c=>c.identifiers.map(i=>i.key)));
 const selected=[...resolved.records].filter(([id])=>cited.has(id)).map(([,paper])=>paper);
 // Retain aliases from compatible prior snapshots even if current library metadata omits one.
 const snapshots=snapshotPapers([...selected,...references.filter(p=>paperCitationIdentifiers(p).some(i=>sourceAliases.has(i.key)))]);
 const meta={version:1,citations:{},papers:[...new Map(snapshots.map(p=>[JSON.stringify(p),p])).values()]};
 if(meta.papers.length>5000)throw fail('Too many embedded references for an editable Word document.');
 for(const citation of [...result.citations].reverse()){
  if(citation.original===citation.replacement)continue;
  const p=parts.find(p=>citation.start>=p.offset&&citation.end<=p.offset+p.text.length);if(!p)throw fail('Keep each PMID marker within one Word paragraph.');
  if(elements(p.node,'fldChar').length||elements(p.node,'fldSimple').length)throw fail('A PMID marker is inside a Word field. Move it to plain manuscript text first.');
  const start=citation.start-p.offset,end=citation.end-p.offset;const touched=p.entries.filter(e=>e.end>start&&e.start<end);
  if(!touched.length)continue;
  if(touched.some(e=>ancestor(e.node,'sdt')))throw fail('Move new identifier markers outside existing Word content controls before generating references.');
  replaceCitation(doc,touched,start,end,citation,meta);
 }
 if(result.bibliography.length){
  const body=elements(doc,'body')[0];if(!body)throw fail('Word document body is missing.');const section=Array.from(body.childNodes).find(n=>n.namespaceURI===W&&n.localName==='sectPr');
  const bibliography=control(doc,'folio:bibliography',[]);const bibliographyContent=elements(bibliography,'sdtContent')[0];body.insertBefore(bibliography,section||null);
  const heading=doc.createElementNS(W,'w:p');const headingProps=doc.createElementNS(W,'w:pPr');const headingSpacing=doc.createElementNS(W,'w:spacing');headingSpacing.setAttributeNS(W,'w:before','240');headingSpacing.setAttributeNS(W,'w:after','120');headingProps.appendChild(headingSpacing);headingProps.appendChild(doc.createElementNS(W,'w:keepNext'));heading.appendChild(headingProps);const bookmark=doc.createElementNS(W,'w:bookmarkStart');const nextId=String(Math.max(0,...elements(doc,'bookmarkStart').map(n=>Number(n.getAttributeNS(W,'id'))||0))+1);bookmark.setAttributeNS(W,'w:id',nextId);bookmark.setAttributeNS(W,'w:name','FolioGeneratedReferences');heading.appendChild(bookmark);heading.appendChild(textRun(doc,'References',{bold:true}));const bookmarkEnd=doc.createElementNS(W,'w:bookmarkEnd');bookmarkEnd.setAttributeNS(W,'w:id',nextId);heading.appendChild(bookmarkEnd);bibliographyContent.appendChild(heading);
  result.bibliography.forEach((entry,index)=>{const p=doc.createElementNS(W,'w:p');const props=doc.createElementNS(W,'w:pPr');const spacing=doc.createElementNS(W,'w:spacing');spacing.setAttributeNS(W,'w:after','120');props.appendChild(spacing);const indent=doc.createElementNS(W,'w:ind');indent.setAttributeNS(W,'w:left','360');indent.setAttributeNS(W,'w:hanging','360');props.appendChild(indent);p.appendChild(props);bibliographyRuns(doc,p,entry,result.bibliographyHtml?.[index]);bibliographyContent.appendChild(p);});
  meta.bibliographyText=visible(bibliography);meta.bibliographyHash=hash(meta.bibliographyText);await writeMetadata(zip,meta,metadataPath||META);
 }else{await removeMetadata(zip,metadataPath);}
 zip.file('word/document.xml',new XMLSerializer().serializeToString(doc));
 return {...result,warnings:[...result.warnings,'Main body and tables converted; other document regions are unchanged. Keep citation controls intact. Re-upload this Word document to update references after revisions; add new identifier markers outside existing citations.'],buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})};
}
export async function createDocx(text,papers,styleId,citationOptions){
 const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');const zip=new JSZip();
 zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
 zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
 zip.file('word/styles.xml',`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:color w:val="000000"/></w:rPr></w:style></w:styles>`);
 zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${text.split(/\r?\n/).map(line=>`<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`).join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
 return generateDocx(await zip.generateAsync({type:'nodebuffer'}),papers,styleId,citationOptions);
}
