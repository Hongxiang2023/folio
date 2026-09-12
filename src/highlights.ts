import type {Highlight,HighlightColor} from './model';
import type {ReadingPage} from './reading-layout';
export type HighlightAnchor={paragraph:number;start:number;end:number};
// Exact quotes prevent a changed extraction from highlighting unrelated text.
export function locateHighlight(highlight:Highlight,page:ReadingPage):HighlightAnchor|null{
 const original=page.paragraphs[highlight.paragraph];
 if(original?.slice(highlight.start,highlight.end)===highlight.quote)return {paragraph:highlight.paragraph,start:highlight.start,end:highlight.end};
 const candidates:HighlightAnchor[]=[];
 page.paragraphs.forEach((text,paragraph)=>{let from=0;while(from<text.length){const start=text.indexOf(highlight.quote,from);if(start<0)break;candidates.push({paragraph,start,end:start+highlight.quote.length});if(candidates.length>1)return;from=start+1;}});
 return candidates.length===1?candidates[0]:null;
}
export function highlightSegments(text:string,ranges:{start:number;end:number;color?:HighlightColor;id?:string}[]){
 const valid=ranges.filter(r=>Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=text.length&&r.end>r.start);
 const events=new Map<number,{add:number[];remove:number[]}>();
 valid.forEach((r,i)=>{for(const [offset,kind] of [[r.start,'add'],[r.end,'remove']] as const){const event=events.get(offset)||{add:[],remove:[]};event[kind].push(i);events.set(offset,event);}});
 const result:{text:string;marked:boolean;color?:HighlightColor;highlightIds?:string[]}[]=[];
 const active=new Set<number>();let winner=-1,position=0;
 const append=(end:number)=>{
  if(end<=position)return;
  const current=winner>=0?valid[winner]:undefined;
  const ids=[...active].map(i=>valid[i].id).filter((id):id is string=>Boolean(id));
  const part={text:text.slice(position,end),marked:Boolean(current),...(current?.color?{color:current.color}:{}),...(ids.length?{highlightIds:ids}:{})};
  const last=result.at(-1);
  if(last&&last.marked===part.marked&&last.color===part.color&&JSON.stringify(last.highlightIds)===JSON.stringify(part.highlightIds))last.text+=part.text;
  else result.push(part);
  position=end;
 };
 for(const offset of [...events.keys()].sort((a,b)=>a-b)){
  append(offset);const event=events.get(offset)!;
  event.remove.forEach(i=>active.delete(i));event.add.forEach(i=>active.add(i));
  // Later saved highlights determine the visible color of overlapping passages.
  winner=active.size?Math.max(...active):-1;
 }
 append(text.length);return result;
}
