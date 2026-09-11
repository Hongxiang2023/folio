import {analyzePage,type ReadingPage} from './reading-layout';
export type ReadingContext={title?:string;authors?:string;journal?:string;doi?:string;articleType?:'review'};
type Items=Parameters<typeof analyzePage>[0];
type Styles=Parameters<typeof analyzePage>[2];
type Heading=NonNullable<ReadingPage['headings']>[number];
const numberedHeading=/^(?:\d+(?:\.\d+)*[.)]?|[A-Z]\.(?:\d+(?:\.\d+)*\.?)?)\s+\p{L}/u;
export function readingProfile(context:ReadingContext={}){
 const journal=(context.journal||'').replace(/\./g,'').replace(/\s+/g,' ').trim();
 const abbreviated=/^Nat (?:Astron|Biomed Eng|Biotechnol|Cancer|Catal|Cell Biol|Chem(?: Biol| Eng)?|Clim Chang|Commun|Comput Sci|Ecol Evol|Electron|Energy|Food|Genet|Geosci|Hum Behav|Immunol|Mach Intell|Mater|Med|Metab|Methods|Microbiol|Nanotechnol|Neurosci|Photonics|Phys|Plants|Protoc|Rev .+|Sustain|Synth|Water)$/i.test(journal);
 return /^nature(?:\s|$)/i.test(journal)||abbreviated||/^(?:NCB|NMI)$/i.test(journal)||/^10\.1038\/(?:s415(?:56|86|92)-|s43588-|s42256-|s41467-|ncomms|ncb\d|nmeth\.)/i.test(context.doi||'')?'nature':'general';
}

