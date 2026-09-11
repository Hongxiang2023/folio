import {cp,mkdir,rm} from 'node:fs/promises';
const dest=new URL('../public/pdfjs/',import.meta.url);
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const name of ['cmaps','standard_fonts','wasm','iccs'])await cp(new URL(`../node_modules/pdfjs-dist/${name}`,import.meta.url),new URL(name,dest),{recursive:true});
await cp(new URL('../node_modules/pdfjs-dist/LICENSE',import.meta.url),new URL('LICENSE',dest));
