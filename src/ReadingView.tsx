import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {api} from './api';
import PaperChat from './PaperChat';
import {equationVisuals} from '../server/reading-visuals.mjs';
import SharpFigure from './SharpFigure';
import {zoomAtPoint,wheelZoom} from './figure-zoom';
import type {ReadingContext} from './reading-sections';
import type {ReadingCache} from './reading-layout';
import type {Highlight,HighlightColor} from './model';
import {locateHighlight,highlightSegments} from './highlights';

const annotationColors:HighlightColor[]=['yellow','green','blue','pink','purple'];
const colorName=(color:HighlightColor)=>color[0].toUpperCase()+color.slice(1);
type AnnotationDraft={id?:string;parts:SelectionPart[];quote:string;note:string;color:HighlightColor;initialNote:string;initialColor:HighlightColor};
type SelectionPart={page:number;paragraph:number;start:number;end:number;quote:string};
export default function ReadingView({pdfId,onOriginal,notes,context,highlights,onAddHighlights,onRemoveHighlight,onUpdateHighlight,onAnnotationDraftChange}:{
 pdfId:string;context:ReadingContext;onOriginal:(page?:number)=>void;notes:ReactNode;highlights:Highlight[];
 onAddHighlights:(values:Highlight[])=>Promise<void>;onRemoveHighlight:(id:string)=>Promise<void>;
 onUpdateHighlight:(id:string,patch:{color?:HighlightColor;note?:string})=>Promise<void>;
 onAnnotationDraftChange?:(dirty:boolean)=>void;
}){
 const [cache,setCache]=useState<ReadingCache|null>(null),[bytes,setBytes]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[figure,setFigure]=useState(0),[page,setPage]=useState(1),[fontSize,setFontSize]=useState(18),[zoom,setZoom]=useState(100);
 const [sideTab,setSideTab]=useState<'figures'|'chat'>('figures');
 const [selection,setSelection]=useState<SelectionPart[]>([]),[annotationBusy,setAnnotationBusy]=useState(false),[dragging,setDragging]=useState(false),[section,setSection]=useState('');
 const [highlightColor,setHighlightColor]=useState<HighlightColor>('yellow'),[annotationDraft,setAnnotationDraft]=useState<AnnotationDraft|null>(null),[highlightsOpen,setHighlightsOpen]=useState(false),[annotationStatus,setAnnotationStatus]=useState('');
 const annotationDirty=Boolean(annotationDraft&&(annotationDraft.note!==annotationDraft.initialNote||annotationDraft.color!==annotationDraft.initialColor));
 useEffect(()=>{onAnnotationDraftChange?.(annotationDirty);return()=>onAnnotationDraftChange?.(false);},[annotationDirty,onAnnotationDraftChange]);
 useEffect(()=>{if(!annotationDirty)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[annotationDirty]);
 const noteEditor=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{if(annotationDraft){noteEditor.current?.focus();document.getElementById('reading-annotation-editor')?.scrollIntoView({block:'nearest',behavior:'smooth'});}},[annotationDraft?.id,Boolean(annotationDraft)]);
 const controller=useRef<AbortController|null>(null),alive=useRef(true),textPane=useRef<HTMLElement>(null),imagePane=useRef<HTMLDivElement>(null);
 const zoomValue=useRef(100),zoomPosition=useRef<{left:number;top:number}|null>(null);
 const pan=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
 const route=`/api/reading-cache/${encodeURIComponent(pdfId)}`;
 useEffect(()=>{alive.current=true;const abort=new AbortController();void api<{cache:ReadingCache|null;bytes:number}>(route,{signal:abort.signal}).then(data=>{if(!abort.signal.aborted){setCache(data.cache);setBytes(data.bytes);}}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>{alive.current=false;abort.abort();controller.current?.abort();};},[route]);
 useEffect(()=>{if(imagePane.current){imagePane.current.scrollLeft=0;imagePane.current.scrollTop=0;}pan.current=null;setDragging(false);},[figure]);
 function changeZoom(target:number,clientX?:number,clientY?:number){
  const pane=imagePane.current;if(!pane)return;
  const rect=pane.getBoundingClientRect();
  const x=clientX===undefined?pane.clientWidth/2:clientX-rect.left-pane.clientLeft;
  const y=clientY===undefined?pane.clientHeight/2:clientY-rect.top-pane.clientTop;
  const position=zoomPosition.current||{left:pane.scrollLeft,top:pane.scrollTop};
  const next=zoomAtPoint(zoomValue.current,target,position.left,position.top,x,y);
  if(next.zoom===zoomValue.current)return;
  zoomValue.current=next.zoom;zoomPosition.current=next;pan.current=null;setDragging(false);setZoom(next.zoom);
 }
 useLayoutEffect(()=>{const pane=imagePane.current,position=zoomPosition.current;if(pane&&position){pane.scrollLeft=position.left;pane.scrollTop=position.top;zoomPosition.current=null;}},[zoom]);
 useEffect(()=>{
  const pane=imagePane.current;if(!pane)return;
  const wheel=(event:WheelEvent)=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();event.stopPropagation();changeZoom(wheelZoom(zoomValue.current,event.deltaY,event.deltaMode,pane.clientHeight),event.clientX,event.clientY);};
  pane.addEventListener('wheel',wheel,{passive:false});return()=>pane.removeEventListener('wheel',wheel);
 },[cache,figure,sideTab]);
 useEffect(()=>{
  const update=()=>{
   const selected=window.getSelection(),pane=textPane.current;
   if(!selected||selected.isCollapsed||!selected.rangeCount||!pane||!pane.contains(selected.anchorNode)||!pane.contains(selected.focusNode)){if(!document.activeElement?.closest('.reading-annotation-tools'))setSelection([]);return;}
   const range=selected.getRangeAt(0),parts:SelectionPart[]=[];
   for(const node of pane.querySelectorAll<HTMLElement>('[data-reading-paragraph]')){
    if(!range.intersectsNode(node))continue;
    const text=node.textContent||'';
    const offset=(container:Node,position:number)=>{const before=document.createRange();before.selectNodeContents(node);before.setEnd(container,position);return before.toString().length;};
    const start=node.contains(range.startContainer)?offset(range.startContainer,range.startOffset):0;
    const end=node.contains(range.endContainer)?offset(range.endContainer,range.endOffset):text.length;
    if(end>start&&text.slice(start,end).trim())parts.push({page:Number(node.dataset.page),paragraph:Number(node.dataset.readingParagraph),start,end,quote:text.slice(start,end)});
   }
   setSelection(parts);
  };
  document.addEventListener('selectionchange',update);return()=>document.removeEventListener('selectionchange',update);
 },[cache]);
 async function generate(){
  const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setProgress('Opening saved PDF…');
  try{const {parsePdf}=await import('./parse-pdf');if(abort.signal.aborted)return;const parsed=await parsePdf(pdfId,abort.signal,message=>{if(alive.current)setProgress(message);},cache||undefined,context);if(abort.signal.aborted)return;
   setProgress('Saving reading cache…');const saved=await api<{cache:ReadingCache;bytes:number}>(route,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed),signal:abort.signal});
   if(alive.current){setCache(saved.cache);setBytes(saved.bytes);setPage(1);setFigure(0);setSection('');setSelection([]);}
  }catch(e){if(alive.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:'Could not parse this PDF. Use the original PDF viewer.');}
  finally{if(alive.current){setBusy(false);setProgress('');}}
 }
 async function remove(){setBusy(true);setError('');try{await api(route,{method:'DELETE'});if(alive.current){setCache(null);setBytes(0);setSelection([]);}}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}}
 async function addHighlight(parts=selection,color=highlightColor,note=''){
  if(!parts.length)return;
  if(parts.some(part=>part.quote.length>10000)){setError('Select a shorter passage to highlight (up to 10,000 characters per paragraph).');return;}
  setAnnotationBusy(true);setError('');setAnnotationStatus('');
  try{await onAddHighlights(parts.map((part,index)=>({...part,id:crypto.randomUUID(),pdfId,createdAt:new Date().toISOString(),color,...(index===0&&note?{note}:{})})));if(alive.current){window.getSelection()?.removeAllRanges();setSelection([]);setAnnotationDraft(null);setHighlightsOpen(true);setAnnotationStatus(note?'Passage note saved.':'Highlight saved.');}}
  catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setAnnotationBusy(false);}
 }
 async function removeHighlight(id:string){setAnnotationBusy(true);setError('');setAnnotationStatus('');try{await onRemoveHighlight(id);if(alive.current){if(annotationDraft?.id===id)setAnnotationDraft(null);setAnnotationStatus('Highlight and its note removed.');}}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setAnnotationBusy(false);}}
 function startPassageNote(){
  if(!selection.length||annotationBusy||busy)return;
  setAnnotationDraft({parts:selection.map(part=>({...part})),quote:selection.map(part=>part.quote).join('\n\n'),note:'',color:highlightColor,initialNote:'',initialColor:highlightColor});setSideTab('figures');setAnnotationStatus('');
 }
 function editAnnotation(id:string){
  if(annotationBusy||busy)return;
  if(annotationDirty&&!window.confirm('Discard your unsaved passage note or color changes?'))return;
  const highlight=highlights.find(h=>h.id===id&&h.pdfId===pdfId);if(!highlight)return;
  setAnnotationDraft({id,parts:[],quote:highlight.quote,note:highlight.note||'',color:highlight.color||'yellow',initialNote:highlight.note||'',initialColor:highlight.color||'yellow'});setSideTab('figures');setHighlightsOpen(true);setAnnotationStatus('');
 }
 async function saveAnnotation(){
  if(!annotationDraft||annotationBusy)return;
  const draft=annotationDraft;
  if(!draft.id){await addHighlight(draft.parts,draft.color,draft.note);return;}
  setAnnotationBusy(true);setError('');setAnnotationStatus('');
  try{await onUpdateHighlight(draft.id,{color:draft.color,note:draft.note});if(alive.current){setAnnotationDraft(null);setAnnotationStatus('Annotation saved.');}}
  catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setAnnotationBusy(false);}
 }
 function colorChoices(value:HighlightColor,onChange:(color:HighlightColor)=>void,label:string){return <div className="reading-color-options" role="group" aria-label={label}>{annotationColors.map(color=><button key={color} type="button" className={`reading-color-swatch annotation-${color}`} aria-label={`${colorName(color)} highlight`} title={colorName(color)} aria-pressed={value===color} disabled={annotationBusy||busy} onMouseDown={e=>e.preventDefault()} onClick={()=>onChange(color)}><span aria-hidden="true">{value===color?'✓':''}</span></button>)}</div>;}
 const activeFigure=cache?.figures[figure];
 const sections=useMemo(()=>cache?.pages.flatMap(p=>(p.headings||[]).map((h,index)=>({...h,page:p.number,key:`${p.number}:${h.paragraph}:${index}`})))||[],[cache]);
 const savedHighlights=useMemo(()=>highlights.filter(h=>h.pdfId===pdfId).map(h=>({...h,anchor:cache?.pages[h.page-1]?locateHighlight(h,cache.pages[h.page-1]):null})),[highlights,pdfId,cache]);
 function jump(n:number,paragraph?:number){setPage(n);document.getElementById(paragraph===undefined?`reading-page-${n}`:`reading-paragraph-${n}-${paragraph}`)?.scrollIntoView({block:'start',behavior:'smooth'});}
 const annotationPanel=<section id="reading-notes" className="reading-notes">
  {annotationDraft&&<form id="reading-annotation-editor" className="reading-annotation-editor" aria-label={annotationDraft.id?'Edit passage annotation':'Add passage note'} onSubmit={e=>{e.preventDefault();void saveAnnotation();}}>
   <h3>{annotationDraft.id?'Edit annotation':'Note on selected passage'}</h3>
   <blockquote className={`annotation-${annotationDraft.color}`}>{annotationDraft.quote}</blockquote>
   {annotationDraft.parts.length>1&&<p className="reading-annotation-hint">All selected paragraphs will be highlighted. This note will be attached to the first paragraph.</p>}
   <div className="reading-annotation-color-label">Highlight color {colorChoices(annotationDraft.color,color=>setAnnotationDraft(current=>current?{...current,color}:null),'Annotation highlight color')}</div>
   <label className="reading-passage-note-label">Passage note<textarea ref={noteEditor} value={annotationDraft.note} maxLength={10000} disabled={annotationBusy} onChange={e=>setAnnotationDraft(current=>current?{...current,note:e.target.value}:null)} placeholder="What matters about this passage?"/></label>
   <small>{annotationDraft.note.length.toLocaleString()} / 10,000 characters{annotationDraft.id?' · Clear the note to keep just the highlight.':''}</small>
   <div className="reading-annotation-actions"><button className="folio-primary" type="submit" disabled={annotationBusy||(!annotationDraft.id&&!annotationDraft.note.trim())}>{annotationBusy?'Saving…':'Save annotation'}</button><button type="button" disabled={annotationBusy} onClick={()=>setAnnotationDraft(null)}>Cancel</button></div>
  </form>}
  <h3>Reading notes</h3>{notes}
  <p className="reading-annotation-status" role="status" aria-live="polite">{annotationStatus}</p>
  <details className="reading-highlights" open={highlightsOpen} onToggle={e=>setHighlightsOpen(e.currentTarget.open)}><summary>Saved highlights &amp; passage notes ({savedHighlights.length})</summary>{savedHighlights.length?<ul>{savedHighlights.map(h=><li key={h.id} id={`reading-annotation-${h.id}`}>
   <div className="reading-annotation-meta"><span className={`reading-color-label annotation-${h.color||'yellow'}`}>{colorName(h.color||'yellow')}</span>{h.note&&<span>Passage note</span>}</div>
   <blockquote className={`annotation-${h.color||'yellow'}`}>{h.quote}</blockquote>
   {h.note&&<p className="reading-saved-passage-note">{h.note}</p>}
   <div className="reading-annotation-actions"><button disabled={!h.anchor} onClick={()=>h.anchor&&jump(h.page,h.anchor.paragraph)}>Page {h.page} ↗</button><button disabled={annotationBusy||busy} onClick={()=>editAnnotation(h.id)}>{h.note?'Edit note / color':'Add note / edit color'}</button><button disabled={annotationBusy} onClick={()=>void removeHighlight(h.id)}>Remove</button></div>
   {!h.anchor&&<small>Quote and note kept; its exact location is unavailable in this extraction.</small>}
  </li>)}</ul>:<p>Select a passage, choose a color, then highlight it or add a note. Highlights and notes stay with the paper when you remove its cache.</p>}</details>
 </section>;
 return <section className="folio-reading-view" aria-label="Parsed reading view">
  {error&&<div className="reading-alert" role="alert">{error} <button onClick={()=>onOriginal()}>Open original PDF</button>{!cache&&<button disabled={busy} onClick={()=>void remove()}>Clear cache</button>}</div>}
  {busy&&<div className="reading-job" role="status">{progress||'Updating reading view…'}{progress&&<button onClick={()=>controller.current?.abort()}>Cancel</button>}</div>}
  {loading?<p className="reading-setup">Opening reading view…</p>:!cache?<div className="reading-columns"><div className="reading-setup"><span className="reading-kicker">OPTIONAL READING VIEW</span><h2>Text and figures, side by side</h2><p>Parse the saved PDF on your computer. Keep the original and create a removable cache for offline reading.</p><p>Works best with selectable text. Figure previews are cropped when their boundaries can be identified; text order and captions may need checking. Scanned PDFs need OCR, which is not included yet.</p><button className="folio-primary" disabled={busy} onClick={()=>void generate()}>{busy?'Preparing reading view…':'Generate reading view'}</button></div><aside className="reading-figures">{annotationPanel}</aside></div>:<>
   {(cache.layoutVersion||1)<15&&<div className="reading-update">Expanded journal layouts and improved reading order, headings, and page cleanup are available. Notes and highlights will be kept. <button className="folio-cite" disabled={busy} onClick={()=>void generate()}>Update reading view</button></div>}
   <div className="reading-controls">
    <label>Go to section <select aria-label="Go to section" value={section} disabled={!sections.length} onChange={e=>{setSection(e.target.value);const target=sections.find(s=>s.key===e.target.value);if(target)jump(target.page,target.paragraph);}}><option value="">{sections.length?'Choose section…':'No sections detected'}</option>{sections.map(s=><option key={s.key} value={s.key}>{s.level===2?'— ':''}{s.title} · p. {s.page}</option>)}</select></label>
    <label>Go to page <select aria-label="Reading page" value={page} onChange={e=>{setSection('');jump(Number(e.target.value));}}>{cache.pages.map(p=><option key={p.number} value={p.number}>{p.number}</option>)}</select></label>
    <label>Text size <select value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}>{[16,18,20,24].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
    <div className="reading-annotation-tools"><span className="reading-color-caption">{colorName(highlightColor)}</span>{colorChoices(highlightColor,setHighlightColor,'New highlight color')}<button className={`reading-highlight-button annotation-${highlightColor}`} disabled={!selection.length||annotationBusy||busy||Boolean(annotationDraft)} onMouseDown={e=>e.preventDefault()} onClick={()=>void addHighlight()}>{annotationBusy?'Saving…':'Highlight selection'}</button><button className="reading-add-note-button" disabled={!selection.length||annotationBusy||busy||Boolean(annotationDraft)} onMouseDown={e=>e.preventDefault()} onClick={startPassageNote}>Add note to selection</button></div>
    <span>{(bytes/1024/1024).toFixed(2)} MB cache</span><button disabled={busy} onClick={()=>void remove()}>Remove reading cache</button>
   </div>
   <details className="reading-caveats"><summary>About this extraction</summary>{cache.warnings.map((warning,i)=><p key={i}>{warning}</p>)}<p>Equations, tables, column order, and detected headings may be imperfect. Removing this cache also removes its figure previews; your notes, highlights, and original PDF remain.</p></details>
   <div className="reading-columns"><article ref={textPane} className="reading-text" style={{fontSize}}>{cache.pages.map(p=><section id={`reading-page-${p.number}`} key={p.number}><div className="reading-page-label">PAGE {p.number}<button onClick={()=>onOriginal(p.number)}>Check original ↗</button></div>{p.paragraphs.length?p.paragraphs.map((text,i)=>{
    const equation=p.equations?.find(e=>e.paragraph===i);
    if(equation)return <figure className="reading-equation" id={`reading-paragraph-${p.number}-${i}`} key={i}><img src={equation.image} alt="Equation preserved from the original PDF"/><figcaption><button onClick={()=>onOriginal(p.number)}>Equation {equationVisuals(cache.pages).find(v=>v.id===`equation:${p.number}:${p.equations!.indexOf(equation)}`)?.number} · original page {p.number} ↗</button></figcaption></figure>;
    const paragraphHeadings=p.headings?.filter(h=>h.paragraph===i)||[],heading=paragraphHeadings.find(h=>!h.synthetic),Tag=heading?(heading.level===1?'h3':'h4'):'p';
    const ranges=savedHighlights.filter(h=>h.page===p.number&&h.anchor?.paragraph===i).map(h=>({...h.anchor!,color:h.color||'yellow',id:h.id}));
    return <div key={i}>{paragraphHeadings.filter(h=>h.synthetic).map(h=><h3 key={h.title}>{h.title}</h3>)}<Tag id={`reading-paragraph-${p.number}-${i}`} data-page={p.number} data-reading-paragraph={i} key={i}>{highlightSegments(text,ranges).map((part,index)=>part.marked?<mark key={index} className={`annotation-${part.color||'yellow'}`} role="button" tabIndex={0} aria-label={`Edit ${part.color||'yellow'} highlight${(part.highlightIds||[]).some(id=>highlights.find(h=>h.id===id)?.note)?' and passage note':''}: ${part.text}`} title="Open highlight and passage note" onClick={()=>{if(!window.getSelection()?.toString())editAnnotation(part.highlightIds?.[part.highlightIds.length-1]||'');}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();editAnnotation(part.highlightIds?.[part.highlightIds.length-1]||'');}}}>{part.text}</mark>:part.text)}</Tag></div>;
   }):<p className="reading-no-text">No text was extracted from this page. Open the original to read it.</p>}</section>)}</article>
   <aside className="reading-figures"><div className="reading-side-tabs" role="group" aria-label="Reading companion"><button aria-pressed={sideTab==='figures'} onClick={()=>setSideTab('figures')}>Figures &amp; notes</button><button aria-pressed={sideTab==='chat'} onClick={()=>setSideTab('chat')}>Ask this paper</button></div><div hidden={sideTab!=='chat'}><PaperChat key={pdfId} pdfId={pdfId} visualOptions={[...cache.figures.map((f,i)=>({id:`figure:${i}`,label:f.label,page:f.page})),...equationVisuals(cache.pages)]} page={selection[0]?.page||page} selection={selection.length===1?selection[0].quote:''} onPage={n=>jump(n)}/></div><div hidden={sideTab!=='figures'}><div className="reading-figure-heading"><h3>Figures</h3><button className="reading-notes-jump" onClick={()=>document.getElementById('reading-notes')?.scrollIntoView({block:'start',behavior:'smooth'})}>Notes &amp; highlights ↓</button><span>{cache.figures.length} detected</span></div>{activeFigure?<>
    <div className="reading-figure-nav"><button aria-label="Previous figure" disabled={figure===0} onClick={()=>setFigure(figure-1)}>←</button><select aria-label="Choose figure" value={figure} onChange={e=>setFigure(Number(e.target.value))}>{cache.figures.map((f,i)=><option key={i} value={i}>{f.label} · page {f.page}</option>)}</select><button aria-label="Next figure" disabled={figure===cache.figures.length-1} onClick={()=>setFigure(figure+1)}>→</button></div>
    <div className="reading-figure-hint">{!activeFigure.crop&&<span>Full-page preview · figure boundaries uncertain. </span>}Drag to pan · Ctrl/Cmd-scroll to zoom <label>Zoom <input aria-label="Figure zoom" type="range" min="25" max="600" step="0.1" value={zoom} onChange={e=>changeZoom(Number(e.target.value))}/><output>{Math.round(zoom)}%</output></label><button onClick={()=>changeZoom(100)}>Fit width</button></div>
    <div ref={imagePane} tabIndex={0} role="region" aria-label="Figure preview. Drag to pan or use arrow keys." className={`reading-figure-image ${dragging?'is-dragging':''}`}
     onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}}
     onPointerMove={e=>{const start=pan.current;if(!start||start.id!==e.pointerId)return;e.currentTarget.scrollLeft=start.left+start.x-e.clientX;e.currentTarget.scrollTop=start.top+start.y-e.clientY;}}
     onPointerUp={e=>{if(pan.current?.id===e.pointerId){pan.current=null;setDragging(false);e.currentTarget.releasePointerCapture(e.pointerId);}}}
     onPointerCancel={()=>{pan.current=null;setDragging(false);}} onLostPointerCapture={()=>{pan.current=null;setDragging(false);}}>
     <SharpFigure key={`${pdfId}-${figure}`} pdfId={pdfId} page={activeFigure.page} crop={activeFigure.crop} preview={cache.pages[activeFigure.page-1].image!} zoom={zoom} alt={`PDF page ${activeFigure.page} containing ${activeFigure.label}`}/>
    </div>
    <div className="reading-legend"><h4>Figure legend</h4><p className="reading-caption">{activeFigure.caption||'The legend could not be extracted. Open the original PDF to read it.'}</p></div><div className="reading-figure-actions"><button onClick={()=>jump(activeFigure.page)}>Text on this page</button>{activeFigure.captionPage&&activeFigure.captionPage!==activeFigure.page&&<button onClick={()=>onOriginal(activeFigure.captionPage)}>Original legend · page {activeFigure.captionPage} ↗</button>}<button onClick={()=>onOriginal(activeFigure.page)}>Open original at page {activeFigure.page} ↗</button></div>
   </>:<div className="reading-no-figures"><p>No figure captions were detected. Figures may still be present in the original PDF.</p><button onClick={()=>onOriginal()}>Browse original PDF</button></div>}{annotationPanel}</div></aside></div>
  </>}
 </section>;
}
