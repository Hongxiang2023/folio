export type HighlightColor = 'yellow'|'green'|'blue'|'pink'|'purple';
export type Highlight = {id:string;pdfId:string;page:number;paragraph:number;start:number;end:number;quote:string;createdAt:string;color?:HighlightColor;note?:string};
export type Paper = { highlights?:Highlight[]; id:string; title:string; authors:string; year:string; journal:string; doi:string; collection:string; tags:string; status:string; notes:string; starred:boolean; pdfId?:string; pdfName?:string; sourceUrl?:string; pdfUrl?:string; pmid?:string; arxivId?:string; cslType?:string; publisher?:string; publisherPlace?:string; eventTitle?:string; volume?:string; issue?:string; pages?:string; journalAbbreviation?:string; cslAuthors?:{family?:string;given?:string;literal?:string}[]; dateParts?:number[] };
export const statuses=['To read','Reading','Finished'];
export const empty=():Paper=>({id:crypto.randomUUID(),title:'',authors:'',year:'',journal:'',doi:'',collection:'Unfiled',tags:'',status:'To read',notes:'',starred:false});
export function validHighlights(value:unknown):value is Highlight[]|undefined {
 if(value===undefined)return true;
 if(!Array.isArray(value)||value.length>5000)return false;
 const ids=new Set<string>();
 return value.every(h=>{
  if(!h||typeof h!=='object'||typeof h.id!=='string'||!h.id.trim()||h.id.length>128||ids.has(h.id)||typeof h.pdfId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(h.pdfId)||!Number.isSafeInteger(h.page)||h.page<1||h.page>500||!Number.isSafeInteger(h.paragraph)||h.paragraph<0||h.paragraph>=5000||!Number.isSafeInteger(h.start)||h.start<0||!Number.isSafeInteger(h.end)||h.end<=h.start||h.end>50000||typeof h.quote!=='string'||!h.quote.length||h.quote.length>10000||h.end-h.start!==h.quote.length||typeof h.createdAt!=='string'||h.createdAt.length>64||!Number.isFinite(Date.parse(h.createdAt)))return false;
  if(h.color!==undefined&&!['yellow','green','blue','pink','purple'].includes(h.color))return false;
  if(h.note!==undefined&&(typeof h.note!=='string'||h.note.length>10000))return false;
  ids.add(h.id);return true;
 });
}
export function valid(value:unknown):value is Paper {
 if(!value||typeof value!=='object')return false;
 const p=value as Record<string,unknown>;
 return ['id','title','authors','year','journal','doi','collection','tags','status','notes'].every(k=>typeof p[k]==='string')&&validHighlights(p.highlights)&&typeof p.starred==='boolean'&&Boolean((p.id as string).trim())&&Boolean((p.title as string).trim())&&statuses.includes(p.status as string)&&['pdfId','pdfName','sourceUrl','pdfUrl','pmid','arxivId','cslType','publisher','publisherPlace','eventTitle','volume','issue','pages','journalAbbreviation'].every(k=>p[k]===undefined||typeof p[k]==='string');
}
export function bib(p:Paper){const esc=(s:string)=>s.replace(/[\\{}%&#_$^~]/g,c=>({'\\':'\\textbackslash{}','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c]||'\\'+c));return `@${p.cslType==='paper-conference'?'inproceedings':p.cslType==='article'?'misc':'article'}{ref${Array.from(p.id).map(c=>c.codePointAt(0)!.toString(16)).join('x')},\n${Object.entries({title:p.title,author:p.authors.split(';').map(a=>a.trim()).filter(Boolean).join(' and '),year:p.year,[p.cslType==='paper-conference'?'booktitle':'journal']:p.journal,doi:p.doi,volume:p.volume||'',number:p.issue||'',pages:p.pages||'',url:p.pmid?`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`:p.sourceUrl||''}).filter(([,v])=>v).map(([k,v])=>`  ${k} = {${esc(v)}}`).join(',\n')}\n}`;}
export function citationMarker(p:Paper){return p.pmid?`(PMID: ${p.pmid})`:p.doi?`(doi:${normalizedDoi(p.doi)})`:p.arxivId?`(arxiv:${p.arxivId})`:`(folio:${p.id})`;}
export function normalizedDoi(value:string){return value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'');}
export function deduplicate(existing:Paper[],incoming:Paper[]){const ids=new Set(existing.map(p=>p.id));const pmids=new Set(existing.map(p=>p.pmid).filter(Boolean));const keys=new Set(existing.map(p=>p.doi?`doi:${normalizedDoi(p.doi).toLowerCase()}`:p.sourceUrl?`url:${p.sourceUrl}`:`id:${p.id}`));const added:Paper[]=[];for(const p of incoming){const key=p.doi?`doi:${normalizedDoi(p.doi).toLowerCase()}`:p.sourceUrl?`url:${p.sourceUrl}`:`id:${p.id}`;if(!ids.has(p.id)&&!keys.has(key)&&(!p.pmid||!pmids.has(p.pmid))){if(p.pmid)pmids.add(p.pmid);keys.add(key);ids.add(p.id);added.push(p);}}return added;}
export function importReferences(text:string,format:string):Paper[]{
 if(format==='json'){const data:unknown=JSON.parse(text);if(!Array.isArray(data)||!data.every(valid))throw Error('Choose a Folio reference backup.');return data.map(p=>{const copy={...p,collection:p.collection.trim()||'Unfiled'};delete copy.pdfId;delete copy.pdfName;return copy;});}
 if(format==='ris'){const result:Paper[]=[];let p=empty(),accession='',database='';for(const line of text.split(/\r?\n/)){const m=line.match(/^([A-Z0-9]{2})\s{2}-\s?(.*)$/);if(!m)continue;const [,tag,value]=m;if(tag==='TY'){p=empty();if(['CONF','CPAPER'].includes(value.trim()))p.cslType='paper-conference';accession='';database='';}if(['TI','T1'].includes(tag))p.title=value;if(['AU','A1'].includes(tag))p.authors+=(p.authors?'; ':'')+value;if(['PY','Y1'].includes(tag))p.year=value.slice(0,4);if(['JO','JF','T2'].includes(tag))p.journal=value;if(tag==='AN')accession=value;if(tag==='DB')database=value;if(tag==='N1'&&/^PMID:\s*[1-9]\d{0,8}$/i.test(value))p.pmid=value.replace(/^PMID:\s*/i,'');if(tag==='VL')p.volume=value;if(tag==='IS')p.issue=value;if(tag==='SP')p.pages=value;if(tag==='EP')p.pages+=(p.pages?'-':'')+value;if(tag==='DO')p.doi=normalizedDoi(value);if(tag==='UR'&&/^https?:\/\//.test(value)){p.sourceUrl=value;const pmid=value.match(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/([1-9]\d{0,8})\/?$/);if(pmid)p.pmid=pmid[1];}if(tag==='KW')p.tags+=(p.tags?', ':'')+value;if(tag==='ER'&&p.title.trim()){if(/pubmed/i.test(database)&&/^[1-9]\d{0,8}$/.test(accession))p.pmid=accession;result.push(p);}}if(!result.length)throw Error('No complete references found in this RIS file.');return result;}
 throw Error('Choose a .ris or Folio .json reference file.');
}

export function displayAuthors(authors:string){const names=authors.split(';').map(name=>name.trim()).filter(Boolean);return names.length>2?`${names[0]}; …; ${names[names.length-1]}`:names.join('; ')||'No authors added';}
