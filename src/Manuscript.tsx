import {useEffect,useRef,useState} from 'react';
import {api,download,downloadApi} from './api';
import type {Paper} from './model';
import CitationStyles, {type CitationStyle} from './CitationStyles';
type CitationPaper=Partial<Paper>;
type Result={revision?:boolean;text:string;bibliography:string[];unresolved:string[];warnings:string[];citations:{original:string;replacement:string;pmids:string[]}[]};
export default function Manuscript({onClose,onLibraryChange}:{onClose:()=>void;onLibraryChange:()=>Promise<void>}){
 const [text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[style,setStyle]=useState('apa'),[styles,setStyles]=useState<CitationStyle[]>([]),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[resolve,setResolve]=useState(true),[savePapers,setSavePapers]=useState(false);
 const temporary=useRef<CitationPaper[]>([]);
 const [stylesBusy,setStylesBusy]=useState(false);
 const locked=busy||stylesBusy;
 const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{close.current?.focus();void api<CitationStyle[]>('/api/citations/styles').then(setStyles).catch(e=>setStatus(e.message));},[]);
 function wordBody(papers=temporary.current){
  const form=new FormData();form.append('document',file!);form.append('papers',JSON.stringify(papers));return form;
 }
 const preview=(papers=temporary.current)=>file?api<Result>(`/api/word/preview?style=${encodeURIComponent(style)}`,{method:'POST',body:wordBody(papers)}):api<Result>('/api/citations/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,style,papers})});
 async function generate(){
  setBusy(true);setStatus('Checking citation markers…');setResult(null);
  try{
   let output=await preview();const failed:string[]=[];let saved=0,capacityLimited=false;
   if(resolve&&output.unresolved.length){
    capacityLimited=output.unresolved.filter(id=>!id.startsWith('folio:')).length>Math.max(0,100-temporary.current.length);
    for(const [i,identifier] of output.unresolved.slice(0,Math.max(0,100-temporary.current.length)).entries()){
     if(identifier.startsWith('folio:'))continue;
     setStatus(`Looking up reference ${i+1}/${Math.min(output.unresolved.length,100)}: ${identifier}. PubMed rate limits are retried automatically…`);
     try{
      const paper=await api<CitationPaper>(`/api/citations/lookup?identifier=${encodeURIComponent(identifier)}`);
      temporary.current.push(paper);
     }catch(e){failed.push(`${identifier}: ${e instanceof Error?e.message:'not found'}`);}
    }
    output=await preview();
   }
   if(savePapers&&temporary.current.length){
    const remaining:CitationPaper[]=[];
    for(const paper of temporary.current){try{await api('/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...paper,lookup:false})});saved++;}catch(e){remaining.push(paper);failed.push(`${paper.title}: could not save to library: ${e instanceof Error?e.message:'save failed'}`);}}
    temporary.current=remaining;if(saved){await onLibraryChange();output=await preview();}
   }
   setResult(output);
   setStatus([`Generated ${output.citations.length} citations and ${output.bibliography.length} references.`,...failed,output.unresolved.length?'Some references could not be resolved, so Word export is paused. See the lookup errors above, retry later, or supply the reference metadata in your library.':'',output.unresolved.length&&capacityLimited?'This session has room for 100 temporary lookup records. Save resolved references to your library to make room for more.':''].filter(Boolean).join('\n'));
  }catch(e){setStatus(e instanceof Error?e.message:'Generation failed.');}finally{setBusy(false);}
 }
 async function exportWord(){setBusy(true);try{if(file)await downloadApi(`/api/word/generate?style=${encodeURIComponent(style)}`,{method:'POST',body:wordBody()},`${file.name.replace(/\.docx$/i,'')}-${style}.docx`);else await downloadApi('/api/citations/word',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,style,papers:temporary.current})},`manuscript-${style}.docx`);setStatus('Word document downloaded. Edit this Word file and upload it again to refresh references or change styles.');}catch(e){setStatus(e instanceof Error?e.message:'Export failed.');}finally{setBusy(false);}}
 return <section className="folio-manuscript" role="dialog" aria-modal="true" aria-label="Generate manuscript references" onKeyDown={e=>{if(e.key==='Escape'&&!locked)onClose();}}><header><button ref={close} disabled={locked} onClick={onClose}>← Library</button><h2>Manuscript references</h2><span>Identifier → citation → bibliography</span></header><div className="folio-manuscript-grid"><section><h3>Your manuscript</h3><p>Numeric PMIDs work directly: <code>(36599988)</code>. Put multiple citations in one pair of parentheses, separated by commas: <code>(36599988, 40903587)</code>. For short PMIDs, use <code>(PMID: 123)</code>. You can also use <code>(doi:10.1038/nphys1170)</code> or <code>(arxiv:1706.03762)</code>, and combine identifier types with semicolons: <code>(36599988; doi:10.1038/nphys1170)</code>. For any saved paper, use “Copy citation marker” in its library details.</p><label className="folio-upload">Import a Word manuscript<input type="file" accept=".docx" disabled={locked} onChange={e=>{const chosen=e.target.files?.[0];if(chosen&&chosen.size>20*1024*1024){setStatus('Word manuscripts must be under 20 MB.');e.target.value='';return;}setFile(chosen||null);temporary.current=[];setResult(null);}}/><small>{file?file.name:'Or paste plain text below. Original files are never overwritten.'}</small></label>{file?<><p>Word formatting, tables, and embedded images are retained. Citations in headers, footnotes, endnotes and text boxes are not converted.</p><button className="folio-cite" disabled={locked} onClick={()=>{setFile(null);setResult(null);}}>Use pasted text instead</button></>:<textarea aria-label="Manuscript with citation markers" placeholder="Paste your manuscript with PMID, DOI, or arXiv markers here…" value={text} disabled={locked} onChange={e=>{setText(e.target.value);setResult(null);}}/>}<CitationStyles styles={styles} value={style} disabled={busy} onBusyChange={setStylesBusy} onChange={id=>{setStyle(id);setResult(null);}} onInstall={(installed,id)=>{setStyles(installed);setStyle(id);setResult(null);}}/><label className="folio-check"><input type="checkbox" checked={resolve} disabled={locked} onChange={e=>{setResolve(e.target.checked);if(!e.target.checked)setSavePapers(false);setResult(null);}}/>Look up missing identifiers</label><label className="folio-check"><input type="checkbox" checked={savePapers} disabled={locked||!resolve} onChange={e=>{setSavePapers(e.target.checked);setResult(null);}}/>Save looked-up papers to my library</label><small>Without saving, looked-up papers are used only in this reference generator and its exports.</small><small>Lookup sends identifiers to PubMed, Crossref, or arXiv. Manuscript text stays on this computer. Exported Word files include the cited reference metadata for future revisions.</small><button className="folio-primary" disabled={locked||(!text.trim()&&!file)||!styles.length} onClick={()=>void generate()}>{busy?'Working…':'Generate references'}</button><p className="folio-generation-status" role="status">{status}</p></section><section className="folio-reference-preview"><h3>Preview</h3>{result?<>{result.unresolved.length>0&&<div className="folio-reference-warning">Unresolved identifiers: {result.unresolved.join(', ')}. These markers remain unchanged.</div>}{result.warnings.map((warning,i)=><p className="folio-hint" key={i}>{warning}</p>)}<pre>{result.text}</pre><h3>References</h3>{result.bibliography.map((entry,i)=><p key={i}>{entry}</p>)}{!result.citations.length&&<p>No resolved citation markers were found.</p>}<div className="folio-export-row"><button className="folio-primary" disabled={locked||(!result.citations.length&&!result.revision)||Boolean(result.unresolved.length)} onClick={()=>void exportWord()}>Download Word document</button><button className="folio-cite" disabled={locked} onClick={()=>download(result.text+'\n\nReferences\n\n'+result.bibliography.join('\n\n'),'manuscript-references.txt','text/plain')}>Download plain text</button></div><p className="folio-hint">For revisions, edit the downloaded Word file, add new identifier markers, and upload it again. Keep existing citation controls intact; replace an entire citation with a marker to change its sources. Folio refreshes numbering and replaces its bibliography on export. Older Folio exports without revision metadata require the original marker manuscript.</p></>:<div className="folio-empty"><span>¶</span><p>Your formatted citations and full reference list will appear here.</p></div>}</section></div></section>;
}
