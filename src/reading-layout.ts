export type ReadingPage={number:number;paragraphs:string[];equations?:{paragraph:number;image:string}[];image?:string;headings?:{paragraph:number;title:string;level:1|2;synthetic?:boolean}[]};
export type ReadingFigure={page:number;label:string;caption:string;captionPage?:number;crop?:{x:number;y:number;width:number;height:number}};
export type ReadingCache={version:1;layoutVersion?:number;pages:ReadingPage[];figures:ReadingFigure[];warnings:string[]};
type Item={str:string;transform:number[];width:number;height:number;hasEOL?:boolean;fontName?:string};
type Style={fontFamily?:string;fontName?:string;bold?:boolean};
type Line={text:string;x:number;y:number;end:number;height:number;items:Item[];column:number;boldPrefix?:string};
const section=/^(?:\d+[. ]+)?(?:abstract|introduction|results(?: and discussion)?|discussion|conclusions?|(?:star\s*[★*+]\s*)?methods|materials and methods|references|acknowledg(?:e)?ments|data availability|code availability|supplementary information)$/i;
const caption=/^(?:(?:Extended Data|Supplementary)\s+)?Fig(?:ure)?\.?\s*\d+[a-z]?\s*[.|:]/i;
export function readingColumnSplits(items:Item[],pageWidth:number,options:{singleColumn?:boolean;minColumnLines?:number;columnSplits?:number[]}={}){
 if(options.singleColumn)return [];
 if(options.columnSplits)return [...options.columnSplits];
 const content=items.filter(i=>i.str.trim());let mid=pageWidth/2;
 // Detect the gutter before joining fragments: adjacent columns can be closer
 // than two font heights, particularly in Nature's narrow two-column layout.
 let twoColumns=!options.singleColumn&&content.filter(i=>i.str.length>30&&i.transform[4]<mid&&i.transform[4]+i.width<mid+5).length>=(options.minColumnLines??4)&&content.filter(i=>i.str.length>30&&i.transform[4]>=mid).length>=(options.minColumnLines??4);
 // Unequal-width publisher columns need not have their gutter at page center.
 // Require several long lines on both sides and a genuine empty horizontal gap.
 if(!twoColumns&&!options.singleColumn){
  const runs=content.filter(i=>i.str.length>30&&i.width>pageWidth*.18),minimum=options.minColumnLines??4;
  for(const start of [...new Set(runs.map(i=>i.transform[4]))].filter(x=>x>pageWidth*.3&&x<pageWidth*.75).sort((a,b)=>a-b)){
   const left=runs.filter(i=>i.transform[4]+i.width<start-3),right=runs.filter(i=>Math.abs(i.transform[4]-start)<5);
   if(new Set(left.map(i=>Math.round(i.transform[5]))).size<minimum||new Set(right.map(i=>Math.round(i.transform[5]))).size<minimum)continue;
   const end=Math.max(...left.map(i=>i.transform[4]+i.width));
   const overlap=Math.min(Math.max(...left.map(i=>i.transform[5])),Math.max(...right.map(i=>i.transform[5])))-Math.max(Math.min(...left.map(i=>i.transform[5])),Math.min(...right.map(i=>i.transform[5])));
   if(start-end>pageWidth*.12||overlap<20)continue;
   mid=(end+start)/2;twoColumns=true;break;
  }
 }
 // Printed journals can use three columns. Establish three repeated line
 // starts and non-overlapping text extents before enabling that layout.
 let splits=twoColumns?[mid]:[];
 if(!options.singleColumn){
  const runs=content.filter(i=>i.str.length>30&&i.width>pageWidth*.15&&i.width<pageWidth*.36);
  const starts=[...new Set(runs.map(i=>Math.round(i.transform[4]/4)*4))].map(x=>({x,count:new Set(runs.filter(i=>Math.abs(i.transform[4]-x)<4).map(i=>Math.round(i.transform[5]/3))).size})).filter(g=>g.count>=4).sort((a,b)=>b.count-a.count).slice(0,16).map(g=>g.x).sort((a,b)=>a-b);
  let best:{splits:number[];score:number}|undefined;
  for(let a=0;a<starts.length;a++)for(let b=a+1;b<starts.length;b++)for(let c=b+1;c<starts.length;c++){
   const xs=[starts[a],starts[b],starts[c]];
   if(xs[1]-xs[0]<pageWidth*.2||xs[2]-xs[1]<pageWidth*.2||xs[1]-xs[0]>pageWidth*.38||xs[2]-xs[1]>pageWidth*.38)continue;
   const groups=xs.map(x=>runs.filter(i=>Math.abs(i.transform[4]-x)<4));
   const counts=groups.map(g=>new Set(g.map(i=>Math.round(i.transform[5]/3))).size);
   if(counts.some(n=>n<4))continue;
   const ends=groups.map(g=>Math.max(...g.map(i=>i.transform[4]+i.width)));
   if(ends[0]>xs[1]-3||ends[1]>xs[2]-3)continue;
   const overlap=Math.min(...groups.map(g=>Math.max(...g.map(i=>i.transform[5]))))-Math.max(...groups.map(g=>Math.min(...g.map(i=>i.transform[5]))));
   if(overlap<30)continue;
   const score=counts.reduce((a,b)=>a+b,0);
   if(!best||score>best.score)best={splits:[(ends[0]+xs[1])/2,(ends[1]+xs[2])/2],score};
  }
  if(best)splits=best.splits;
 }
 return splits;
}
export function analyzePage(items:Item[],pageWidth:number,styles:Record<string,Style>={},options:{singleColumn?:boolean;minColumnLines?:number;columnSplits?:number[]}={}){
 const tableText=new Set<Item>();
 const resources=items.find(i=>/^REAGENT or RESOURCE$/i.test(i.str.trim()));
 if(resources){
  const columns=items.filter(i=>/^(?:SOURCE|IDENTIFIER)$/.test(i.str.trim())&&Math.abs(i.transform[5]-resources.transform[5])<2&&i.transform[4]>resources.transform[4]+pageWidth*.2);
  if(columns.length===2){
   // Cell's resource table can continue on the next page without a caption.
   // Its three explicit column headers establish the small-font table region.
   const end=items.filter(i=>i.transform[5]<resources.transform[5]&&i.height>resources.height*1.08&&/^(?:RESOURCE AVAILABILITY|EXPERIMENTAL MODEL AND SUBJECT DETAILS|METHOD DETAILS|QUANTIFICATION AND STATISTICAL ANALYSIS)$/.test(i.str.trim()));
   const bottom=end.length?Math.max(...end.map(i=>i.transform[5]+i.height)):0;
   items.filter(i=>i.transform[5]<=resources.transform[5]+2&&i.transform[5]>bottom&&i.height<=resources.height*1.05).forEach(i=>tableText.add(i));
  }
 }
 for(const label of items.filter(i=>/^Table\s+\d+\s*[.:|]/i.test(i.str))){
  const cells=items.filter(i=>i.str.trim()&&i.transform[5]<label.transform[5]-label.height&&i.transform[4]>=label.transform[4]-2&&i.height>=label.height*.45&&i.height<=label.height*.85&&i.width<pageWidth*.22);
  const rows:Item[][]=[];
  for(const item of cells){let row=rows.find(r=>Math.abs(r[0].transform[5]-item.transform[5])<1.5);if(!row){row=[];rows.push(row);}row.push(item);}
  const dense=rows.filter(row=>row.filter(i=>/\d/.test(i.str)).length>=3&&row.length>=5);
  const aligned=dense.filter(row=>row.filter(i=>dense.filter(other=>other.some(j=>Math.abs(j.transform[4]-i.transform[4])<2)).length>=4).length>=5);
  if(aligned.length<4)continue;
  const repeatedCells=aligned.flat().filter(i=>dense.filter(other=>other.some(j=>Math.abs(j.transform[4]-i.transform[4])<2)).length>=4);
  const right=Math.max(...repeatedCells.map(i=>i.transform[4]+i.width))+2;
  const top=Math.max(...aligned.map(r=>r[0].transform[5]))+label.height*2;
  const bottom=Math.min(...aligned.map(r=>r[0].transform[5]))-label.height*.5;
  // Dense, repeated table columns can contain bold genes or categories.
  // Retain all cells as text, without turning that emphasis into navigation.
  items.filter(i=>i.transform[5]<=top&&i.transform[5]>=bottom&&i.transform[4]>=label.transform[4]-2&&i.transform[4]+i.width<=right&&i.height<=label.height*.85).forEach(i=>tableText.add(i));
  items.filter(i=>i.transform[5]<=label.transform[5]+2&&i.transform[5]>top&&i.transform[4]>=label.transform[4]-2&&i.height<=label.height*1.1).forEach(i=>tableText.add(i));
 }
 // A wide, explicitly labeled table can overlap neighboring prose. Repeated
 // aligned numeric rows establish its extent; keep each row together before
 // applying prose-column gutters. Never infer a table from numbers alone.
 const tableRows=new Set<Item>();
 for(const label of items.filter(i=>/^Table\s+\d+[.:]\s/i.test(i.str)&&i.width>pageWidth*.3)){
  const region=items.filter(i=>i.str.trim()&&i.transform[4]>=label.transform[4]-2&&i.transform[5]<label.transform[5]-label.height*2&&i.height>=label.height*.96&&i.height<=label.height*1.04);
  const rows:Item[][]=[];
  for(const i of region){let row=rows.find(r=>Math.abs(r[0].transform[5]-i.transform[5])<label.height*.25);if(!row){row=[];rows.push(row);}row.push(i);}
  const isNumber=(i:Item)=>/^[+−–-]?\d+(?:[.,]\d+)*(?:[%×])?$/.test(i.str.trim());
  const candidates=rows.filter(r=>r.filter(isNumber).length>=2&&r.some(i=>/[A-Za-z]{3}/.test(i.str)&&Math.abs(i.transform[4]-label.transform[4])<label.height));
  const numeric=candidates.filter(r=>r.filter(i=>isNumber(i)&&candidates.filter(other=>other.some(j=>isNumber(j)&&Math.abs(j.transform[4]-i.transform[4])<3)).length>=3).length>=2);
  if(numeric.length<4)continue;
  const used=new Set<Item>();const merged:Item[]=[];
  for(const row of numeric){row.sort((a,b)=>a.transform[4]-b.transform[4]);const first=row[0],end=Math.max(...row.map(i=>i.transform[4]+i.width));const combined={...first,str:row.map(i=>i.str.trim()).join(' | '),width:end-first.transform[4]};row.forEach(i=>used.add(i));tableRows.add(combined);merged.push(combined);}
  items=[...items.filter(i=>!used.has(i)),...merged];
 }
 // Large drop capitals use the bottom of a multi-line box as their baseline.
 // Attach one to the top line only when several adjacent prose lines establish
 // the indented paragraph; otherwise retain the original glyph geometry.
 const dropCaps=new Map<Item,Item>();const removedCaps=new Set<Item>();
 for(const cap of items.filter(i=>/^[A-Z]$/.test(i.str)&&i.height>25)){
  const adjacent=items.filter(i=>i.str.length>25&&/^[a-z]/.test(i.str)&&i.height<cap.height/3&&i.height>cap.height/10&&i.transform[4]>=cap.transform[4]+cap.width&&i.transform[4]<cap.transform[4]+cap.width+i.height&&i.transform[5]>=cap.transform[5]-1&&i.transform[5]<cap.transform[5]+cap.height).sort((a,b)=>b.transform[5]-a.transform[5]);
  const first=adjacent[0];
  if(first&&adjacent.filter(i=>i.fontName===first.fontName&&Math.abs(i.transform[4]-first.transform[4])<2).length>=3){dropCaps.set(first,{...first,str:cap.str+first.str,transform:[...first.transform.slice(0,4),cap.transform[4],first.transform[5]],width:first.transform[4]+first.width-cap.transform[4]});removedCaps.add(cap);}
 }
 const content=items.filter(i=>i.str.trim()&&!removedCaps.has(i)).map(i=>dropCaps.get(i)||i),splits=readingColumnSplits(content,pageWidth,options);
 const columns=splits.length+1,normalColumn=(x:number)=>splits.filter(s=>x>=s).length;
 const crosses=(i:Item)=>splits.some(s=>i.transform[4]<s&&i.transform[4]+i.width>s+8);
 // A full-width baseline can contain separate italic, symbol, and citation
 // runs. Keep those fragments with the spanning line instead of either column.
 const spanning=content.filter(i=>i.str.length>20&&i.width>pageWidth*(columns===3?.3:.4)&&crosses(i));
 // Fully justified spanning prose may arrive as one PDF run per word.
 // Extend only an established spanning block, with small gaps between words
 // and matching line extents on a neighboring baseline, never across a gutter.
 const baselines:Item[][]=[];
 for(const i of content.filter(i=>i.height>0&&!/^\[Folio equation \d+\]$/.test(i.str))){let row=baselines.find(r=>Math.abs(r[0].transform[5]-i.transform[5])<Math.min(r[0].height,i.height)*.2&&Math.abs(r[0].height-i.height)<Math.max(r[0].height,i.height)*.15);if(!row){row=[];baselines.push(row);}row.push(i);}
 const anchors=[...spanning];
 for(const row of baselines){
  row.sort((a,b)=>a.transform[4]-b.transform[4]);let chain:Item[]=[];
  const finishChain=()=>{
   if(chain.length>=3){const first=chain[0],end=Math.max(...chain.map(i=>i.transform[4]+i.width)),height=Math.max(...chain.map(i=>i.height));const joined={...first,width:end-first.transform[4],height,str:chain.map(i=>i.str).join(' ')};
    if(crosses(joined)&&joined.width>pageWidth*(columns===3?.3:.4)&&anchors.some(a=>Math.abs(a.transform[5]-joined.transform[5])>height*.7&&Math.abs(a.transform[5]-joined.transform[5])<height*2.1&&Math.abs(a.transform[4]-joined.transform[4])<height*2&&Math.abs(a.transform[4]+a.width-end)<height*2))spanning.push(joined);
   }chain=[];
  };
  for(const i of row){const prev=chain.at(-1);if(prev&&i.transform[4]-(prev.transform[4]+prev.width)>Math.min(prev.height,i.height)*.9)finishChain();chain.push(i);}finishChain();
 }
 const column=(i:Item)=>columns===1?0:/^\[Folio equation \d+\]$/.test(i.str)?normalColumn(i.transform[4]):spanning.some(s=>Math.abs(s.transform[5]-i.transform[5])<s.height*(i.height<s.height*.85?.65:.25)&&normalColumn(i.transform[4])>=normalColumn(s.transform[4])&&normalColumn(i.transform[4])<=normalColumn(s.transform[4]+s.width-1))?columns:crosses(i)?columns:normalColumn(i.transform[4]);
 const lines:Line[]=[];
 const isBold=(i:Item)=>{const s=styles[i.fontName||''];return Boolean(s?.bold||/bold|semibold|demi|black|heavy|AdvOT[^\s]*\.B\b|(?:^|[+_-])(?:cmbx|cmssbx|lmbx)|[-,]medi\b/i.test(`${i.fontName||''} ${s?.fontName||''} ${s?.fontFamily||''}`));};
 // Larger text establishes baselines first; raised citations then attach to
 // that baseline instead of splitting it into several out-of-order lines.
 for(const item of [...content].sort((a,b)=>b.height-a.height||b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
  const x=item.transform[4],y=item.transform[5],height=Math.max(1,Math.abs(item.height)),col=column(item);
  if(/^\[Folio equation \d+\]$/.test(item.str)){lines.push({text:'',x,y,end:x+item.width,height,items:[item],column:col});continue;}
  const candidates=lines.filter(l=>!/^\[Folio equation \d+\]$/.test(l.items[0].str)&&l.column===col&&Math.abs(l.y-y)<(height<l.height*.85?l.height*.65:Math.max(1,height*.2))&&x<=l.end+l.height*2&&x+item.width>=l.x-l.height*2);
  const line=candidates.sort((a,b)=>Math.abs(a.y-y)-Math.abs(b.y-y))[0];
  if(line){line.items.push(item);line.x=Math.min(line.x,x);line.end=Math.max(line.end,x+item.width);}else lines.push({text:'',x,y,end:x+item.width,height,items:[item],column:col});
 }
 // Citations can bridge two baseline fragments that were too far apart
 // before the smaller raised glyphs were added. Reconcile those clusters now.
 for(let a=0;a<lines.length;a++)for(let b=a+1;b<lines.length;b++){
  const left=lines[a],right=lines[b];
  if([left,right].some(l=>/^\[Folio equation \d+\]$/.test(l.items[0].str)))continue;
  if(left.column!==right.column||Math.abs(left.y-right.y)>Math.min(left.height,right.height)*.2||Math.abs(left.height-right.height)>Math.max(left.height,right.height)*.15)continue;
  const gap=Math.max(left.x,right.x)-Math.min(left.end,right.end);
  if(gap>Math.min(left.height,right.height)*.6)continue;
  left.items.push(...right.items);left.x=Math.min(left.x,right.x);left.end=Math.max(left.end,right.end);lines.splice(b--,1);
 }
 for(const line of lines){let end=line.x,prefixEnd=0,prefixOpen=true;line.items.sort((a,b)=>a.transform[4]-b.transform[4]);for(const item of line.items){const raw=item.str;const raised=item.height<line.height*.85&&item.transform[5]-line.y>line.height*.15;const numeric=/^[+−-]?\d+(?:\s*[,–−-]\s*\d+)*\s*$/.test(raw);const text=raised&&numeric?raw.replace(/[0-9+−–-]/g,c=>({'-':'⁻','−':'⁻','–':'⁻','+':'⁺'}[c]||'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)])):raw;line.text+=(line.text&&!/\s$/.test(line.text)&&!/^\s/.test(text)&&item.transform[4]-end>line.height*.12?' ':'')+text;end=item.transform[4]+item.width;if(prefixOpen&&isBold(item))prefixEnd=line.text.length;else if(item.str.trim())prefixOpen=false;}line.boldPrefix=line.text.slice(0,prefixEnd).trim();}
 lines.sort((a,b)=>b.y-a.y||a.x-b.x);
 const ordered:Line[]=[];let band:Line[]=[];
 const flush=(through=columns-1)=>{for(let col=0;col<=through;col++)ordered.push(...band.filter(l=>l.column===col));band=band.filter(l=>l.column>through);};
 const consumed=new Set<Line>();
 for(let index=0;index<lines.length;index++){
  const line=lines[index];if(consumed.has(line))continue;
  if(line.column===columns){
   const from=normalColumn(line.x),through=normalColumn(line.end-8);
   if(from>0){
    // A table spanning the right columns must not pull unrelated left-column
    // prose between its rows. Finish those earlier columns before its region.
    flush(from-1);
    const remaining:Line[]=[];
    for(const next of lines.slice(index+1)){
     if(next.column===columns&&normalColumn(next.x)<from)break;
     if(!consumed.has(next)&&next.column<from){remaining.push(next);consumed.add(next);}
    }
    for(let col=0;col<from;col++)ordered.push(...remaining.filter(l=>l.column===col));
   }
   flush(through);ordered.push(line);
  }else band.push(line);
 }flush();
 const bodySizes=content.filter(i=>i.str.length>40).map(i=>i.height).sort((a,b)=>a-b);const bodyHeight=bodySizes[Math.floor(bodySizes.length/2)]||10;
 const bounds=new Map(Array.from({length:columns+1},(_,col)=>col).map(col=>{const body=lines.filter(l=>l.column===col&&l.height>=bodyHeight*.85&&l.height<=bodyHeight*1.15&&l.end-l.x>pageWidth*.2);return [col,{left:Math.min(...body.map(l=>l.x)),right:Math.max(...body.map(l=>l.end))}];}));
 const leadingGaps=ordered.slice(1).flatMap((line,index)=>{const previous=ordered[index],gap=previous.y-line.y;return previous.column===line.column&&Math.abs(previous.height-line.height)<line.height*.15&&gap>=line.height*.8&&gap<=line.height*3?[gap]:[];}).sort((a,b)=>a-b);
 const leading=leadingGaps.length>=5?leadingGaps[Math.floor(leadingGaps.length/2)]:undefined;
 const paragraphs:string[]=[];const headings:NonNullable<ReadingPage['headings']>=[];let buffer='';let previous:Line|undefined;
 const finish=()=>{if(buffer.trim())paragraphs.push(buffer.trim());buffer='';};
 for(const line of ordered){
  const text=line.text.trim();
  if(line.items.some(i=>tableRows.has(i))){finish();paragraphs.push(text);previous=undefined;continue;}
  if(/^\[Folio equation \d+\]$/.test(text)){finish();paragraphs.push(text);previous=undefined;continue;}
  const gap=previous?previous.y-line.y:0;
  const boldLength=line.items.filter(i=>{const s=styles[i.fontName||''];return s?.bold||/bold|semibold|demi|black|heavy|AdvOT[^\s]*\.B\b|(?:^|[+_-])(?:cmbx|cmssbx|lmbx)|[-,]medi\b/i.test(`${i.fontName||''} ${s?.fontName||''} ${s?.fontFamily||''}`);}).reduce((sum,i)=>sum+i.str.length,0);
  const main=section.test(text);
  const prefix=line.boldPrefix||'';
  const inTable=line.items.some(i=>tableText.has(i));
  const lastHeading=headings.at(-1);
  if(!inTable&&!/[,:;]$/.test(prefix)&&prefix.length>=3&&prefix.length<text.length&&lastHeading?.level===2&&lastHeading.paragraph===paragraphs.length-1&&!buffer&&previous&&previous.column===line.column&&Math.abs(previous.height-line.height)<line.height*.03&&previous.items.find(i=>i.str.trim())?.fontName===line.items.find(i=>i.str.trim())?.fontName&&gap>0&&gap<line.height*1.8&&Math.abs(line.x-previous.x)<line.height&&lastHeading.title.length+prefix.length<200){
   // A wrapped heading can end with a short bold run on the same baseline
   // as the first regular sentence (for example "domains. In this section").
   paragraphs[lastHeading.paragraph]+=' '+prefix;lastHeading.title=paragraphs[lastHeading.paragraph];
   buffer=text.slice(prefix.length).trim();previous=line;continue;
  }
  if(!inTable&&!main&&!caption.test(text)&&prefix.length>=15&&prefix.length<text.length&&prefix.length>=text.length*.45&&text.length<=300&&!/[,:;]$/.test(prefix)){
   finish();headings.push({paragraph:paragraphs.length,title:prefix.replace(/[.]$/,''),level:2});paragraphs.push(prefix);buffer=text.slice(prefix.length).trim();previous=line;continue;
  }
  const nextLine=text.endsWith('-')&&boldLength>text.length*.7?ordered[ordered.indexOf(line)+1]:undefined;
  const wrappedHyphen=nextLine&&nextLine.column===line.column&&line.y-nextLine.y>0&&line.y-nextLine.y<line.height*1.8&&Math.abs(nextLine.height-line.height)<line.height*.03&&(nextLine.boldPrefix||'').length>3&&line.items[0]?.fontName===nextLine.items[0]?.fontName;
  const isHeading=!inTable&&(main||(!caption.test(text)&&text.length>=4&&text.length<=140&&(!/[.!?,;:-]$/.test(text)||wrappedHyphen)&&!/^https?:|^(?:Received|Accepted|Published|Article$|Open access$|Check for updates$)/i.test(text)&&!text.includes(' | ')&&/[a-zA-Z]{3}/.test(text)&&(boldLength>text.length*.7||line.height>bodyHeight*1.6)));
  const leftBounds=previous?bounds.get(previous.column):undefined,rightBounds=bounds.get(line.column);
  // Continue a full last line into the unindented top of the next column,
  // but never through a heading, caption, sentence end or paragraph indent.
  const continuesColumn=previous&&previous.column<columns-1&&line.column===previous.column+1&&gap<0&&buffer&&
   Math.abs(previous.height-line.height)<line.height*.15&&leftBounds&&rightBounds&&
   previous.end>=leftBounds.right-line.height*1.5&&line.x<=rightBounds.left+line.height*.35&&
   /^[a-z]/.test(text)&&!/[.!?:][⁰¹²³⁴⁵⁶⁷⁸⁹,⁻]*[”’"')\]]?$/.test(buffer)&&!caption.test(buffer)&&!isHeading&&!caption.test(text);
  const indented=previous&&previous.column===line.column&&rightBounds&&line.x>rightBounds.left+line.height*.6&&line.x<rightBounds.left+line.height*2&&previous.x<=rightBounds.left+line.height*.35;
  if(previous&&(isHeading||caption.test(text)||(!continuesColumn&&(gap>(leading?Math.max(line.height*1.5,leading*1.35):line.height*1.8)||gap< -line.height||line.column!==previous.column||Math.abs(line.x-previous.x)>pageWidth*.3||indented))))finish();
  if(isHeading){finish();headings.push({paragraph:paragraphs.length,title:text,level:main||/^\d+[.)]?\s+\p{L}/u.test(text)?1:2});paragraphs.push(text);previous=line;continue;}
  // A discretionary word break is removed only across consecutive text lines.
  if(buffer&&/[a-zA-Z]{2}-\s*$/.test(buffer)&&/^[a-z]/.test(text))buffer=buffer.replace(/-\s*$/,'')+text;else buffer+=(buffer?' ':'')+text;
  previous=line;
 }
 finish();return{paragraphs,headings};
}
export function pageParagraphs(items:Item[],pageWidth:number){return analyzePage(items,pageWidth).paragraphs;}
export function figureCaptions(paragraphs:string[],page:number):ReadingFigure[]{
 const result:ReadingFigure[]=[];
 for(const paragraph of paragraphs){const match=paragraph.match(/^((?:(?:Extended Data|Supplementary)\s+)?Fig(?:ure)?\.?\s*\d+[a-z]?)\s*[.|:]\s*(.+)/i);if(match)result.push({page,label:match[1],caption:paragraph.slice(0,10000)});}
 return result;
}
