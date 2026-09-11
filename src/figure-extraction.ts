import {analyzePage,type ReadingFigure} from './reading-layout';
type Item={str:string;transform:number[];width:number;height:number;fontName?:string};
type GraphicBox={x:number;y:number;width:number;height:number};
type Style={fontFamily?:string;fontName?:string;bold?:boolean};
const start=/^((?:(?:Extended Data|Supplementary)\s+)?Fig(?:ure)?\.?\s*S?\d+)\s*[|.:]/i;
const continued=/^\(?legend continued on next page\)?[.]?$/i;
const nextPageLegend=/^\(?legend on next page\)?[.]?$/i;
const panelStart=/^\([A-Z](?:[–−-][A-Z]| and [A-Z])?\)\s/;
const awaitingContinuation=new WeakSet<ReadingFigure>();
const unnamedFigures=new WeakSet<ReadingFigure>();
const placeholder=/see\s+(?:the\s+)?next\s+page\s+for\s+(?:the\s+)?caption[.]?/i;
export function extractFigureContent(items:Item[],width:number,height:number,styles:Record<string,Style>,page:number,graphics:GraphicBox[]=[],previousFigures:ReadingFigure[]=[]){
 // PDF text runs can split a bold label into “Fig.” and “1.”.
 for(const token of items.filter(i=>/^Fig(?:ure)?\.$/i.test(i.str.trim()))){
  const number=items.find(i=>/^S?\d+[.:]?$/.test(i.str.trim())&&Math.abs(i.transform[5]-token.transform[5])<1&&i.transform[4]>=token.transform[4]+token.width-1&&i.transform[4]-token.transform[4]-token.width<15);
  if(number&&(/[.:]$/.test(number.str)||styles[token.fontName||'']?.bold||/(?:bold|\.B$)/i.test(styles[token.fontName||'']?.fontName||''))){const joined={...token,str:token.str+' '+number.str+(/[.:]$/.test(number.str)?'':'.'),width:number.transform[4]+number.width-token.transform[4]};items=items.filter(i=>i!==number).map(i=>i===token?joined:i);}
 }
 items=items.map(i=>{
  if(!/^(?:Fig(?:ure)?\.?)\s*S?\d+$/i.test(i.str.trim()))return i;
  const bold=styles[i.fontName||'']?.bold||/(?:bold|\.B$)/i.test(styles[i.fontName||'']?.fontName||'');
  const title=items.some(t=>t!==i&&t.str.trim().length>12&&Math.abs(t.transform[5]-i.transform[5])<1&&t.transform[4]>=i.transform[4]+i.width-2);
  return bold&&title?{...i,str:i.str+'.'}:i;
 });
 const removed=new Set<Item>();const figures:ReadingFigure[]=[];
 // Some publishers place a complete legend on the following prose page, or
 // continue its panel descriptions beneath that page's article columns.
 const previous=[...previousFigures].reverse().find(f=>f.page===page-1&&awaitingContinuation.has(f));
 if(previous){
  const panel=items.filter(i=>panelStart.test(i.str.trim())&&i.transform[5]<height*.35).sort((a,b)=>b.transform[5]-a.transform[5])[0];
  if(panel){
   const size=Math.abs(panel.height),top=panel.transform[5];
   const body=items.filter(i=>i.str.trim().length>45&&i.transform[5]>top+size*2&&Math.abs(i.height)>size*1.1);
   if(body.length>=3){
    const candidates=items.filter(i=>i.str.trim()&&i.transform[5]<=top+size*.3&&i.transform[5]>25&&Math.abs(Math.abs(i.height)-size)<.3);
    const baselines=[...new Set(candidates.map(i=>Math.round(i.transform[5]*2)/2))].sort((a,b)=>b-a);
    let bottom=top;for(const y of baselines){if(bottom-y>size*1.65)break;bottom=y;}
    const selected=items.filter(i=>i.transform[5]>=bottom-size*.25&&i.transform[5]<=top+size*.7&&(candidates.includes(i)||Math.abs(i.height)>size*.45&&Math.abs(i.height)<size*.85));
    selected.forEach(i=>removed.add(i));
    previous.caption+=' '+analyzePage(selected,width,styles,{minColumnLines:2}).paragraphs.join(' ').replace(/\s+/g,' ').trim();
    awaitingContinuation.delete(previous);
   }
  }
 }
 const barePlaceholder=items.find(i=>nextPageLegend.test(i.str.trim()));
 if(barePlaceholder){
  const bottom=(height-barePlaceholder.transform[5]-Math.abs(barePlaceholder.height)-5)/height;
  const panels=graphics.filter(b=>b.width>.015&&b.height>.015&&b.y>.12&&b.y+b.height<=bottom+.01);
  if(panels.length){
   const labels=items.filter(i=>/^[A-Z]$/.test(i.str.trim())&&i.transform[5]>barePlaceholder.transform[5]+20&&i.transform[5]<height*.88);
   const x=Math.max(0,Math.min(...panels.map(b=>b.x),...labels.map(i=>i.transform[4]/width))-4/width),y=Math.max(0,Math.min(...panels.map(b=>b.y),...labels.map(i=>(height-i.transform[5]-i.height)/height))-4/height);
   const right=Math.min(1,Math.max(...panels.map(b=>b.x+b.width))+4/width);
   const figure:ReadingFigure={page,label:'Figure',caption:'',crop:{x:Math.min(x,.075),y,width:Math.max(right,.925)-Math.min(x,.075),height:bottom-y}};
   unnamedFigures.add(figure);figures.push(figure);removed.add(barePlaceholder);
   for(const i of items)if(i.transform[4]>=Math.min(x,.075)*width&&i.transform[4]+i.width<=Math.max(right,.925)*width&&height-i.transform[5]>=y*height&&height-i.transform[5]<=bottom*height)removed.add(i);
  }
 }
 const seeds=items.filter(i=>{
  if(!start.test(i.str.trim()))return false;
  // A short figure reference may start a wrapped body line. A preceding
  // same-size prose line is evidence that it is not a standalone legend.
  const bold=styles[i.fontName||'']?.bold||/(?:bold|\.B$)/i.test(styles[i.fontName||'']?.fontName||'');
  if(/^Fig(?:ure)?\.?\s/i.test(i.str.trim())&&!bold&&!/HardingText/i.test(styles[i.fontName||'']?.fontName||'')){
   const size=Math.abs(i.height);
   if(items.some(p=>p!==i&&p.str.trim().length>35&&Math.abs(p.height-size)<.25&&p.fontName===i.fontName&&Math.abs(p.transform[4]-i.transform[4])<size*2&&p.transform[5]-i.transform[5]>size*.7&&p.transform[5]-i.transform[5]<size*1.6))return false;
  }
  return true;
 });
 for(const seed of seeds){
  if(removed.has(seed))continue;
  const label=seed.str.trim().match(start)![1];const size=Math.abs(seed.height);const y=seed.transform[5];
  // Match the publisher's caption typography. Connected baselines include the
  // second column, while a different-sized article body stops the caption.
  const family=(i:Item)=>(styles[i.fontName||'']?.fontName||'').replace(/[-,](?:Regular|Bold|Italic|Roman).*$/i,'');
  const verified=/HardingText/i.test(styles[seed.fontName||'']?.fontName||'');
  if(!verified){
   const generic=extractGenericCaption(items,seed,seeds,width,height,styles,page,graphics);
   if(generic){
    const continuation=items.find(i=>continued.test(i.str.trim())&&i.transform[5]<y);
    if(continuation){removed.add(continuation);awaitingContinuation.add(generic.figure);}
    generic.selected.forEach(i=>removed.add(i));figures.push(generic.figure);continue;}
  }
  const nextSeed=Math.max(25,...seeds.filter(i=>i!==seed&&i.transform[5]<y-size).map(i=>i.transform[5]+size));
  const candidates=items.filter(i=>i.str.trim()&&Math.abs(Math.abs(i.height)-size)<.35&&i.transform[5]<=y+size*.3&&i.transform[5]>nextSeed&&(verified||Math.abs(i.transform[5]-y)<size*.3)&&(!family(seed)||family(i)===family(seed)));
  const baselines=[...new Set(candidates.map(i=>Math.round(i.transform[5]*2)/2))].sort((a,b)=>b-a);
  let bottom=y;
  for(const baseline of baselines){if(baseline>y+size*.3)continue;if(bottom-baseline>size*2.1)break;bottom=baseline;}
  const selected=items.filter(i=>i.transform[5]>=bottom-size*.3&&i.transform[5]<=y+size*.7&&(
   candidates.includes(i)||Math.abs(i.height)<size*.85&&Math.abs(i.height)>0&&(!family(seed)||family(i)===family(seed))));
  if(!selected.includes(seed))selected.push(seed);
  selected.forEach(i=>removed.add(i));
  const caption=analyzePage(selected,width,styles,{minColumnLines:2}).paragraphs.join(' ').replace(/\s+/g,' ').trim();
  const isPlaceholder=placeholder.test(caption);
  // Figures precede their caption in these layouts. Use the full printable
  // width to retain panel edges and graphical objects without text labels.
  const labels=items.filter(i=>i.str.trim()&&i.transform[5]>y+size*2&&i.transform[5]<height-35&&/^[A-Z]{6}\+/.test(styles[i.fontName||'']?.fontName||'')&&!/HardingText/.test(styles[i.fontName||'']?.fontName||''));
  const narrow=labels.length>2&&Math.max(...labels.map(i=>i.transform[4]+i.width))<width/2+5;
  const left=30,right=narrow?width/2:width-30;
  const bodyAbove=items.filter(i=>i.transform[4]<right-10&&i.transform[4]+i.width>left&&i.str.trim().length>45&&i.height>size*1.1&&i.transform[5]>y+size*3&&/HardingText/i.test(styles[i.fontName||'']?.fontName||''));
  const top=bodyAbove.length?height-Math.min(...bodyAbove.map(i=>i.transform[5]))+8:45;
  const bottomTop=height-y-size-5;
  const crop=verified&&bottomTop-top>45?{x:Math.max(0,left/width),y:Math.max(0,top/height),width:Math.min(1,(right-left)/width),height:Math.min(1,(bottomTop-top)/height)}:undefined;
  if(crop&&labels.length>2)for(const item of labels){
   const x=item.transform[4]/width,top=(height-item.transform[5])/height;
   if(x>=crop.x&&x<=crop.x+crop.width&&top>=crop.y&&top<=crop.y+crop.height)removed.add(item);
  }
  figures.push({page,label,caption:isPlaceholder?'':caption,captionPage:isPlaceholder?undefined:page,...(crop?{crop}: {})});
 }
 return {items:items.filter(i=>!removed.has(i)),figures};
}
// Layout evidence, rather than a publisher name, permits full caption extraction.
// A separately typeset label or smaller caption type distinguishes it from prose.
function extractGenericCaption(items:Item[],seed:Item,seeds:Item[],width:number,height:number,styles:Record<string,Style>,page:number,graphics:GraphicBox[]){
 const size=Math.abs(seed.height),y=seed.transform[5],x=seed.transform[4];
 const panelBelow=items.find(i=>panelStart.test(i.str.trim())&&y-i.transform[5]>size*.8&&y-i.transform[5]<size*1.7&&Math.abs(i.height)>=size*.85&&Math.abs(i.height)<=size);
 const captionSize=panelBelow?Math.abs(panelBelow.height):size;
 const sameLine=items.filter(i=>i.str.trim()&&Math.abs(i.transform[5]-y)<size*.3&&i.transform[4]>=x-2);
 const separateLabel=/^(?:(?:Extended Data|Supplementary)\s+)?Fig(?:ure)?\.?\s*S?\d+\s*[|.:]$/i.test(seed.str.trim())&&sameLine.some(i=>i!==seed&&i.fontName!==seed.fontName&&i.str.trim().length>12);
 const colonCaption=/^Figure\s+S?\d+\s*:/i.test(seed.str.trim());
 const largerBody=items.filter(i=>i.str.trim().length>45&&Math.abs(i.height)>size*1.07&&Math.abs(i.height)<size*1.4).length>=3;

 const typeface=(i:Item)=>(styles[i.fontName||'']?.fontName||'').replace(/^[A-Z]{6}\+/,'').split(/[-,]/)[0];
 const captionFamily=typeface(seed);
 const boldLabel=styles[seed.fontName||'']?.bold||/(?:bold|\.B$)/i.test(styles[seed.fontName||'']?.fontName||'');
 const adjacentText=items.filter(i=>i.str.trim().length>25&&Math.abs(i.transform[4]-x)<3&&y-i.transform[5]>size*.7&&y-i.transform[5]<size*2.8&&Math.abs(Math.abs(i.height)-size)<.3);
 const captionFaces=new Set([captionFamily,...(boldLabel?adjacentText.map(typeface):[])]);
 const variedCaption=boldLabel&&adjacentText.some(i=>typeface(i)!==captionFamily);
 const titleAndCaption=boldLabel&&adjacentText.some(i=>i.fontName!==seed.fontName);
 const distinctFamily=captionFamily&&items.filter(i=>i.str.trim().length>45&&typeface(i)!==captionFamily&&Math.abs(i.height)>=size).length>=3;
 if(!separateLabel&&!largerBody&&!panelBelow&&!distinctFamily&&!variedCaption&&!titleAndCaption&&!colonCaption)return;
 if((distinctFamily||variedCaption)&&!panelBelow){
  const next=Math.max(25,...seeds.filter(i=>i!==seed&&i.transform[5]<y-size).map(i=>i.transform[5]+size));
  const candidates=items.filter(i=>i.str.trim()&&i.transform[4]>=x-3&&i.transform[5]<=y+size*.3&&i.transform[5]>next&&captionFaces.has(typeface(i))&&Math.abs(Math.abs(i.height)-size)<.35);
  const baselines=[...new Set(candidates.map(i=>Math.round(i.transform[5]*2)/2))].sort((a,b)=>b-a);
  let bottom=y;for(const line of baselines){if(bottom-line>size*1.75)break;bottom=line;}
  const selected=candidates.filter(i=>i.transform[5]>=bottom-size*.25);
  if(selected.length>1){
   // Preserve symbol-font runs and superscripts inside the caption's lines.
   for(const i of items){
    const line=selected.filter(s=>Math.abs(s.transform[5]-i.transform[5])<size*.5);
    if(line.length&&Math.abs(i.height)<=size*1.05&&i.transform[4]>=Math.min(...line.map(s=>s.transform[4]))&&i.transform[4]+i.width<=Math.max(...line.map(s=>s.transform[4]+s.width))+1&&!selected.includes(i))selected.push(i);
   }
   const caption=analyzePage(selected,width,styles,{minColumnLines:2}).paragraphs.join(' ').replace(/\s+/g,' ').trim();
   return {selected,figure:{page,label:seed.str.trim().match(start)![1],caption,captionPage:page} as ReadingFigure};
  }
 }
 const half=width/2;
 const crossesMiddle=[...sameLine,...adjacentText].some(i=>i.transform[4]<half-10&&i.transform[4]+i.width>half+10);
 const rightColumn=x>half-20;
 const left=rightColumn?half:Math.max(0,Math.min(x-8,width*.075)),right=rightColumn||crossesMiddle?width-25:half;
 const inColumn=(i:Item)=>i.transform[4]>=left-2&&i.transform[4]<right-2;
 const nextSeed=Math.max(25,...seeds.filter(i=>i!==seed&&inColumn(i)&&i.transform[5]<y-size).map(i=>i.transform[5]+size));
 const candidates=items.filter(i=>inColumn(i)&&i.str.trim()&&(i===seed||Math.abs(Math.abs(i.height)-captionSize)<.35)&&i.transform[5]<=y+size*.3&&i.transform[5]>nextSeed&&!continued.test(i.str.trim()));
 const baselines=[...new Set(candidates.map(i=>Math.round(i.transform[5]*2)/2))].sort((a,b)=>b-a);
 let bottom=y;
 for(const baseline of baselines){if(bottom-baseline>size*1.65)break;bottom=baseline;}
 const selected=items.filter(i=>inColumn(i)&&i.transform[5]>=bottom-size*.25&&i.transform[5]<=y+size*.7&&(candidates.includes(i)||Math.abs(i.height)>size*.45&&Math.abs(i.height)<size*.85));
 if(!selected.includes(seed))selected.push(seed);
 // A spanning caption is one text flow even when italic variables split its
 // PDF runs on either side of the page center. Do not infer a gutter from them.
 const caption=analyzePage(selected,width,styles,{minColumnLines:2,singleColumn:crossesMiddle}).paragraphs.join(' ').replace(/\s+/g,' ').trim();
 // A generous region above the caption keeps raster/vector panels intact. Long
 // prose or a running header bounds its top; uncertain short gaps get no crop.
 const proseAbove=items.filter(i=>i.transform[4]<right&&i.transform[4]+i.width>left&&i.str.trim().length>45&&i.height>=size*.95&&i.transform[5]>y+size*2);
 const top=proseAbove.length?height-Math.min(...proseAbove.map(i=>i.transform[5]))+size:45;
 const bottomTop=height-y-size-5;
 let crop=bottomTop-top>50?{x:left/width,y:Math.max(0,top/height),width:(right-left)/width,height:(bottomTop-top)/height}:undefined;
 // Raster placements are stronger evidence than whitespace, especially for
 // centered captions or figures underneath tables. Join adjacent panel images.
 const eligible=graphics.filter(b=>b.width*width>25&&b.height*height>20&&((height-y-size)/height-b.y-b.height)*height<60&&b.y+b.height<=(height-y-size)/height+.01&&(b.x+b.width/2)*width>=left&&(b.x+b.width/2)*width<=right).sort((a,b)=>(b.y+b.height)-(a.y+a.height));
 if(eligible.length){
  const group=[eligible[0]];
  for(const b of eligible.slice(1))if(group.some(g=>b.y+b.height>=g.y-.04&&b.y<=g.y+g.height+.04))group.push(b);
  const gx=Math.max(0,Math.min(...group.map(b=>b.x))-4/width),gy=Math.max(0,Math.min(...group.map(b=>b.y))-4/height);
  const gr=Math.min(1,Math.max(...group.map(b=>b.x+b.width))+4/width),gb=Math.min((height-y-size-2)/height,Math.max(...group.map(b=>b.y+b.height))+4/height);
  crop={x:gx,y:gy,width:gr-gx,height:gb-gy};
  for(const i of items){const ix=i.transform[4]/width,iy=(height-i.transform[5])/height;if(ix>=gx&&ix+i.width/width<=gr&&iy>=gy&&iy<=gb&&!selected.includes(i))selected.push(i);}
 }
 // A dedicated multi-panel page must retain all panels, not just the raster
 // nearest the caption. Small raster tiles often make up a much larger figure.
 const panelLabels=items.filter(i=>/^[A-Z]$/.test(i.str.trim())&&Math.abs(i.height)>=size&&i.transform[5]>y+size*2&&i.transform[5]<height*.88);
 const articleAbove=items.some(i=>i.str.trim().length>45&&i.transform[5]>y+size*2&&i.transform[5]<height*.87&&Math.abs(i.height)>size*1.05);
 if(['A','B','C'].every(label=>panelLabels.some(i=>i.str.trim()===label))&&!articleAbove){
  const panels=graphics.filter(b=>b.width>.015&&b.height>.015&&b.y>.12&&b.y+b.height<=(height-y-size)/height+.01);
  if(panels.length){
   const gx=Math.max(0,Math.min(...panels.map(b=>b.x),...panelLabels.map(i=>i.transform[4]/width))-4/width);
   const gy=Math.max(.1,Math.min(...panels.map(b=>b.y),...panelLabels.map(i=>(height-i.transform[5]-i.height)/height))-4/height);
   const gr=Math.min(1,Math.max(...panels.map(b=>b.x+b.width),...panelLabels.map(i=>(i.transform[4]+i.width)/width))+4/width);
   const left=Math.min(gx,.075),right=Math.max(gr,.925),bottom=(height-y-size-2)/height;
   crop={x:left,y:gy,width:right-left,height:bottom-gy};
   for(const i of items){const ix=i.transform[4]/width,iy=(height-i.transform[5])/height;if(ix>=left&&ix+i.width/width<=right&&iy>=gy&&iy<=bottom&&!selected.includes(i))selected.push(i);}
  }
 }
 // Axis text can extend a few points below the nearest raster or the
 // whitespace estimate. Include its descenders while stopping above the title.
 if(crop){
  const bottom=(crop.y+crop.height)*height,captionTop=height-y-size;
  const axes=items.filter(i=>i.str.trim()&&i.str.trim().length<=25&&Math.abs(i.height)>0&&Math.abs(i.height)<=size*.9&&i.transform[4]>=crop!.x*width&&i.transform[4]+i.width<=(crop!.x+crop!.width)*width&&height-i.transform[5]>bottom-1&&height-i.transform[5]<bottom+size*1.5&&height-i.transform[5]+Math.abs(i.height)*.2<captionTop-.5);
  if(axes.length){const end=Math.min(captionTop-.5,Math.max(...axes.map(i=>height-i.transform[5]+Math.abs(i.height)*.2+1)));crop.height=Math.max(crop.height,end/height-crop.y);}
 }
 if(crop)for(const i of items){
  const ix=i.transform[4]/width,iy=(height-i.transform[5])/height;
  if(i.str.trim().length<=45&&ix>=crop.x&&ix+i.width/width<=crop.x+crop.width&&iy>=crop.y&&iy<=crop.y+crop.height&&!selected.includes(i))selected.push(i);
 }
 const isPlaceholder=placeholder.test(caption);
 return {selected,figure:{page,label:seed.str.trim().match(start)![1],caption:isPlaceholder?'':caption,captionPage:isPlaceholder?undefined:page,...(crop?{crop}:{})} as ReadingFigure};
}
export function mergeExtractedFigures(figures:ReadingFigure[],incoming:ReadingFigure[]){
 for(const figure of incoming){
  const previous=figures.find(f=>(f.label.toLowerCase()===figure.label.toLowerCase()||unnamedFigures.has(f))&&f.page===figure.page-1&&!f.caption);
  if(previous&&figure.caption){previous.label=figure.label;previous.caption=figure.caption;previous.captionPage=figure.page;}
  else figures.push(figure);
 }
}
