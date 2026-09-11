import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
let code=ts.transpileModule(await readFile(new URL('../src/figure-renderer.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
code=code.replace("import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';",'const getDocument=options=>globalThis.folioRenderFixture(options);const GlobalWorkerOptions={};').replace(/import workerUrl from '[^']+';/,"const workerUrl='';");
const {figureDimensions,createFigureRenderer}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('high resolution canvas follows display size with bounded memory',()=>{
 assert.equal(figureDimensions(600,800,1800).width,1800);
 const large=figureDimensions(600,800,10000);assert.ok(large.width*large.height<=12_010_000);assert.ok(large.width>2500);
});
test('live rendering uses original local PDF and destroys temporary canvases on cancellation',async()=>{
 let destroyed=0,cancelled=0,canvas;
 globalThis.document={createElement:()=>canvas={width:0,height:0}};
 globalThis.folioRenderFixture=options=>{assert.equal(options.url,'/api/pdfs/saved-id');return {promise:Promise.resolve({getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>({promise:new Promise((_,reject)=>{globalThis.cancelRender=()=>reject(new Error('cancelled'));}),cancel:()=>{cancelled++;globalThis.cancelRender();}}),cleanup(){}})}),destroy:async()=>{destroyed++;}};};
 const renderer=createFigureRenderer('saved-id'),abort=new AbortController();const work=renderer.render(2,1800,abort.signal);setTimeout(()=>abort.abort(),10);
 await assert.rejects(work);assert.equal(cancelled,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);await renderer.destroy();assert.equal(destroyed,1);
 delete globalThis.document;delete globalThis.folioRenderFixture;delete globalThis.cancelRender;
});

test('cropped rendering offsets the source page and allocates only the figure region',async()=>{
 let rendered;
 globalThis.document={createElement:()=>({width:0,height:0})};
 globalThis.folioRenderFixture=()=>({promise:Promise.resolve({getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:args=>{rendered=args;return {promise:Promise.resolve(),cancel(){}};},cleanup(){}})}),destroy:async()=>{}});
 const renderer=createFigureRenderer('saved-id');
 const canvas=await renderer.render(1,900,new AbortController().signal,{x:.1,y:.2,width:.5,height:.4});
 assert.equal(canvas.width,900);assert.equal(canvas.height,960);assert.deepEqual(rendered.transform,[1,0,0,1,-180,-480]);
 await renderer.destroy();delete globalThis.document;delete globalThis.folioRenderFixture;
});
