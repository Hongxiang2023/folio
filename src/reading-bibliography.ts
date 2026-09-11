import type {ReadingPage} from './reading-layout';

const referenceTitle=/^(?:references?(?: and notes)?|bibliography)[:.]?$/i;
// Author initials plus a publication year distinguish bibliography entries from
// numbered Methods steps. Several entries may share one extracted paragraph.
function numberedReference(text:string){
 return /^\s*\d{1,4}[.)]\s+(?:[\p{L}'’−-]+(?:\s+[\p{L}'’−-]+){0,3},\s*(?:[A-Z]\.|[A-Z]\s))/u.test(text)&&/\b(?:18|19|20)\d{2}[a-z]?\b/.test(text);
}
const boundary=/^(?:abstract|introduction|results|discussion|conclusions?|(?:online |materials and |star\s*[★*+]\s*)?methods|data availability|code availability|acknowledg(?:e)?ments|author contributions|competing interests|additional information|supplementary information|reporting summary|funding|publisher[’']?s note|open access|copyright|©|extended data|supplementary (?:fig|table)|fig(?:ure)?\.?\s*\d|correspondence|peer review information)\b/i;

/** Omit bibliographies from the disposable reading text, including an unheaded
 * second list after Methods. Keep page identity and all non-text cache metadata. */
export function omitBibliography(input:ReadingPage[]):{pages:ReadingPage[];removedParagraphs:number}{
 let inReferences=false,removedParagraphs=0;
 const pages=input.map(page=>{
  const paragraphs:string[]=[],headings:NonNullable<ReadingPage['headings']>=[];
  const equations:NonNullable<ReadingPage['equations']>=[];
  const oldEquations=new Map((page.equations||[]).map(e=>[e.paragraph,e]));
  const oldHeadings=new Map((page.headings||[]).map(h=>[h.paragraph,h]));
  for(let i=0;i<page.paragraphs.length;i++){
   const text=page.paragraphs[i],value=text.trim(),heading=oldHeadings.get(i);
   const referenceHeading=referenceTitle.test(value)||(heading&&referenceTitle.test(heading.title));
   if(referenceHeading||numberedReference(value)){inReferences=true;removedParagraphs++;continue;}
   if(inReferences&&(boundary.test(value)||heading)){inReferences=false;}
   if(inReferences){removedParagraphs++;continue;}
   const equation=oldEquations.get(i);
   if(equation)equations.push({...equation,paragraph:paragraphs.length});
   for(const h of page.headings||[])if(h.paragraph===i)headings.push({...h,paragraph:paragraphs.length});
   paragraphs.push(text);
  }
  return {...page,paragraphs,headings,...(page.equations?{equations}:{})};
 });
 return {pages,removedParagraphs};
}
