import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/highlights.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {locateHighlight,highlightSegments}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('highlight anchors recover a unique quote after layout changes but reject ambiguous or absent text',()=>{
 const h={paragraph:0,start:0,end:6,quote:'result'};
 assert.deepEqual(locateHighlight(h,{paragraphs:['result here']}),{paragraph:0,start:0,end:6});
 assert.deepEqual(locateHighlight(h,{paragraphs:['Introduction','A result here']}),{paragraph:1,start:2,end:8});
 assert.equal(locateHighlight(h,{paragraphs:['A result here and another result']}),null);
 assert.equal(locateHighlight(h,{paragraphs:['This is unrelated']}),null);
});
test('overlapping highlights render once and preserve all text and offsets',()=>{
 const parts=highlightSegments('A useful finding.',[{start:2,end:8},{start:5,end:16}]);
 assert.equal(parts.map(p=>p.text).join(''),'A useful finding.');
 assert.deepEqual(parts,[{text:'A ',marked:false},{text:'useful finding',marked:true},{text:'.',marked:false}]);
});

test('overlapping colors retain annotation identities and do not duplicate text',()=>{
 const parts=highlightSegments('abcdefgh',[{id:'older',start:1,end:6,color:'yellow'},{id:'newer',start:3,end:7,color:'blue'}]);
 assert.equal(parts.map(p=>p.text).join(''),'abcdefgh');
 assert.deepEqual(parts.filter(p=>p.marked).map(p=>[p.text,p.color,p.highlightIds]),[['bc','yellow',['older']],['def','blue',['older','newer']],['g','blue',['newer']]]);
 assert.equal(highlightSegments('abc',[{start:-1,end:2},{start:0,end:10}])[0].marked,false);
});
