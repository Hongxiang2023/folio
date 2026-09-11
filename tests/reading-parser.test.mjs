import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const layout=data(compile(await readFile(new URL('../src/reading-layout.ts',import.meta.url),'utf8')));
const sections=data(compile(await readFile(new URL('../src/reading-sections.ts',import.meta.url),'utf8')).replace("from './reading-layout'",`from '${layout}'`));
const extraction=data(compile(await readFile(new URL('../src/figure-extraction.ts',import.meta.url),'utf8')).replace("from './reading-layout'",`from '${layout}'`));
const graphics=data(compile(await readFile(new URL('../src/pdf-graphics.ts',import.meta.url),'utf8')));
const bibliography=data(compile(await readFile(new URL('../src/reading-bibliography.ts',import.meta.url),'utf8')));
const equations=data(compile(await readFile(new URL('../src/reading-equations.ts',import.meta.url),'utf8')));
let code=compile(await readFile(new URL('../src/parse-pdf.ts',import.meta.url),'utf8'));
code=code.replace("import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist';",'const getDocument=(options)=>globalThis.folioTestDocument(options);const GlobalWorkerOptions={};const OPS=globalThis.folioTestOps||{};');
code=code.replace(/import workerUrl from '[^']+';/,"const workerUrl='';").replace("from './pdf-graphics'",`from '${graphics}'`).replace("from './reading-layout'",`from '${layout}'`).replace("from './reading-bibliography'",`from '${bibliography}'`).replace("from './reading-equations'",`from '${equations}'`).replace("from './reading-sections'",`from '${sections}'`).replace("from './figure-extraction'",`from '${extraction}'`);
const {parsePdf}=await import(data(code));
test('cancellation stops a pending PDF operation and destroys the loading task once',async()=>{
 let destroyed=0;
 globalThis.folioTestDocument=()=>({promise:Promise.resolve({numPages:1,getPage:()=>new Promise(()=>{})}),destroy:async()=>{destroyed++;}});
 const abort=new AbortController();const parsing=parsePdf('fixture',abort.signal,()=>{});setTimeout(()=>abort.abort(),10);
 await assert.rejects(parsing,{name:'AbortError'});assert.equal(destroyed,1);delete globalThis.folioTestDocument;
});
test('scanned and encrypted PDFs report fallback and release resources',async()=>{
 let destroyed=0;
 globalThis.folioTestDocument=()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({view:[0,0,600,800],getViewport:()=>({width:600,height:800}),getTextContent:async()=>({items:[],styles:{}}),getOperatorList:async()=>({}),commonObjs:{has:()=>false},cleanup(){}})}),destroy:async()=>{destroyed++;}});
 await assert.rejects(parsePdf('fixture',new AbortController().signal,()=>{}),/OCR/);assert.equal(destroyed,1);
 globalThis.folioTestDocument=()=>({promise:Promise.reject(Object.assign(new Error('password'),{name:'PasswordException'})),destroy:async()=>{destroyed++;}});
 await assert.rejects(parsePdf('fixture',new AbortController().signal,()=>{}),/password protected/);assert.equal(destroyed,2);delete globalThis.folioTestDocument;
});

test('bold headings wait for asynchronously loaded PDF font descriptors',async()=>{
 const item=(str,y,fontName)=>({str,transform:[1,0,0,1,30,y],width:200,height:10,fontName});
 globalThis.folioTestDocument=()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({view:[0,0,600,800],getViewport:()=>({width:600,height:800}),getTextContent:async()=>({items:[item('Results',730,'heading'),item('Spatial organization',700,'heading'),item('This body paragraph contains enough selectable text for a complete reading view.',680,'body')],styles:{heading:{},body:{}}}),getOperatorList:async()=>({}),commonObjs:{has:()=>false,get:(key,resolve)=>setTimeout(()=>resolve({name:key==='heading'?'Research-Bold':'Research-Regular'}),10)},cleanup(){}})}),destroy:async()=>{}});
 const result=await parsePdf('fixture',new AbortController().signal,()=>{});
 assert.ok(result.pages[0].headings.some(h=>h.title==='Spatial organization'));delete globalThis.folioTestDocument;
});

