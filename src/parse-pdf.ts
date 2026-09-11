import {rasterImageBoxes} from './pdf-graphics';
import {getDocument,GlobalWorkerOptions,OPS} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {readingColumnSplits,type ReadingCache,type ReadingPage} from './reading-layout';
import {analyzeJournalPage,organizeSections,filterReadingItems,readingProfile,repeatedMarginPatterns,removeRepeatedMargins,type ReadingContext} from './reading-sections';
import {omitBibliography} from './reading-bibliography';
import {extractEquations} from './reading-equations';
import {extractFigureContent,mergeExtractedFigures} from './figure-extraction';
GlobalWorkerOptions.workerSrc=workerUrl;
export async function parsePdf(pdfId:string,signal:AbortSignal,onProgress:(message:string)=>void,previous?:ReadingCache,context:ReadingContext={}):Promise<ReadingCache>{
 const task=getDocument({url:`/api/pdfs/${encodeURIComponent(pdfId)}`,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',iccUrl:'/pdfjs/iccs/',stopAtErrors:true});
 let destruction:Promise<void>|undefined;
 const destroy=()=>destruction??=task.destroy();
 const abort=()=>{void destroy().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 const check=()=>{if(signal.aborted)throw new DOMException('Reading view generation cancelled.','AbortError');};
 async function cancellable<T>(operation:Promise<T>):Promise<T>{
  check();let rejectAbort:()=>void=()=>{};
  const interrupted=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(new DOMException('Reading view generation cancelled.','AbortError'));signal.addEventListener('abort',rejectAbort,{once:true});});
  try{return await Promise.race([operation,interrupted]);}finally{signal.removeEventListener('abort',rejectAbort);}
 }
 try{
  check();const doc=await cancellable(task.promise);if(doc.numPages>500)throw Error('This PDF has more than 500 pages. Use the original PDF viewer for this document.');
  const result:ReadingCache={version:1,layoutVersion:15,pages:[],figures:[],warnings:['Text order and figure captions are estimated from the PDF. Figure boundaries are estimated; the original PDF remains available.']};
  // A sparse title/table page may not contain enough prose to expose all
  // gutters. Sample text layers only; two agreeing dense pages establish an
  // advisory three-column layout for other pages with narrow-column evidence.
  const layoutSamples:number[][]=[];
  const marginSamples:Parameters<typeof repeatedMarginPatterns>[0]=[];
  for(let n=1;n<=Math.min(doc.numPages,12);n++){
   check();onProgress(`Checking page layouts ${n} of ${Math.min(doc.numPages,12)}…`);
   const page=await cancellable(doc.getPage(n)),{width,height}=page.getViewport({scale:1});
   const text=await cancellable(page.getTextContent());
   const items=text.items.filter((item):item is Extract<typeof item,{str:string}>=>'str' in item);
   marginSamples.push({items:items.filter(i=>i.transform[5]>height*.85||i.transform[5]<height*.045),width,height});
   const splits=readingColumnSplits(items,width);
   if(splits.length===2)layoutSamples.push(splits.map(x=>x/width));
  }
  const documentColumns=layoutSamples.find(a=>layoutSamples.filter(b=>b.every((x,i)=>Math.abs(x-a[i])<.015)).length>=2);
  const repeatedMargins=repeatedMarginPatterns(marginSamples);
  const review=marginSamples.slice(0,2).some(p=>p.items.some(i=>i.transform[5]>p.height*.85&&/^(?:Review(?: Article)?|Perspective|Comment|Opinion)$/i.test(i.str.trim())));
  const equationImages=new Map<number,Map<string,string>>();
  let imageBytes=0,blank=0,omitted=0,characters=0;
  for(let n=1;n<=doc.numPages;n++){
   check();onProgress(`Reading page ${n} of ${doc.numPages}…`);
   check();const page=await cancellable(doc.getPage(n));const viewport=page.getViewport({scale:1});
   const content=await cancellable(page.getTextContent());
   // Load font descriptors: textContent styles alone often say only 'serif'.
   const operators=await cancellable(page.getOperatorList());
   const styles=Object.fromEntries(await cancellable(Promise.all(Object.entries(content.styles).map(async([key,value])=>{
    const font=page.commonObjs.has(key)?page.commonObjs.get(key):await new Promise<{name?:string}|undefined>(resolve=>{
     const timer=setTimeout(()=>resolve(undefined),2000);
     page.commonObjs.get(key,(loaded:{name?:string})=>{clearTimeout(timer);resolve(loaded);});
    });
    return [key,{...value,fontName:font?.name||''}];
   }))));
   const rawItems=removeRepeatedMargins(content.items.filter((item):item is Extract<typeof item,{str:string}>=>'str' in item),viewport.width,viewport.height,repeatedMargins);
   const filtered=filterReadingItems(rawItems,viewport.width,styles,context,viewport.height,n);
   const localSplits=readingColumnSplits(filtered,viewport.width,readingProfile(context)==='nature'?{minColumnLines:2}:{});
   const narrow=filtered.filter(i=>i.str.length>30&&i.width>viewport.width*.15&&i.width<viewport.width*.32);
   const columnSplits=localSplits.length!==2&&documentColumns&&narrow.length>=6?documentColumns.map(x=>x*viewport.width):localSplits;
   const graphics=page.rotate%360?[]:rasterImageBoxes(operators,OPS,viewport.width,viewport.height);
   // Nature's verified crop rule needs the original figure-label typography.
   const extraction=extractFigureContent(readingProfile(context)==='nature'?rawItems:filtered,viewport.width,viewport.height,styles,n,graphics,result.figures);
   if(page.rotate%360)extraction.figures.forEach(f=>{delete f.crop;});
   const proseItems=new Set(filtered);
   let readingItems=extraction.items.filter(item=>proseItems.has(item as typeof rawItems[number]));
   if(!page.rotate&&imageBytes<15*1024*1024){
    const math=extractEquations(readingItems,viewport.width,viewport.height,{columnSplits}),images=new Map<string,string>();
    for(const equation of math.equations.slice(0,50)){
     const c=equation.crop,scale=Math.min(3,1200/(c.width*viewport.width));
     const canvas=document.createElement('canvas');canvas.width=Math.ceil(c.width*viewport.width*scale);canvas.height=Math.ceil(c.height*viewport.height*scale);
     try{check();await cancellable(page.render({canvas,viewport:page.getViewport({scale}),transform:[1,0,0,1,-c.x*viewport.width*scale,-c.y*viewport.height*scale],background:'rgb(255,255,255)'}).promise);const image=canvas.toDataURL('image/jpeg',.94);if(imageBytes+image.length<16*1024*1024){images.set(equation.marker,image);imageBytes+=image.length;}}finally{canvas.width=0;canvas.height=0;}
    }
    if(images.size===math.equations.length){readingItems=math.items;if(images.size)equationImages.set(n,images);}
   }
   const {paragraphs,headings}=analyzeJournalPage(readingItems,page.view[2]-page.view[0],styles,n,context,page.view[3]-page.view[1],columnSplits);
   const output:ReadingPage={number:n,paragraphs,headings};const textLength=paragraphs.join('').length;characters+=textLength;if(textLength<30)blank++;
   const figures=extraction.figures;
   const knownFigures=new Set(result.figures);
   mergeExtractedFigures(result.figures,figures);
   const previews=result.figures.filter(f=>!knownFigures.has(f)).slice(0,Math.max(0,200-knownFigures.size));
   result.figures=result.figures.filter(f=>knownFigures.has(f)||previews.includes(f));
   if(previews.length&&imageBytes<16*1024*1024){
    const cached=previous?.pages.find(p=>p.number===n)?.image;
    if(cached&&cached.length<=4000000&&imageBytes+cached.length<=16*1024*1024){output.image=cached;imageBytes+=cached.length;}
    else {
    onProgress(`Preparing figures on page ${n} of ${doc.numPages}…`);
    const scale=Math.min(2,1800/Math.max(viewport.width,viewport.height));const renderViewport=page.getViewport({scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(renderViewport.width);canvas.height=Math.ceil(renderViewport.height);
    try{check();await cancellable(page.render({canvas,viewport:renderViewport,background:'rgb(255,255,255)'}).promise);check();const image=canvas.toDataURL('image/jpeg',.88);if(image.length<=4000000&&imageBytes+image.length<=16*1024*1024){output.image=image;imageBytes+=image.length;}else omitted++;}finally{canvas.width=0;canvas.height=0;}
    }
   }else if(previews.length)omitted++;
   if(!output.image&&previews.length)result.figures=result.figures.filter(f=>knownFigures.has(f));
   result.pages.push(output);page.cleanup();
   // Yield between pages so cancel and navigation remain responsive.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();if(characters<50)throw Error('No usable text layer was found. This may be a scanned PDF; OCR is not available yet. Your original PDF is unchanged.');
  if(blank)result.warnings.push(`${blank} page(s) contain little or no extractable text. Check those pages in the original PDF.`);
  if(omitted)result.warnings.push(`Figure previews on ${omitted} page(s) were omitted to keep the cache small. All figures and legends remain in the original PDF.`);
  result.pages=organizeSections(result.pages,review?{...context,articleType:'review'}:context);
  for(const page of result.pages){const images=equationImages.get(page.number);if(!images?.size)continue;page.equations=[];page.paragraphs.forEach((text,paragraph)=>{const image=images.get(text);if(image){page.equations!.push({paragraph,image});page.paragraphs[paragraph]='Equation from original PDF';}});}
  const bibliography=omitBibliography(result.pages);result.pages=bibliography.pages;
  if(bibliography.removedParagraphs)result.warnings.push('Bibliography text is omitted from this reading cache, including references after Methods. It remains in the original PDF.');
  if(equationImages.size)result.warnings.push('Detected display equations are preserved as small original-PDF images, not editable LaTeX. Inline mathematics and undetected equations may need checking.');
  if(JSON.stringify(result).length>23*1024*1024)throw Error('The extracted text and figures are too large for the reading cache. Use the original PDF viewer.');
  return result;
 }catch(error){check();if(error instanceof Error&&error.name==='PasswordException')throw Error('This PDF is password protected. Use the original PDF viewer.');throw error;}
 finally{signal.removeEventListener('abort',abort);await destroy();}
}
