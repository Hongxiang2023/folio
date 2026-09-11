import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../src/figure-zoom.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {zoomAtPoint,wheelZoom}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('zoom preserves the content under the cursor and supports arbitrary levels',()=>{
 const next=zoomAtPoint(100,137.4,200,300,50,70);
 assert.equal(next.zoom,137.4);
 assert.ok(Math.abs((next.left+50)/1.374-250)<1e-9);
 assert.ok(Math.abs((next.top+70)/1.374-370)<1e-9);
 const restored=zoomAtPoint(next.zoom,100,next.left,next.top,50,70);assert.ok(Math.abs(restored.left-200)<1e-9);assert.ok(Math.abs(restored.top-300)<1e-9);
 assert.equal(zoomAtPoint(100,1000,0,0,0,0).zoom,600);assert.equal(zoomAtPoint(100,0,0,0,0,0).zoom,25);
});
test('wheel zoom handles pixel, line and page deltas',()=>{
 assert.ok(wheelZoom(100,-50,0,500)>100);assert.ok(wheelZoom(100,50,0,500)<100);
 assert.equal(wheelZoom(100,1,1,500),wheelZoom(100,16,0,500));assert.equal(wheelZoom(100,1,2,100),wheelZoom(100,100,0,100));
});