type MarginPattern={text:string;x:number;y:number};
type PageSample={items:Items;width:number;height:number};
function marginRows({items,width,height}:PageSample){
 const rows:Items[]=[];
 for(const item of items){
  const y=item.transform[5];
  if(!item.str.trim()||!(y>height*.94||y<height*.045)||Math.abs(item.transform[1]||0)>.01||Math.abs(item.transform[2]||0)>.01)continue;
  let row=rows.find(r=>Math.abs(r[0].transform[5]-y)<2);
  if(!row){row=[];rows.push(row);}row.push(item);
 }
 return rows.map(items=>{
  items.sort((a,b)=>a.transform[4]-b.transform[4]);
  const text=items.map(i=>i.str).join(' ').normalize('NFKC').replace(/\s+/g,' ').trim().replace(/^\d{1,4}\s+|\s+\d{1,4}$/g,'').toLowerCase();
  return {items,text,x:items[0].transform[4]/width,y:items[0].transform[5]/height};
 });
}
// Learn only repeated text in the outer margins. Reuse the bounded layout
// sample: no additional full-document pass or journal list is required.
export function repeatedMarginPatterns(samples:PageSample[]):MarginPattern[]{
 const groups:{pattern:MarginPattern;pages:Set<number>}[]=[];
 samples.forEach((sample,page)=>{for(const row of marginRows(sample)){
  if((row.text.match(/\p{L}/gu)||[]).length<12||!row.text.includes(' '))continue;
  let group=groups.find(g=>g.pattern.text===row.text&&Math.abs(g.pattern.x-row.x)<.02&&Math.abs(g.pattern.y-row.y)<.006);
  if(!group){group={pattern:{text:row.text,x:row.x,y:row.y},pages:new Set()};groups.push(group);}group.pages.add(page);
 }});
 return groups.filter(g=>g.pages.size>=Math.max(3,Math.ceil(samples.length*.6))).map(g=>g.pattern);
}
export function removeRepeatedMargins(items:Items,width:number,height:number,patterns:MarginPattern[]):Items{
 if(!patterns.length)return items;
 const removed=new Set(marginRows({items,width,height}).filter(row=>patterns.some(p=>p.text===row.text&&Math.abs(p.x-row.x)<.02&&Math.abs(p.y-row.y)<.006)).flatMap(row=>row.items));
 return items.filter(i=>!removed.has(i));
}
export function canonicalSection(text:string):string|undefined{
 const value=text.replace(/^STAR\s*[★*+]\s*METHODS$/i,'Methods').replace(/^\s*(?:\d+(?:\.\d+)*[.)]?\s+)/,'').replace(/[★*]/g,' ').replace(/\s+/g,' ').replace(/[:.]$/,'').trim().toLowerCase();
 const aliases:Record<string,string>={abstract:'Abstract',summary:'Abstract',introduction:'Introduction',results:'Results','results and discussion':'Results',discussion:'Discussion',discussions:'Discussion',conclusion:'Conclusion',conclusions:'Conclusion',methods:'Methods','online methods':'Methods','materials and methods':'Methods','materials & methods':'Methods','experimental procedures':'Methods','star methods':'Methods',references:'References',reference:'References',bibliography:'References','references and notes':'References',acknowledgments:'Acknowledgments',acknowledgements:'Acknowledgments','data availability':'Data availability','data availability statement':'Data availability','code availability':'Code availability','supplementary information':'Supplementary information','additional information':'Additional information','competing interests':'Competing interests'};
 return aliases[value];
}
// Remove publisher furniture by complete margin baselines, never by scientific
// vocabulary. Small body footnotes and references remain available.
export function filterReadingItems(items:Items,width:number,styles:Styles,context:ReadingContext={},pageHeight?:number,pageNumber?:number):Items{
 const nature=readingProfile(context)==='nature';
 const communications=/^(?:Nature Communications|Nat\.? Commun\.?)$/i.test(context.journal||'')||/^10\.1038\/(?:s41467-|ncomms)/i.test(context.doi||'');
 if(communications){
  // Legacy production marks are rotated in the outer margin, not prose.
  items=items.filter(i=>!(i.transform[4]<width*.05&&Math.abs(i.transform[0])<.01&&Math.abs(i.transform[3])<.01&&/^1234567890\(\):,;$/.test(i.str.trim())));
  const article=items.find(i=>i.str.trim()==='Article'&&pageHeight&&i.transform[5]>pageHeight*.85&&i.transform[4]<width*.15);
  const doi=article&&items.find(i=>/^https:\/\/doi\.org\/10\.1038\/(?:s41467-|ncomms)\S+$/.test(i.str.trim())&&Math.abs(i.transform[5]-article.transform[5])<2);
  if(article&&doi)items=items.filter(i=>i!==article&&i!==doi);
 }
 // arXiv's version stamp is vertical publisher furniture in the outer left
 // margin. A horizontal mention or mathematical text remains untouched.
 items=items.filter(i=>!(i.transform[4]<width*.075&&Math.abs(i.transform[0])<.01&&Math.abs(i.transform[3])<.01&&Math.abs(i.transform[1])>0&&Math.abs(i.transform[2])>0&&/^arXiv:\s*(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?\s+\[[^\]]+\]\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s*$/i.test(i.str)));

 const font=(i:Items[number])=>styles?.[i.fontName||'']?.fontName||'';
 const genome=/^Genome Biol(?:ogy)?$/i.test(context.journal||'')||/^10\.1186\/s13059-/i.test(context.doi||'');
 const plos=/^PLOS(?:\s|$)/i.test(context.journal||'')||/^10\.1371\/journal\./i.test(context.doi||'');
 const advances=/^(?:Science Advances|Sci\.? Adv\.?)$/i.test(context.journal||'')||/^10\.1126\/sciadv\./i.test(context.doi||'');
 const science=advances||/^Science$/i.test(context.journal||'')||/^10\.1126\/science[./]/i.test(context.doi||'');
 const cell=/^10\.1016\/j\.(?:cell|celrep)\./i.test(context.doi||'')||/^(?:Cell|Cell Reports|Cell Rep\.?)$/i.test(context.journal||'');
 if(advances&&pageNumber===1&&pageHeight){
  const sidebar=items.filter(i=>i.transform[4]>width*.8&&i.transform[5]>pageHeight*.65&&i.height<=8.5);
  const signature=sidebar.map(i=>i.str).join('').replace(/\s/g,'');
  if(/copyright©(?:19|20)\d{2}/i.test(signature)&&/CreativeCommons/i.test(signature)&&/licen[cs]e/i.test(signature)){
   const excluded=new Set(sidebar);items=items.filter(i=>!excluded.has(i));
  }
 }
 // Cell's graphical cover precedes the actual article opening. Require its
 // distinctive labels together before excluding the graphic and contact box.
 const graphical=items.find(i=>i.str.trim()==='Graphical abstract');
 const highlights=items.find(i=>i.str.trim()==='Highlights');
 const authors=items.find(i=>i.str.trim()==='Authors');
 const brief=items.find(i=>i.str.trim()==='In brief');
 const graphicalCover=Boolean(pageNumber===1&&graphical&&highlights&&authors&&brief&&graphical.transform[4]<width/2&&authors.transform[4]>width/2&&graphical.transform[5]>highlights.transform[5]&&authors.transform[5]>brief.transform[5]);
 if(graphicalCover&&graphical&&highlights&&authors&&brief){
  items=items.filter(i=>!(i.str.trim()==='Resource'&&i.transform[5]>graphical.transform[5])&&!(i.transform[4]<authors.transform[4]-5&&i.transform[5]<=graphical.transform[5]+1&&i.transform[5]>highlights.transform[5]+highlights.height)&&!(i.transform[4]>=authors.transform[4]-5&&i.transform[5]<=authors.transform[5]+1&&i.transform[5]>brief.transform[5]+brief.height));
 }
 // Science can print an unlabeled, inset abstract beneath a long author
 // list while the third column already contains body prose. Establish the
 // title, repeated wide abstract typography and raised affiliation markers
 // before removing only the author region, never the neighboring column.
 if(science&&pageNumber===1&&context.title){
  const title=items.find(i=>normalize(i.str)===normalize(context.title!));
  if(title){
   const wide=items.filter(i=>i.str.length>60&&i.width>width*.5&&i.transform[4]<width*.15&&i.transform[5]<title.transform[5]&&i.height<title.height*.7);
   const first=wide.sort((a,b)=>b.transform[5]-a.transform[5])[0];
   const abstractLines=first?wide.filter(i=>i.fontName===first.fontName&&Math.abs(i.height-first.height)<.2&&first.transform[5]-i.transform[5]<first.height*15):[];
   if(first&&abstractLines.length>=3){
    const right=Math.max(...abstractLines.map(i=>i.transform[4]+i.width))+first.height*.5;
    const authorRegion=items.filter(i=>i.transform[4]<right&&i.transform[5]>first.transform[5]+first.height&&i.transform[5]<title.transform[5]);
    const raised=authorRegion.filter(i=>/^\d+(?:,\d+)*$/.test(i.str)&&i.height<first.height*.8);
    const names=authorRegion.filter(i=>i.height>=first.height*.9&&i.str.length<80&&/^,?\s*\p{Lu}[\p{L}.'’ -]+$/u.test(i.str));
    if(raised.length>=5&&names.length>=5){
     items=items.filter(i=>!(i.transform[4]<right&&i.transform[5]>first.transform[5]+first.height&&i.transform[5]<=title.transform[5]+title.height));
     const abstractBottom=Math.min(...abstractLines.map(i=>i.transform[5]));
     const affiliations=items.filter(i=>i.transform[5]<abstractBottom-first.height*3&&i.height<first.height*.9&&/\b(?:Department|University|Institute)\b/.test(i.str));
     if(affiliations.length>=3){
      const top=Math.max(...affiliations.map(i=>i.transform[5]));
      const notes=items.filter(i=>i.transform[5]<=top+first.height*.6&&i.transform[5]>(pageHeight||0)*.04&&i.height<first.height*.9);
      if(notes.filter(i=>/^\d+$/.test(i.str)).length>=5&&notes.some(i=>/Corresponding author\. Email:.*@/i.test(i.str))){const noteSet=new Set(notes);items=items.filter(i=>!noteSet.has(i));}
     }
    }
   }
  }
 }
 // Some publishers put a cover before the title page. On either opening page,
 // an explicit abstract below a matching title and author affiliations marks
 // the end of bibliographic front matter; never apply this to later sections.
 const abstract=items.find(i=>canonicalSection(i.str)==='Abstract');
 if((pageNumber===1||pageNumber===2)&&abstract&&(context.title||cell)){
  const above=items.filter(i=>i.transform[5]>abstract.transform[5]+abstract.height);
  const text=above.map(i=>i.str).join(' ');
  const genomeAuthors=genome&&above.filter(i=>/^\d+(?:,\d+)*(?:\*)?$/.test(i.str.trim())&&i.height<abstract.height).length>=2;
  const matchingTitle=context.title?normalize(text).includes(normalize(context.title)):cell&&above.some(i=>i.str.length>30&&i.height>abstract.height*1.6);
  if(matchingTitle&&(/\b(?:correspondence|department|university)\b/i.test(text)||/@\s*[\w.-]+\.[a-z]{2,}/i.test(text)||genomeAuthors))items=items.filter(i=>i.transform[5]<=abstract.transform[5]+abstract.height);
 }
 if(genome&&pageNumber===1){
  const contact=items.find(i=>/^\*?Correspondence:/i.test(i.str.trim()));
  if(contact){
   const edge=abstract&&abstract.transform[4]>width*.25?abstract.transform[4]-10:width*.49;
   const sidebar=items.filter(i=>i.transform[4]+i.width<edge&&i.transform[5]<=contact.transform[5]+contact.height*.6&&i.height<=contact.height*1.15);
   const text=sidebar.map(i=>i.str).join(' ');
   if(/@/.test(text)&&/\b(?:Department|University|Laboratory|Institute|author information)\b/i.test(text)){const sideSet=new Set(sidebar);items=items.filter(i=>!sideSet.has(i));}
  }
  const copyright=items.find(i=>/^©\s*(?:The Author\(s\)\s*)?(?:19|20)\d{2}\b/.test(i.str.trim())&&pageHeight&&i.transform[5]<pageHeight*.25&&i.height<=8);
  if(copyright){
   const block=items.filter(i=>i.transform[4]>=copyright.transform[4]-2&&i.transform[5]<=copyright.transform[5]+copyright.height*.6&&i.height<=copyright.height*1.15);
   const text=block.map(i=>i.str).join(' ');
   if(/Open Access/i.test(text)&&/Creative Commons/i.test(text)&&/licen[cs]e/i.test(text)){const blockSet=new Set(block);items=items.filter(i=>!blockSet.has(i));}
  }
 }
 // Verified PLOS first-page template contains a repeated white-on-white
 // production marker in the left sidebar. This narrow signature does not
 // suppress invisible/OCR text or similar strings in the scientific body.
 if(plos&&pageNumber===1){
  const markers=items.filter(i=>/^a1{8,}$/.test(i.str)&&i.transform[4]<width*.1&&/MinionPro-Regular$/.test(font(i)));
  const repeated=markers.length>=3&&markers.every(i=>i.str===markers[0].str&&i.fontName===markers[0].fontName&&Math.abs(i.transform[4]-markers[0].transform[4])<1)&&Math.max(...markers.map(i=>i.transform[5]))-Math.min(...markers.map(i=>i.transform[5]))<=markers.length*20;
  if(repeated){const markerSet=new Set(markers);items=items.filter(i=>!markerSet.has(i));}
 }
 // Download watermarks are rotated in Science's outer side margin. Require
 // both the publisher URL signature and vertical transform, preserving prose.
 if(science)items=items.filter(i=>!(i.transform[4]>width-40&&Math.abs(i.transform[0])<.01&&Math.abs(i.transform[3])<.01&&Math.abs(i.transform[1])>0&&Math.abs(i.transform[2])>0&&/^Downloaded from https?:\/\/(?:www\.)?(?:science\.org|sciencemag\.org) on .+\b(?:19|20)\d{2}\s*$/i.test(i.str)));
 const cellLogo=cell&&pageHeight&&items.some(i=>i.str.trim()==='ll'&&i.transform[5]>pageHeight-110)&&items.some(i=>i.str.trim()==='OPEN ACCESS'&&i.transform[5]>pageHeight-110);
 if(cellLogo)items=items.filter(i=>!(i.transform[5]>pageHeight!-110&&/^(?:ll|OPEN ACCESS|Resource|Article|Review)$/i.test(i.str.trim())));
 const margins:Items[]=[];
 for(const item of items){
  const y=item.transform[5];
  if(y>(graphicalCover?85:64)&&(!pageHeight||y<pageHeight-64))continue;
  let line=margins.find(row=>Math.abs(row[0].transform[5]-y)<2);
  if(!line){line=[];margins.push(line);}line.push(item);
 }
 const furniture=new Set<Items[number]>();
 const lineText=(row:Items)=>[...row].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
 const preprintStamp=margins.some(row=>/\b(?:bioRxiv|medRxiv) preprint\b/i.test(lineText(row))&&/10\.1101\//.test(lineText(row)));
 const genomeMasthead=genome&&margins.some(row=>/\bGenome\s*Biology\s*\((?:19|20)\d{2}\)\s*\d+\s*:\s*\d+/.test(lineText(row)));
 const inPress=margins.some(row=>/^Please cite this article in press as:/i.test(lineText(row)));
 const cellPublication=margins.some(row=>/\bCell(?: Reports)?\s+\d+\s*,/.test(lineText(row))&&/\b(?:19|20)\d{2}\b/.test(lineText(row)));
 for(const row of margins){
  const text=lineText(row);
  const y=row[0].transform[5];
  const preprint=preprintStamp&&Boolean(pageHeight&&y>pageHeight-48)&&(/\b(?:bioRxiv|medRxiv) preprint\b/i.test(text)||/not certified by peer review.*license to display the preprint/i.test(text)||/^available under a CC[- ]BY.*license\s*\.?$/i.test(text));
  const runningTitle=Boolean(pageHeight&&pageNumber&&pageNumber>1&&y>pageHeight-64&&context.title&&normalize(text)===normalize(context.title));
  const pageLabel=Boolean(pageNumber&&y<64&&text===String(pageNumber));
  const journalKey=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  let journalLine=journalKey(text).replace(/\s*[|·•]\s*/g,' ').trim();
  if(pageNumber){
   if(journalLine.startsWith(`${pageNumber} `))journalLine=journalLine.slice(String(pageNumber).length+1);
   if(journalLine.endsWith(` ${pageNumber}`))journalLine=journalLine.slice(0,-String(pageNumber).length-1);
  }
  // Match the entire margin baseline, not journal-name substrings in prose.
  const journalMargin=Boolean(context.journal?.trim()&&journalLine===journalKey(context.journal));
  const footer=/\|\s*Vol(?:ume)?\.?\s*\d+/i.test(text)&&/\b(?:19|20)\d{2}\b/.test(text);
  const communicationsFooter=communications&&y<40&&/^Nature Communications\s*\|\s*\((?:19|20)\d{2}\)\s*\d+\s*:\s*\d+(?:\s+\d+)?$/i.test(text);
  const header=nature&&pageHeight&&row[0].transform[5]>pageHeight-48&&/^(?:Article|Brief Communication|Analysis|Review)(?:\s+https?:\/\/doi\.org\/\S+)?$/i.test(text);
  const pressLine=inPress&&Boolean(pageHeight&&y>pageHeight-64)&&(/^Please cite this article in press as:/i.test(text)||Boolean(context.doi&&text===`https://doi.org/${context.doi}`));
  const cellFooter=cell&&cellPublication&&y<(graphicalCover?85:64)&&(/\bCell(?: Reports)?\s+\d+\s*,/.test(text)||/^(?:This is an open access article under|(?:[A-Z][a-z]+ \d+, )?(?:19|20)\d{2} [©ª])/.test(text)||text==='ll'||Boolean(context.doi&&text.replace(/\s+ll$/,'')===`https://doi.org/${context.doi}`));
  const scienceHeader=science&&Boolean(pageHeight&&y>pageHeight-64)&&/^(?:SCIENCEADVANCES\|RESEARCHARTICLE|RESEARCHARTICLES|REPORTS|RESEARCHREPORTS|RESEARCH\|[A-Z][A-Z0-9,:&–-]{3,100})$/.test(text.replace(/\s/g,'').toUpperCase());
  const advancesFooter=advances&&y<40&&(/\bSci\.\s*Adv\.\s*\d+\s*,/.test(text)&&/\b(?:19|20)\d{2}\b/.test(text)||/^\d+\s+of\s+\d+$/.test(text));
  const scienceFooter=science&&y<40&&/\bSCIENCE\b/.test(text)&&/\bVOL(?:UME)?\.?\s+\d+\b/.test(text)&&/\b(?:19|20)\d{2}\b/.test(text)&&/\bwww\.sciencemag\.org\b/i.test(text);
  const scienceArticleFooter=science&&y<30&&/\bScience\s+\d+\s*,/.test(text)&&/\b(?:19|20)\d{2}\b/.test(text)&&/\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b/.test(text)&&/\b\d+\s+of\s+\d+\s*$/.test(text);
  const plosHeader=plos&&Boolean(pageHeight&&y>pageHeight-64)&&Boolean(context.journal&&context.title&&normalize(text)===normalize(`${context.journal} ${context.title}`));
  const plosFooter=plos&&y<48&&/^PLOS\b/i.test(text)&&Boolean(context.doi&&text.includes(`https://doi.org/${context.doi}`))&&/\b\d+\s*\/\s*\d+\s*$/.test(text)&&/\b(?:19|20)\d{2}\b/.test(text);
  const genomeHeader=genomeMasthead&&Boolean(pageHeight&&y>pageHeight-64)&&(/\bGenome\s*Biology\s*\((?:19|20)\d{2}\)\s*\d+\s*:\s*\d+/.test(text)||/^Page\s+\d+\s+of\s+\d+$/.test(text)||Boolean(context.doi&&[context.doi,`DOI ${context.doi}`,`https://doi.org/${context.doi}`].includes(text)));
  if(advancesFooter||communicationsFooter||genomeHeader||footer||header||preprint||runningTitle||pageLabel||journalMargin||pressLine||cellFooter||scienceHeader||scienceFooter||scienceArticleFooter||plosHeader||plosFooter)row.forEach(i=>furniture.add(i));
 }
 const clean=items.filter(i=>!furniture.has(i));
 if(!nature)return clean;
 const legacy=communications&&clean.some(i=>/AdvOTdd63dae3/.test(font(i)));
 const prose=clean.filter(i=>(/HardingText/i.test(font(i))||legacy&&/AdvOTdd63dae3/.test(font(i)))&&i.str.trim().length>25);
 // Only enable a publisher-specific figure rule once that publisher's prose
 // typography is established. Unknown layouts retain their original text.
 if(prose.reduce((n,i)=>n+i.str.length,0)<150)return clean;
 const groups=new Map<string,Items>();
 for(const item of clean){const name=font(item);if(/^[A-Z]{6}\+(?:Helvetica|Arial|Graphik)/i.test(name)||legacy&&/^(?:[A-Z]{6}\+)?(?:Helvetica|Arial|Graphik|Myriad|Times|Calibri|Symbol|Roboto|MinionPro)/i.test(name)){const group=groups.get(item.fontName||'')||[];group.push(item);groups.set(item.fontName||'',group);}}
 const figureFonts=new Set([...groups.values()].flat().filter(i=>i.str.trim()).length>=6?[...groups.keys()]:[]);
 const labels=clean.filter(i=>figureFonts.has(i.fontName||''));
 if(!labels.length)return clean;
 const inline=(i:Items[number])=>prose.some(p=>Math.abs(p.transform[5]-i.transform[5])<=p.height*.7&&i.transform[4]>=p.transform[4]-p.height&&i.transform[4]+i.width<=p.transform[4]+p.width+p.height);
 return clean.filter(i=>{
  if(inline(i))return true; // Includes italic genes, superscripts and math symbols.
  if(figureFonts.has(i.fontName||''))return false;
  // Symbols and panel letters can have their own embedded font. Remove only
  // those immediately next to confirmed figure labels, outside prose lines.
  if(/^[A-Z]{6}\+/.test(font(i))&&!/HardingText|AdvOT/i.test(font(i))&&labels.some(l=>Math.abs(l.transform[5]-i.transform[5])<=Math.max(l.height,i.height)*1.5&&i.transform[4]<=l.transform[4]+l.width+12&&i.transform[4]+i.width>=l.transform[4]-12))return false;
  return true;
 });
}
// Verified Nature / Nature Methods first-page template: abstract is large
// HardingText prose in the right inset; introduction is smaller two-column prose.
export function analyzeJournalPage(items:Items,width:number,styles:Styles,number:number,context:ReadingContext={},pageHeight?:number,columnSplits?:number[]){
 items=filterReadingItems(items,width,styles,context,pageHeight,number);
 const cell=/^10\.1016\/j\.(?:cell|celrep)\./i.test(context.doi||'')||/^(?:Cell|Cell Reports|Cell Rep\.?)$/i.test(context.journal||'');
 const advances=/^(?:Science Advances|Sci\.? Adv\.?)$/i.test(context.journal||'')||/^10\.1126\/sciadv\./i.test(context.doi||'');
 if(cell)styles=Object.fromEntries(Object.entries(styles||{}).map(([key,value])=>[key,/AdvPSHN-HI?(?:$|\+)/i.test(value.fontName||'')?{...value,bold:true}:value]));
 if(/^(?:Nature Communications|Nat\.? Commun\.?)$/i.test(context.journal||'')||/^10\.1038\/(?:s41467-|ncomms)/i.test(context.doi||'')){
  // This legacy publisher face is the bold section face despite lacking a
  // descriptive Bold suffix. Keep the mapping scoped to Communications.
  styles=Object.fromEntries(Object.entries(styles||{}).map(([key,value])=>[key,/^(?:[A-Z]{6}\+)?AdvOT70e1938e(?:\+|$)/i.test(value.fontName||'')?{...value,bold:true}:value]));
 }
 const options={...(readingProfile(context)==='nature'?{minColumnLines:2}:{}),...(columnSplits?{columnSplits}:{})};
 const intro=items.find(i=>canonicalSection(i.str)==='Introduction');
 const summary=items.find(i=>canonicalSection(i.str)==='Abstract');
 if(number<=2&&intro&&summary&&summary.transform[5]>intro.transform[5]&&summary.transform[4]<width*.2){
  const top=summary.transform[5]+summary.height;
  const bottom=intro.transform[5]+intro.height*.8;
  const region=items.filter(i=>i.transform[5]<=top&&i.transform[5]>bottom);
  if(region.filter(i=>i.width>width*.6&&i.str.length>50).length>=3){
   // Keep a wide abstract's last short line with the spanning block, even
   // when the next column starts beside the Introduction heading below it.
   const before=analyzePage(items.filter(i=>i.transform[5]>top),width,styles,options);
   const abstract=analyzePage(region,width,styles,{singleColumn:true});
   const body=analyzePage(items.filter(i=>i.transform[5]<=bottom),width,styles,options);
   return {paragraphs:[...before.paragraphs,...abstract.paragraphs,...body.paragraphs],headings:[...before.headings,...abstract.headings.map(h=>({...h,paragraph:h.paragraph+before.paragraphs.length})),...body.headings.map(h=>({...h,paragraph:h.paragraph+before.paragraphs.length+abstract.paragraphs.length}))]};
  }
 }
 if(advances&&number===1&&intro){
  const candidates=items.filter(i=>i.transform[5]>intro.transform[5]+intro.height&&i.transform[4]<width*.8&&i.height>=8&&i.height<=11&&/MyriadPro-(?:Semibold|Bold)/i.test(styles?.[i.fontName||'']?.fontName||'')&&i.str.length>30);
  const groups=[...new Set(candidates.map(i=>i.fontName))].map(font=>candidates.filter(i=>i.fontName===font));
  const lines=groups.find(group=>new Set(group.map(i=>Math.round(i.transform[5]))).size>=4&&group.reduce((n,i)=>n+i.str.length,0)>350);
  if(lines){
   const bottom=Math.min(...lines.map(i=>i.transform[5]))-lines[0].height*.7;
   const top=Math.max(...lines.map(i=>i.transform[5]+i.height))+1;
   const region=items.filter(i=>i.transform[5]>=bottom&&i.transform[5]<=top&&i.transform[4]<width*.81);
   const abstractStyles=Object.fromEntries(Object.entries(styles||{}).map(([key,value])=>[key,{...value,bold:false,fontName:(value.fontName||'').replace(/semibold|bold/gi,'Regular')}]));
   const abstract=analyzePage(region,width,abstractStyles,{singleColumn:true});
   const body=analyzePage(items.filter(i=>i.transform[5]<bottom),width,styles,options);
   if(abstract.paragraphs.length&&body.paragraphs.length)return {paragraphs:[...abstract.paragraphs,...body.paragraphs],headings:[{paragraph:0,title:'Abstract',level:1 as const,synthetic:true},...body.headings.map(h=>({...h,paragraph:h.paragraph+abstract.paragraphs.length}))]};
  }
 }
 // Conference articles can continue an inset left-column abstract above the
 // introduction in the right column, with affiliations beneath the abstract.
 // Use explicit headings and typography; keep the footnotes as separate prose.
 if(number===1&&readingProfile(context)!=='nature'){
  const abstract=items.find(i=>canonicalSection(i.str)==='Abstract'&&i.transform[4]<width/2);
  const intro=items.find(i=>canonicalSection(i.str)==='Introduction'&&i.transform[4]>=width/2);
  if(abstract&&intro&&intro.transform[5]<abstract.transform[5]){
   const top=abstract.transform[5]+1;
   const left=items.filter(i=>i.transform[4]<width/2&&i.transform[5]<top&&i.str.trim().length>35);
   const bodySize=left[0]?.height||0;
   const marker=items.find(i=>i.transform[4]<width/2&&i.transform[5]<top&&i.height<bodySize*.95&&/^(?:Equal contribution|Co-corresponding authors|Corresponding author)/i.test(i.str.trim()));
   const notes=marker?items.filter(i=>i.transform[4]<width/2&&i.transform[5]<=marker.transform[5]+marker.height*.7&&i.height<bodySize*.95):[];
   const noteSet=new Set(notes);
   const leftAbstract=items.filter(i=>!noteSet.has(i)&&i.transform[4]<width/2&&i.transform[5]<=top);
   const rightAbstract=items.filter(i=>i.transform[4]>=width/2&&i.transform[5]>intro.transform[5]+intro.height*.5&&i.transform[5]<=top);
   if(leftAbstract.length>3&&rightAbstract.length&&rightAbstract.every(i=>!i.str.trim()||i.height<=bodySize*1.15)){
    const leftResult=analyzePage(leftAbstract,width,styles,{singleColumn:true});
    const rightResult=analyzePage(rightAbstract,width,styles,{singleColumn:true});
    const paragraphs=[...leftResult.paragraphs];
    if(paragraphs.length>1&&rightResult.paragraphs.length&& !/[.!?:]$/.test(paragraphs.at(-1)!)&&/^[a-z]/.test(rightResult.paragraphs[0]))paragraphs[paragraphs.length-1]+=' '+rightResult.paragraphs.shift();
    paragraphs.push(...rightResult.paragraphs);
    const used=new Set([...leftAbstract,...rightAbstract,...notes]);
    const body=analyzePage(items.filter(i=>!used.has(i)&&i.transform[5]<=top),width,styles,options);
    const footnotes=analyzePage(notes,width,styles,{singleColumn:true});
    return {paragraphs:[...paragraphs,...body.paragraphs,...footnotes.paragraphs],headings:[{paragraph:0,title:'Abstract',level:1 as const},...body.headings.map(h=>({...h,paragraph:h.paragraph+paragraphs.length}))]};
   }
  }
 }

 if(number!==1||readingProfile(context)!=='nature')return analyzePage(items,width,styles,options);
 const font=(i:Items[number])=>styles?.[i.fontName||'']?.fontName||'';
 // Earlier Communications PDFs use an encoded AdvOT serif face for the
 // same inset abstract / two-column body template, including ligature faces.
 const proseFont=(i:Items[number])=>/HardingText/i.test(font(i))||(/^(?:[A-Z]{6}\+)?AdvOTdd63dae3(?:\+|$)/i.test(font(i))&&(/^(?:Nature Communications|Nat\.? Commun\.?)$/i.test(context.journal||'')||/^10\.1038\/(?:s41467-|ncomms)/i.test(context.doi||'')));
 const prose=items.filter(i=>proseFont(i)&&i.str.trim().length>30);
 const heights=prose.map(i=>i.height).filter(h=>h>0);const bodyHeight=Math.min(...heights);
 const abstractLines=prose.filter(i=>i.height>bodyHeight*1.05&&i.transform[4]>width*.3);
 if(prose.map(i=>i.str).join('').length<500||abstractLines.length<3)return analyzePage(items,width,styles,options);
 const abstractFragments=items.filter(i=>proseFont(i)&&i.height>bodyHeight*1.05&&i.transform[4]>width*.3);
 const bottom=Math.min(...abstractFragments.map(i=>i.transform[5]))-bodyHeight*.7;
 const top=Math.max(...abstractLines.map(i=>i.transform[5]+i.height))+2;
 const left=Math.min(...abstractLines.map(i=>i.transform[4]))-3;
 const isAbstract=(i:Items[number])=>i.transform[5]>=bottom&&i.transform[5]<=top&&i.transform[4]>=left;
 const abstract=analyzePage(items.filter(isAbstract),width,styles,{...options,singleColumn:true});
 const bodyLines=prose.filter(i=>i.transform[5]<bottom);
 const isBody=(i:Items[number])=>i.transform[5]<bottom&&(proseFont(i)||bodyLines.some(line=>Math.abs(line.transform[5]-i.transform[5])<line.height*.65&&i.transform[4]>=line.transform[4]-2&&i.transform[4]<=line.transform[4]+line.width+line.height));
 const body=analyzePage(items.filter(isBody),width,styles,options);
 if(!abstract.paragraphs.length||!body.paragraphs.length)return analyzePage(items,width,styles,options);
 return {paragraphs:[...abstract.paragraphs,...body.paragraphs],headings:[{paragraph:0,title:'Abstract',level:1 as const,synthetic:true},{paragraph:abstract.paragraphs.length,title:'Introduction',level:1 as const,synthetic:true},...body.headings.map(h=>({...h,paragraph:h.paragraph+abstract.paragraphs.length}))]};
}
const normalize=(text:string)=>text.normalize('NFKD').replace(/[^\p{L}\s]/gu,' ').replace(/\s+/g,' ').trim().toLowerCase();
function authorLine(text:string,context:ReadingContext){
 const value=normalize(text);if(!value||value.length>1000)return false;
 const names=(context.authors||'').split(';').map(normalize).filter(Boolean);
 let matches=0;const matchedTokens=new Set<string>();
 for(const name of names){const tokens=name.split(' ').filter(t=>t.length>1);if(tokens.length>=2&&tokens.every(t=>value.split(' ').includes(t))){matches++;tokens.forEach(t=>matchedTokens.add(t));}}
 const words=value.split(' ');const coverage=words.filter(word=>matchedTokens.has(word)).length/words.length;
 return coverage>=.65&&(matches>=2||(matches===1&&words.length<=8));
}
function mergeWrappedHeadings(page:ReadingPage):ReadingPage{
 const raw=new Map((page.headings||[]).map(h=>[h.paragraph,h]));const paragraphs:string[]=[],headings:Heading[]=[];
 for(let i=0;i<page.paragraphs.length;i++){
  const h=raw.get(i);let text=page.paragraphs[i];
  if(h?.level===2&&!h.synthetic){while(!numberedHeading.test(page.paragraphs[i+1]||'')&&raw.get(i+1)?.level===2&&!raw.get(i+1)?.synthetic&&text.length+page.paragraphs[i+1].length<200){text+=(text.endsWith('-')?'':' ')+page.paragraphs[++i];}}
  if(h)headings.push({...h,paragraph:paragraphs.length,title:h.synthetic?h.title:text});paragraphs.push(text);
 }
 return {...page,paragraphs,headings};
}
// Classify complete first-page metadata paragraphs, never isolated keywords.
// The source PDF retains these notices; ordinary scientific footnotes stay text.
function frontMatterNote(text:string){
 const value=text.normalize('NFKC').replace(/^\s*[*∗†‡§¶#\d,\s]+/u,'').trim();
 const affiliation=/\b(?:department|university|institute|school|hospital|laboratory|centre|center)\b/i.test(value);
 if(/^Equal contribution\.\s+Listing order is random\./i.test(value))return true;
 if(/^\s*[†‡]/.test(text)&&/^Work performed while at\s+[^.!?]+\./i.test(value)&&value.length<300)return true;
 if(/^\d+(?:st|nd|rd|th)\s+(?:Annual\s+)?Conference on\b/i.test(text.trim())&&/\([A-Z][A-Z0-9 -]*\b(?:19|20)\d{2}\)/.test(text)&&/[,;]/.test(text))return true;

 if(/^(?:(?:these|the following) authors contributed equally|equal contribution|co[- ]?corresponding authors?|corresponding authors?)\b/i.test(value)&&(affiliation||/@|\bcorrespondence\b/i.test(value)))return true;
 if(/^(?:correspondence (?:to|and)|corresponding author[.:]|e-?mail[.:])\s*/i.test(value)&&/@/.test(value))return true;
 const numbered=/^\s*[*†‡§¶#\d]/u.test(text.normalize('NFKC'));
 if(numbered&&/^(?:department|school|institute|faculty|laboratory|centre|center)\b/i.test(value)&&/\b(?:university|hospital)\b/i.test(value)&&/(?:,|@)/.test(value))return true;
 if(/^proceedings of\b/i.test(value)&&/\b(?:conference|symposium|workshop)\b/i.test(value)&&/\b(?:19|20)\d{2}\b/.test(value)&&/\bcopyright\b|©|\bPMLR\b/i.test(value))return true;
 return /^(?:copyright\s*(?:©|\(c\))?|©)\s*(?:19|20)\d{2}\b/i.test(value)&&/\b(?:authors?|rights reserved|publisher|license)\b/i.test(value);
}
export function organizeSections(input:ReadingPage[],context:ReadingContext={}):ReadingPage[]{
 const pages=input.map(mergeWrappedHeadings);const seen=new Set<string>();let active='';const nature=readingProfile(context)==='nature';
 const review=context.articleType==='review'||/^(?:Nature Reviews|Nat\.? Rev\.?)(?:\s|$)/i.test(context.journal||'');
 let lastMain='';
 const hasExplicitIntroduction=pages.some(p=>(p.headings||[]).some(h=>canonicalSection(h.title)==='Introduction'));
 for(const page of pages){
  const candidates=new Map((page.headings||[]).map(h=>[h.paragraph,h]));const paragraphs:string[]=[],headings:Heading[]=[];
  for(let i=0;i<page.paragraphs.length;i++){
   const text=page.paragraphs[i],candidate=candidates.get(i);
   if(page.number===1&&frontMatterNote(text))continue;
   // Bibliographic metadata is removed only in the front matter. References
   // and scientific discussion can contain the same names and must be retained.
   const front=page.number===1&&!['Introduction','Results','Discussion','Methods','References'].includes(active);
   if(front&&(authorLine(text,context)||/^(?:Received:|Accepted:|Published online:|Check for updates|Correspondence (?:to|and)|E-mail:)/i.test(text)))continue;
   const position=paragraphs.length;paragraphs.push(text);
   let main=candidate?.synthetic?canonicalSection(candidate.title):canonicalSection(text);
   if(main==='Abstract'&&active&&active!=='Abstract')main=undefined;
   if(active==='Abstract'&&hasExplicitIntroduction&&!seen.has('Introduction')&&main&&['Results','Methods','Discussion','Conclusion'].includes(main))main=undefined;
   if(/^(?:Author contributions|Online content|Reporting summary)[:.]?$/i.test(text.trim()))active='Other';
   if(!main&&nature&&(['Discussion','References','Data availability','Code availability'].includes(active)||active==='Other'&&lastMain==='Discussion')&&/^1[.)]\s+[\p{L}'’−-]+,\s*[A-Z]/u.test(text)&&/(?:et al\.|\b(?:19|20)\d{2}\b)/.test(text))main='References';
   if(main){
    active=main;lastMain=main;
    if(!seen.has(main)||main==='Methods'&&/^STAR\s*[★*+]\s*METHODS$/i.test(text.trim())){headings.push({paragraph:position,title:main,level:1,...(candidate?.synthetic||main==='References'&&!canonicalSection(text)?{synthetic:true}:{})});seen.add(main);}
    continue;
   }
   // Numbered headings come from typographic candidates, so numbered prose
   // lists and bibliography entries are not promoted just for having a number.
   if(candidate&&!candidate.synthetic&&numberedHeading.test(text)&&active!=='References'){
    const major=/^(?:\d+[.)]?|[A-Z]\.)\s/.test(text);
    if(major){active=text;lastMain=text;}
    headings.push({paragraph:position,title:text,level:major?1:2});continue;
   }
   if(candidate&&!candidate.synthetic&&/^[A-Z]\.\s/.test(text)&&active==='References'){active=text;lastMain=text;headings.push({paragraph:position,title:text,level:1});continue;}
   if(!candidate||candidate.level!==2||authorLine(text,context)||/^(?:Fig(?:ure)?\.?|Extended Data|Supplementary (?:Fig|Table)|Online content|Author contributions|Publisher|Reporting summary)\b/i.test(text)||normalize(text)===normalize(context.title||''))continue;
   // Nature research articles can omit the word 'Results'. Infer that boundary
   // only after an identified Introduction and on a later page.
   if(nature&&!review&&active==='Introduction'&&page.number>1&&!seen.has('Results')){active='Results';lastMain='Results';seen.add('Results');headings.push({paragraph:position,title:'Results',level:1,synthetic:true});}
   if(['Results','Methods','Discussion'].includes(active)&&lastMain===active||review&&active!=='References')headings.push({paragraph:position,title:candidate.title,level:2});
  }
  page.paragraphs=paragraphs;page.headings=headings;
 }
 return pages;
}
