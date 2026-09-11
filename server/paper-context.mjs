// Local retrieval: no embedding service, remote index, or extra model request.
const stop=new Set('a an and are as at be been by can could did do does for from had has have how i in is it its me of on or our should that the their them there these they this those to was we were what when where which who why will with would you your explain please paper study result results'.split(' '));
const words=text=>(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(w=>!stop.has(w));
const terms=text=>new Set(words(text));
const broadQuestion=q=>/\b(summar\w*|overview|overall|main findings|key findings|limitations|strengths|weaknesses|compare|comparison|whole paper|entire paper|across the paper)\b/i.test(q);
const followupQuestion=q=>terms(q).size<2||/\b(it|that|those|these|they|this|above|previous|elaborate|more detail)\b/i.test(q);

function excerpt(text,limit){
 if(text.length<=limit)return text;
 const marker='\n[earlier message shortened]\n',head=Math.floor((limit-marker.length)*.7);
 return text.slice(0,head)+marker+text.slice(-(limit-marker.length-head));
}

export function compactHistory(history){
 // Keep two recent exchanges. Never alter the full, locally stored messages.
 const recent=history.slice(-4);
 return recent.map((m,i)=>({role:m.role,content:excerpt(m.content,
  i>=recent.length-2?(m.role==='user'?1500:2500):(m.role==='user'?700:1100))}));
}

export function selectPaperPassages(cache,question,{summary=false,page,selection='',history=[],visualId,includeVisuals=false}={}){
 const selectedFigure=includeVisuals&&typeof visualId==='string'&&/^figure:\d+$/.test(visualId)?cache.figures[Number(visualId.split(':')[1])]:undefined;
 const equationPage=includeVisuals&&typeof visualId==='string'&&/^equation:\d+:\d+$/.test(visualId)?Number(visualId.split(':')[1]):undefined;
 const legend=selectedFigure?.caption?.slice(0,15000)||'';
 const budget=summary?90000:(broadQuestion(question)?24000:12000);
 // Explicit selections/legends are appended by the caller, within the text budget
 // where possible. A long explicitly selected legend can exceed the focused cap.
 const available=Math.max(0,budget-selection.length-legend.length);
 const blocks=[],seen=new Set();
 let total=0;
 function add(text,number){
  if(!text.trim())return;
  const key=text.trim().replace(/\s+/g,' ');
  if(seen.has(key))return;seen.add(key);total+=text.length;
  if(text===selection||text===selectedFigure?.caption)return;
  // Word-boundary chunks let retrieval reach evidence near the end of long paragraphs.
  for(let start=0;start<text.length;){
   let end=Math.min(text.length,start+1200);
   if(end<text.length){const space=text.lastIndexOf(' ',end);if(space>start+600)end=space+1;}
   const part=text.slice(start,end);blocks.push({page:number,text:part,order:blocks.length,terms:terms(part)});start=end;
  }
 }
 for(const p of cache.pages)for(const text of p.paragraphs)add(text,p.number);
 for(const f of cache.figures)if(f.caption)add(f.caption,f.captionPage||f.page);
 const query=terms(question+' '+selection.slice(0,1000));
 const followup=!summary&&followupQuestion(question),prior=followup?[...history].reverse().find(m=>m.role==='user'):undefined;
 const previousTerms=terms(prior?.content||'');
 const priorAnswer=followup?[...history].reverse().find(m=>m.role==='assistant'):undefined;
 const priorPages=new Set((priorAnswer?.content.match(/\[p\.\s*(\d+)\]/g)||[]).map(s=>Number(s.match(/\d+/)[0])));
 const frequencies=new Map();
 for(const b of blocks)for(const t of b.terms)frequencies.set(t,(frequencies.get(t)||0)+1);
 for(const b of blocks){
  b.score=0;
  for(const t of query)if(b.terms.has(t))b.score+=Math.log(1+blocks.length/(frequencies.get(t)||1));
  for(const t of previousTerms)if(b.terms.has(t))b.score+=.5*Math.log(1+blocks.length/(frequencies.get(t)||1));
  if(b.page===page||b.page===selectedFigure?.page||b.page===equationPage||priorPages.has(b.page))b.score+=.25;
 }
 const selected=[],used=new Map();let length=0;
 function take(b,cap=available){
  if(!b||length>=cap)return;
  const existing=used.get(b.order),offset=existing?.text.length||0;
  const text=b.text.slice(offset,offset+cap-length);if(!text)return;
  if(existing)existing.text+=text;
  else {const entry={...b,text};selected.push(entry);used.set(b.order,entry);}
  length+=text.length;
 }
 function coverage(cap){
  const groups=new Map();for(const b of blocks){if(!groups.has(b.page))groups.set(b.page,[]);groups.get(b.page).push(b);}
  // Allocate each page an equal share so long early pages cannot crowd out Methods.
  const perPage=Math.floor((cap-length)/Math.max(1,groups.size));
  for(const group of groups.values()){const end=length+perPage;for(const b of group)take(b,end);}
 }
 if(summary){if(total<=available)blocks.forEach(b=>take(b));else coverage(available);}
 else {
  const ranked=[...blocks].sort((a,b)=>b.score-a.score||a.order-b.order);
  if(broadQuestion(question)||!ranked.some(b=>b.score>.25))coverage(Math.floor(available/2));
  for(const b of ranked){
   if(b.score<=0)continue;
   take(b);
   // Include nearby source text to retain definitions and qualifications.
   for(const neighbor of [blocks[b.order-1],blocks[b.order+1]])if(neighbor?.page===b.page)take(neighbor);
   if(length>=available)break;
  }
 }
 selected.sort((a,b)=>a.page-b.page||a.order-b.order);
 const limited=selected.length<blocks.length||selected.some(b=>b.text.length<blocks[b.order].text.length)||(selectedFigure?.caption?.length||0)>legend.length;
 return {selected,budget,limited};
}