test('sparse table pages borrow three-column evidence from agreeing dense pages',async()=>{
 const item=(str,x,y,width=160)=>({str,transform:[10,0,0,10,x,y],width,height:10,fontName:'body'});
 const dense=Array.from({length:8},(_,n)=>[40,220,400].map((x,col)=>item(`Column ${col+1} contains a sufficiently long line of ordinary scientific prose.`,x,700-n*12))).flat();
 const sparse=[...Array.from({length:7},(_,n)=>item(`Left narrative ${n} continues independently of the adjacent table.`,40,700-n*12)),item('Table 1. A wide comparison of measured outcomes across samples.',220,690,340),item('The wide table description continues on a separate line.',220,678,330)];
 globalThis.folioTestDocument=()=>({promise:Promise.resolve({numPages:3,getPage:async n=>({rotate:0,view:[0,0,600,800],getViewport:()=>({width:600,height:800}),getTextContent:async()=>({items:n===1?sparse:dense,styles:{body:{}}}),getOperatorList:async()=>({}),commonObjs:{has:()=>true,get:()=>({name:'Regular'})},cleanup(){}})}),destroy:async()=>{}});
 const result=await parsePdf('fixture',new AbortController().signal,()=>{});
 const text=result.pages[0].paragraphs.join('\n');
 assert.ok(text.indexOf('Left narrative 6')<text.indexOf('Table 1.'));
 assert.ok(!result.pages[0].paragraphs.some(p=>p.includes('Left narrative')&&p.includes('Table 1.')));
 delete globalThis.folioTestDocument;
});

test('Cell STAR Methods survives bibliography cleanup with a separately encoded star glyph',async()=>{
 const item=(str,x,y,width,height=10,fontName='body')=>({str,transform:[height,0,0,height,x,y],width,height,fontName});
 const pages=[[item('References',40,700,90,10,'bold'),item('1. Smith, A. An earlier scientific result (2024).',40,680,300)], [item('STAR',40,700,28,10,'bold'),item('+',68,700,6,10,'symbol'),item('METHODS',74,700,65,10,'bold'),item('KEY RESOURCES TABLE',40,675,180,8,'bold'),item('A required reagent used in the experiment remains available.',40,650,350,8),item('Cell type annotation',40,500,180,10,'italicBold'),item('The experimental procedure describes how all samples were processed.',40,480,350)]];
 const names={body:'ABCDEF+AdvPSA183',bold:'ABCDEF+AdvPSHN-H',symbol:'ABCDEF+AdvPS480274',italicBold:'ABCDEF+AdvPSHN-HI'};
 globalThis.folioTestDocument=()=>({promise:Promise.resolve({numPages:2,getPage:async n=>({rotate:0,view:[0,0,600,800],getViewport:()=>({width:600,height:800}),getTextContent:async()=>({items:pages[n-1],styles:Object.fromEntries(Object.keys(names).map(k=>[k,{}]))}),getOperatorList:async()=>({}),commonObjs:{has:()=>true,get:key=>({name:names[key]})},cleanup(){}})}),destroy:async()=>{}});
 try{
  const result=await parsePdf('fixture',new AbortController().signal,()=>{},undefined,{journal:'Cell Reports'});
  assert.ok(result.pages[1].headings.some(h=>h.title==='Methods'));
  assert.ok(result.pages[1].headings.some(h=>h.title==='Cell type annotation'));
  assert.ok(result.pages[1].paragraphs.some(p=>p.includes('experimental procedure')));
  assert.ok(!result.pages[0].paragraphs.some(p=>p.includes('Smith')));
 }finally{delete globalThis.folioTestDocument;}
});
