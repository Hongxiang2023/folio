import type {Highlight} from './model';
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
export function highlightSegments(text:string,ranges:{start:number;end:number}[]){
 const sorted=ranges.filter(r=>r.start>=0&&r.end<=text.length&&r.end>r.start).sort((a,b)=>a.start-b.start);
 const merged:{start:number;end:number}[]=[];
 for(const range of sorted){const last=merged.at(-1);if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);else merged.push({...range});}
 const result:{text:string;marked:boolean}[]=[];let position=0;
 for(const range of merged){if(range.start>position)result.push({text:text.slice(position,range.start),marked:false});result.push({text:text.slice(range.start,range.end),marked:true});position=range.end;}
 if(position<text.length)result.push({text:text.slice(position),marked:false});return result;
}
