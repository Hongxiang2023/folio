import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../src/pdf-graphics.ts',import.meta.url),'utf8'),{compilerOptions:{module:99,target:99}}).outputText;
const {rasterImageBoxes}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const ops={save:1,restore:2,transform:3,beginGroup:4,endGroup:5,paintImageXObject:6,paintInlineImageXObject:7,paintImageMaskXObject:8};
test('PDF raster bounds honor nested transforms, restore and top-down reading coordinates',()=>{
 const list={fnArray:[3,1,3,6,2,1,3,7,2],argsArray:[[1,0,0,1,50,700],null,[400,0,0,100,0,-150],['image'],null,null,[100,0,0,50,50,-350],['inline'],null]};
 const boxes=rasterImageBoxes(list,ops,600,800);
 assert.equal(boxes.length,2);assert.deepEqual(boxes[0],{x:50/600,y:1-650/800,width:400/600,height:100/800});assert.equal(boxes[1].x,100/600);assert.equal(boxes[1].y,.5);
});
test('rotated image transforms enclose all corners and group state does not leak',()=>{
 const boxes=rasterImageBoxes({fnArray:[4,3,6,5,3,6],argsArray:[[{matrix:[1,0,0,1,100,200]}],[0,100,-50,0,0,0],[],null,[20,0,0,20,0,0],[]]},ops,600,800);
 assert.deepEqual(boxes[0],{x:50/600,y:1-300/800,width:50/600,height:100/800});assert.equal(boxes[1].x,0);assert.equal(boxes[1].width,20/600);
});
