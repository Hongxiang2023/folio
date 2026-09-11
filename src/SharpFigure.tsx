import {useEffect,useRef,useState} from 'react';
import type {ReadingFigure} from './reading-layout';
import type {createFigureRenderer} from './figure-renderer';
type Renderer=ReturnType<typeof createFigureRenderer>;
export default function SharpFigure({pdfId,page,preview,zoom,alt,crop}:{pdfId:string;page:number;preview:string;zoom:number;alt:string;crop?:ReadingFigure['crop']}){
 const wrapper=useRef<HTMLDivElement>(null),layer=useRef<HTMLDivElement>(null),renderer=useRef<Promise<Renderer>|null>(null);
 const [aspect,setAspect]=useState(1);
 const [width,setWidth]=useState(0),[previewWidth,setPreviewWidth]=useState(0),[status,setStatus]=useState('');
 const currentPage=useRef(page);
 useEffect(()=>{const element=wrapper.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  return()=>{const pending=renderer.current;renderer.current=null;if(pending)void pending.then(r=>r.destroy()).catch(()=>{});};
 },[pdfId]);
 useEffect(()=>{
  const holder=layer.current;if(!holder)return;
  const release=()=>{for(const canvas of Array.from(holder.querySelectorAll('canvas'))){canvas.width=0;canvas.height=0;}holder.replaceChildren();};
  if(currentPage.current!==page){release();currentPage.current=page;}
  const target=Math.ceil(width*Math.min(window.devicePixelRatio||1,3));
  if(!width||!previewWidth||target<=previewWidth*(crop?.width??1)*1.05){release();setStatus('');return;}
  const abort=new AbortController();setStatus('Sharpening from original PDF…');
  // Debounce wheel/slider motion; retain the compact preview during rendering.
  const timer=setTimeout(()=>{
   renderer.current??=import('./figure-renderer').then(module=>module.createFigureRenderer(pdfId));
   void renderer.current.then(r=>r.render(page,target,abort.signal,crop)).then(canvas=>{
    if(abort.signal.aborted){canvas.width=0;canvas.height=0;return;}
    release();canvas.setAttribute('aria-hidden','true');holder.append(canvas);setStatus('Rendered from original PDF · no extra disk cache');
   }).catch(()=>{if(!abort.signal.aborted)setStatus('Using saved preview. Open the original PDF for more detail.');});
  },300);
  return()=>{clearTimeout(timer);abort.abort();if(holder!==layer.current)release();};
 },[pdfId,page,width,previewWidth,crop]);
 return <><div ref={wrapper} className="reading-sharp-figure" style={{width:`${zoom}%`,...(crop?{aspectRatio:aspect*crop.width/crop.height,overflow:'hidden'}:{})}}><img draggable={false} src={preview} alt={alt} style={crop?{position:'absolute',width:`${100/crop.width}%`,maxWidth:'none',left:`${-crop.x/crop.width*100}%`,top:`${-crop.y/crop.height*100}%`}:undefined} onLoad={e=>{setPreviewWidth(e.currentTarget.naturalWidth);setAspect(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight);}}/><div key={page} ref={layer} className="reading-sharp-layer"/></div>{status&&<span className="reading-sharp-status" role="status">{status}</span>}</>;
}
