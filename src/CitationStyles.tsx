import {useId, useState} from 'react';
import {api} from './api';

export type CitationStyle = {id:string;label:string;builtin?:boolean;source?:string;parent?:string;class?:string};
type Installed = {styles:CitationStyle[];installedId:string};

export default function CitationStyles({styles,value,onChange,onInstall,disabled,onBusyChange}:{
 styles:CitationStyle[];value:string;onChange:(id:string)=>void;onInstall:(styles:CitationStyle[],id:string)=>void;
 disabled:boolean;onBusyChange:(busy:boolean)=>void;
}) {
 const panelId=useId();
 const [filter,setFilter]=useState(''),[open,setOpen]=useState(false),[query,setQuery]=useState('');
 const [matches,setMatches]=useState<CitationStyle[]>([]),[searched,setSearched]=useState(false),[truncated,setTruncated]=useState(false);
 const [working,setWorking]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
 const locked=disabled||Boolean(working);
 const filtered=styles.filter(style=>`${style.label} ${style.id}`.toLowerCase().includes(filter.trim().toLowerCase()));
 const selected=styles.find(style=>style.id===value);
 // Preserve the current selection while searching, even when it does not match.
 const options=selected&&!filtered.some(style=>style.id===value)?[selected,...filtered]:filtered;
 function start(action:string){setWorking(action);onBusyChange(true);setError('');setMessage('');}
 function finish(){setWorking('');onBusyChange(false);}
 async function search(){
  if(locked||!query.trim())return;
  start('search');setMatches([]);setSearched(false);
  try{const result=await api<{styles:CitationStyle[];truncated:boolean}>(`/api/citations/style-catalog?q=${encodeURIComponent(query.trim())}`);setMatches(result.styles);setTruncated(result.truncated);setSearched(true);}
  catch(e){setError(e instanceof Error?e.message:'Could not search citation styles.');}finally{finish();}
 }
 async function install(id:string){
  if(locked)return;
  start(id);
  try{const result=await api<Installed>('/api/citations/style-install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});onInstall(result.styles,result.installedId);setFilter('');setMessage(`Installed ${result.styles.find(style=>style.id===result.installedId)?.label||id}. This style is now selected.`);}
  catch(e){setError(e instanceof Error?e.message:'Could not install this style.');}finally{finish();}
 }
 async function importFile(file:File){
  if(locked)return;
  if(file.size>1024*1024){setMessage('');setError('CSL files must be under 1 MB.');return;}
  start('import');
  try{const xml=await file.text();const result=await api<Installed>('/api/citations/style-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({xml})});onInstall(result.styles,result.installedId);setFilter('');setMessage(`Imported ${result.styles.find(style=>style.id===result.installedId)?.label||file.name}. This style is now selected.`);}
  catch(e){setError(e instanceof Error?e.message:'Could not import this CSL file.');}finally{finish();}
 }
 return <div className="folio-citation-styles">
  <label className="folio-field">Search installed styles<input type="search" value={filter} disabled={locked} placeholder="Style or journal name" onChange={e=>setFilter(e.target.value)}/></label>
  <label className="folio-field">Citation style<select value={value} disabled={locked||!styles.length} onChange={e=>onChange(e.target.value)}>{options.map(style=><option key={style.id} value={style.id}>{style.label}</option>)}</select></label>
  {filter.trim()&&!filtered.length&&<p className="folio-hint">No installed styles match. Your current style remains selected.</p>}
  <p className="folio-hint">{styles.length} styles available offline. Use Get more styles to add others.</p>
  <button type="button" className="folio-cite" disabled={locked} aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(!open)}>{open?'Close style manager':'Get more styles'}</button>
  {open&&<div className="folio-style-manager" id={panelId}>
   <h4>Add a citation style</h4>
   <p>Find journal and author–date styles from the repository used by Zotero, or import a CSL file. Footnote and endnote styles are not supported in this manuscript workflow.</p>
   <form onSubmit={e=>{e.preventDefault();void search();}}>
    <label className="folio-field">Search the style repository<input type="search" value={query} disabled={locked} placeholder="e.g. Nature, Harvard, Vancouver" onChange={e=>setQuery(e.target.value)}/></label>
    <button type="submit" className="folio-cite" disabled={locked||!query.trim()}>{working==='search'?'Searching…':'Search repository'}</button>
   </form>
   {searched&&<><p className="folio-hint" role="status">{matches.length?`${matches.length} styles found${truncated?' · Refine your search to see more.':'.'}`:'No matching styles. Try another journal or style name.'}</p>
    {matches.length>0&&<ul className="folio-style-results">{matches.map(style=>{const installed=styles.some(existing=>existing.id===style.id);return <li key={style.id}><span>{style.label}</span><button type="button" className="folio-cite" disabled={locked||installed} onClick={()=>void install(style.id)}>{working===style.id?'Installing…':installed?'Installed':'Install'}</button></li>;})}</ul>}
   </>}
   <label className="folio-upload">Import a CSL style<input type="file" accept=".csl,application/xml,text/xml" disabled={locked} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importFile(file);}}/><small>Choose a .csl file exported or downloaded from Zotero.</small></label>
   <p className="folio-hint"><a href="https://www.zotero.org/styles" target="_blank" rel="noreferrer">Browse Zotero’s style repository ↗</a></p>
   <p className="folio-hint">Searching and downloading styles require internet access. Your manuscript and library are not sent.</p>
  </div>}
  {message&&<p className="folio-hint" role="status">{message}</p>}
  {error&&<p className="folio-reference-warning" role="alert">{error}</p>}
 </div>;
}
