type Item={str:string;transform:number[];width:number;height:number;fontName?:string};
export function extractEquations(items:Item[],width:number,height:number,options:{columnSplits?:number[]}={}){
 const removed=new Set<Item>(),equations:{marker:string;crop:{x:number;y:number;width:number;height:number}}[]=[],markers:Item[]=[];
 const content=items.filter(i=>i.str.trim()&&i.height>0);
 // Classify complete baselines, not individual PDF text runs: even a short
 // sentence ending can be split into variables, subscripts and tiny prose runs.
 const splits=options.columnSplits??[width/2],edges=[0,...splits,width];
 for(let col=0;col<edges.length-1;col++){
  const column=content.filter(i=>i.transform[4]>=edges[col]&&i.transform[4]<edges[col+1]);
  const rows:Item[][]=[];
  for(const item of [...column].sort((a,b)=>b.transform[5]-a.transform[5])){
   const row=rows.find(r=>Math.abs(r[0].transform[5]-item.transform[5])<3);
   if(row)row.push(item);else rows.push([item]);
  }
  // Some older math fonts expose an equals sign as ¼ and parentheses as
  // ð/Þ. Use an isolated right-hand equation number as evidence, never replace
  // these glyphs globally in scientific prose.
  const taggedRows=new Set(rows.filter(row=>{
   const sorted=[...row].sort((a,b)=>a.transform[4]-b.transform[4]);
   const text=sorted.map(i=>i.str).join(' '),last=sorted.at(-1)!;
   const ordinary=(text.match(/[A-Za-z]{4,}/g)||[]).filter(w=>!/^(?:loss|score|log|exp|rank)$/i.test(w));
   return /(?:\(|ð)\s*\d+\s*(?:\)|Þ)\s*$/.test(text)&&/[=¼∑∫≤≥]/.test(text)&&!ordinary.length&&last.transform[4]>edges[col]+(edges[col+1]-edges[col])*.75;
  }));
  // A label followed only by a parenthesized parameter (for example an
  // assay name with k=21 or a group with n=10) is an annotation, not a display
  // equation. Font sizes and proximity to prose alone cannot distinguish it
  // from math inside a figure. Keep these items in the source reading stream.
  const distributionRows=new Set(rows.filter(row=>{
   const text=[...row].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').trim();
   return /^(?:log\s+)?(?:[A-Za-z]{1,3}|[α-ωΑ-Ω])(?:\s+[A-Za-z0-9]{1,2})?\s*[∼~]\s*(?:NB|N|Normal|Poisson|Binomial)\s*\(/.test(text);
  }));
  const distributionItems=new Set([...distributionRows].flat());
  const annotationItems=new Set(rows.filter(row=>{
   if(distributionRows.has(row))return false;
   const text=[...row].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').trim();
   const match=text.match(/^([^()=∑∫≤≥≠≈]+)\(([^()]*)\)\s*$/);
   return Boolean(match&&/[A-Za-z]{3}/.test(match[1])&&/[=≤≥≠≈]/.test(match[2]));
  }).flat());
  const prose=rows.filter(row=>{
   if(taggedRows.has(row)||distributionRows.has(row))return false;
   const text=[...row].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ');
   // Inline formulas followed by a prose sentence, and connective lines
   // surrounding displays, must remain prose instead of entering the crop.
   if(/[.;]\s+[A-Z][A-Za-z]*[ -]+[a-z]{2,}/.test(text)||/^\s*(?:with|where)\b[\s\S]*\b(?:and|or)\s*$/i.test(text))return true;
   const words=text.match(/[A-Za-z]{2,}/g)||[];
   const ordinary=words.filter(w=>! /^(?:min|max|log|exp|sin|cos|tan|Loss|PredLoss|Pearson|score)$/i.test(w));
   return ((ordinary.length>=3&&text.length>=12)||(/:\s*$/.test(text)&&ordinary.length>=1))&&!(/[=∑∫]/.test(text)&&ordinary.length<5);
  });
  if(prose.length<2)continue;
  const proseItems=new Set(prose.flat());
  const taggedItems=new Set([...taggedRows].flat());
  const seeds=column.filter(i=>(/[=∑∫≤≥≠≈−]/.test(i.str)||taggedItems.has(i)&&/¼/.test(i.str)||distributionItems.has(i)&&/[∼~]/.test(i.str))&&!proseItems.has(i)&&!annotationItems.has(i));
  for(const seed of seeds){
   if(removed.has(seed))continue;
   const y=seed.transform[5];
   if(prose.some(row=>row.some(i=>Math.abs(i.transform[5]-y)<Math.max(seed.height,i.height)*.9)))continue;
   const above=Math.min(height-20,...prose.flat().filter(i=>i.transform[5]>y).map(i=>i.transform[5]));
   const below=Math.max(20,...prose.flat().filter(i=>i.transform[5]<y).map(i=>i.transform[5]+i.height));
   if(Math.min(above-y,y-below)>70)continue;
   const candidates=column.filter(i=>!proseItems.has(i)&&!removed.has(i)&&i.transform[5]>below+2&&i.transform[5]+i.height<above-2);
   // Grow through nearby vertical glyph extents. Fractions and multi-line
   // expressions stay together; a larger blank gap separates display equations.
   let block=[seed],bottom=y,top=y+seed.height;
   for(let changed=true;changed;){
    changed=false;
    for(const i of candidates){
     if(block.includes(i)||i.transform[5]>top+10||i.transform[5]+i.height<bottom-10)continue;
     block.push(i);bottom=Math.min(bottom,i.transform[5]);top=Math.max(top,i.transform[5]+i.height);changed=true;
    }
   }
   const text=block.map(i=>i.str).join('');
   if(!/[\p{L}\p{N}]/u.test(text)||text.length>500||(!/[=∑∫≤≥≠≈]/.test(text)&&!(taggedItems.has(seed)&&/¼/.test(text))&&!distributionItems.has(seed)&&(!/[α-ω]/i.test(text)||top-bottom<14)))continue;
   const left=Math.min(...block.map(i=>i.transform[4]))-4,right=Math.max(...block.map(i=>i.transform[4]+i.width))+4;
   top=Math.min(top+4,above-2);bottom=Math.max(bottom-5,below+2);
   if(right-left>(edges[col+1]-edges[col])*.96||top-bottom>150||left<0||bottom<0||top>height)continue;
   const marker=`[Folio equation ${equations.length+1}]`;
   equations.push({marker,crop:{x:left/width,y:(height-top)/height,width:(right-left)/width,height:(top-bottom)/height}});
   block.forEach(i=>removed.add(i));markers.push({...seed,str:marker,transform:[...seed.transform.slice(0,4),seed.transform[4],y],width:Math.min(140,right-left),height:8});
  }
 }
 return {items:[...items.filter(i=>!removed.has(i)),...markers],equations};
}
