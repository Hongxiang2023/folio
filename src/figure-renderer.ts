import {getDocument,GlobalWorkerOptions,type RenderTask} from 'pdfjs-dist';
import type {ReadingFigure} from './reading-layout';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
export function figureDimensions(width:number,height:number,targetWidth:number){
 const scale=Math.min(Math.max(.25,targetWidth/width),Math.sqrt(12_000_000/(width*height)));
 return {scale,width:Math.ceil(width*scale),height:Math.ceil(height*scale)};
}
export function createFigureRenderer(pdfId:string){
 const loading=getDocument({url:`/api/pdfs/${encodeURIComponent(pdfId)}`,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',iccUrl:'/pdfjs/iccs/',stopAtErrors:true});
 // Handle an early loading failure even before the first zoom request.
 void loading.promise.catch(()=>{});
 let closed=false;
 return {
  async render(pageNumber:number,targetWidth:number,signal:AbortSignal,crop?:ReadingFigure['crop']){
   let task:RenderTask|undefined;let canvas:HTMLCanvasElement|undefined;
   const check=()=>{if(closed||signal.aborted)throw new DOMException('Figure rendering cancelled.','AbortError');};
   const cancel=()=>task?.cancel();signal.addEventListener('abort',cancel,{once:true});
   try{
    check();const doc=await loading.promise;check();const page=await doc.getPage(pageNumber);check();
    const base=page.getViewport({scale:1});const size=figureDimensions(base.width*(crop?.width??1),base.height*(crop?.height??1),targetWidth);
    const viewport=page.getViewport({scale:size.scale});canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
    task=page.render({canvas,viewport,...(crop?{transform:[1,0,0,1,-crop.x*base.width*size.scale,-crop.y*base.height*size.scale]}:{}),background:'rgb(255,255,255)'});await task.promise;check();page.cleanup();return canvas;
   }catch(error){if(canvas){canvas.width=0;canvas.height=0;}throw error;}
   finally{signal.removeEventListener('abort',cancel);}
  },
  async destroy(){closed=true;await loading.destroy();}
 };
}
