// Display numbers identify detected equations across the paper, not the author's
// printed equation numbers. Keep page/index IDs stable for existing reading caches.
export function equationVisuals(pages){
 let number=0;
 return pages.flatMap(p=>(p.equations||[]).map((_,index)=>{
  number++;
  return {id:`equation:${p.number}:${index}`,label:`Equation ${number} · page ${p.number}`,page:p.number,number};
 }));
}
