import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {createPaperChat,buildPaperContext} from '../server/paper-chat.mjs';
import {equationVisuals} from '../server/reading-visuals.mjs';
const id='12345678-1234-1234-1234-123456789abc';const paper={title:'Example',authors:'A',journal:'J'};
const cache={pages:[{number:1,paragraphs:['The experiment found a useful result.'],equations:[{paragraph:0,image:'data:image/jpeg;base64,YQ=='}]},{number:2,paragraphs:['Methods and limitations.']}],figures:[]};
const codexFactory=()=>({status:async()=>({installed:false,connected:false}),shutdown:async()=>{}});
test('consent, summary-once, local persistence, provider switch and key secrecy',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-chat-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));let calls=0;
 const create=()=>createPaperChat({dataDir,getPaper:()=>paper,readingCache:{get:async()=>({cache})},codexFactory,apiGenerate:async args=>{calls++;assert.equal(args.key,'private-fixture');assert.match(args.messages.at(-1).content,/\[p\. 1\]/);return 'The result is useful [p. 1].';}});
 let chat=await create();await chat.configure({provider:'openai',model:'test-model',key:'private-fixture'});
 assert.equal(JSON.stringify(await chat.status()).includes('private-fixture'),false);assert.equal((await readFile(path.join(dataDir,'paper-chat/settings.json'),'utf8')).includes('private-fixture'),false);
 const request={question:'',summary:true};await assert.rejects(chat.ask(id,request),/Enable AI/);assert.equal(calls,0);
 await chat.enable(id,{enabled:true,provider:'openai'});await chat.ask(id,request);await chat.ask(id,request);assert.equal(calls,1);assert.equal((await chat.get(id)).messages.length,2);
 await chat.shutdown();chat=await create();assert.equal((await chat.get(id)).messages.length,2);assert.equal((await chat.status()).hasKey.openai,false);
 await chat.configure({provider:'anthropic',model:'test-model',key:'another-fixture'});assert.equal((await chat.get(id)).enabled,false);await assert.rejects(chat.ask(id,{question:'Explain',summary:false}),/Enable AI/);await chat.clear(id);assert.equal((await chat.get(id)).messages.length,0);await chat.shutdown();
});
test('paper context has bounded excerpts and images require explicit selection',()=>{
 assert.equal(buildPaperContext(cache,paper,'Explain',{page:1}).images.length,0);assert.equal(buildPaperContext(cache,paper,'Explain',{page:1,includeVisuals:true}).images.length,1);
 assert.throws(()=>buildPaperContext(cache,paper,'Explain',{page:1,selection:'secret external text'}),/no longer matches/);
 const long={...cache,pages:[{number:1,paragraphs:['x'.repeat(100000)]},{number:2,paragraphs:['y'.repeat(100000)]}]};const context=buildPaperContext(long,paper,'',{summary:true});assert.equal(context.limited,true);assert.deepEqual(context.pages,[1,2]);assert.ok(context.content.length<91000);
});
test('concurrent generations are rejected and cancellation does not persist a partial conversation',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-chat-cancel-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));let started;const ready=new Promise(r=>started=r);
 const chat=await createPaperChat({dataDir,getPaper:()=>paper,readingCache:{get:async()=>({cache})},codexFactory,apiGenerate:async({signal})=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}});await chat.configure({provider:'openai',model:'test-model',key:'private-fixture'});await chat.enable(id,{enabled:true,provider:'openai'});
 const work=chat.ask(id,{question:'Explain',summary:false});await assert.rejects(chat.ask(id,{question:'Duplicate',summary:false}),/already running/);await ready;chat.cancel(id);await assert.rejects(work,/cancelled/);assert.equal((await chat.get(id)).messages.length,0);await chat.shutdown();
});
test('encrypted API credentials restore without returning their value to the client',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-chat-secret-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));const secretStorage={encrypt:s=>Buffer.from(s).toString('base64'),decrypt:s=>Buffer.from(s,'base64').toString()};const options={dataDir,getPaper:()=>paper,readingCache:{get:async()=>({cache})},codexFactory,secretStorage,apiGenerate:async({key})=>{assert.equal(key,'fixture-only-secret');return 'Answer';}};let chat=await createPaperChat(options);await chat.configure({provider:'openai',model:'test',key:'fixture-only-secret'});await chat.shutdown();chat=await createPaperChat(options);assert.equal((await chat.status()).hasKey.openai,true);assert.ok(!JSON.stringify(await chat.status()).includes('fixture-only-secret'));await chat.enable(id,{enabled:true,provider:'openai'});await chat.ask(id,{question:'Question',summary:false});await chat.configure({provider:'openai',model:'test',removeKey:true});assert.equal((await chat.status()).hasKey.openai,false);await chat.shutdown();
});
test('image page is independent of selected-text page and missing images are explicit',()=>{
 const context=buildPaperContext(cache,paper,'Explain',{page:2,selection:'Methods and limitations.',includeVisuals:true,visualPage:1});assert.equal(context.images[0].page,1);assert.match(context.content,/Selected passage \[p\. 2\]/);
 assert.throws(()=>buildPaperContext(cache,paper,'Explain',{includeVisuals:true,visualPage:2}),/No cached images/);
 assert.throws(()=>buildPaperContext(cache,paper,'Explain',{includeVisuals:true,visualPage:900}),/valid PDF page/);
});
test('figure selection attaches only the chosen crop and its cross-page legend',()=>{
 const figureCache={pages:[{number:1,paragraphs:['Body'],image:'data:image/jpeg;base64,YQ=='},{number:2,paragraphs:['More']}],figures:[{label:'Fig. 2',page:1,captionPage:2,caption:'The complete legend.',crop:{x:.1,y:.1,width:.5,height:.5}}]};let cropped=false;
 const result=buildPaperContext(figureCache,paper,'Explain',{includeVisuals:true,visualId:'figure:0'},(image,crop)=>{cropped=true;assert.equal(crop.width,.5);return 'data:image/jpeg;base64,Yg==';});assert.equal(cropped,true);assert.deepEqual(result.images,[{data:'data:image/jpeg;base64,Yg==',page:1}]);assert.match(result.content,/Selected visual: Fig\. 2/);assert.match(result.content,/Legend \[p\. 2\]: The complete legend/);
 assert.throws(()=>buildPaperContext(figureCache,paper,'Explain',{includeVisuals:true,visualId:'figure:12'}),/unavailable/);
});
test('individual equation selector does not attach other page images',()=>{const result=buildPaperContext(cache,paper,'Explain',{includeVisuals:true,visualId:'equation:1:0'});assert.equal(result.images.length,1);assert.match(result.content,/Selected visual: equation 1 \[p\. 1\]/);});
test('five equations on separate pages have continuous labels and still select their own images',()=>{
 const pages=Array.from({length:10},(_,i)=>({number:i+1,paragraphs:['Paper text'],...(i%2===0?{equations:[{paragraph:0,image:`data:image/jpeg;base64,${Buffer.from(`equation on page ${i+1}`).toString('base64')}`}]}:{})}));
 const visuals=equationVisuals(pages);
 assert.deepEqual(visuals.map(v=>v.label),['Equation 1 · page 1','Equation 2 · page 3','Equation 3 · page 5','Equation 4 · page 7','Equation 5 · page 9']);
 for(const visual of visuals){
  const result=buildPaperContext({pages,figures:[]},paper,'Explain',{includeVisuals:true,visualId:visual.id});
  assert.equal(visual.id,`equation:${visual.page}:0`);
  assert.deepEqual(result.images,[{data:pages[visual.page-1].equations[0].image,page:visual.page}]);
  assert.ok(result.content.includes(`Selected visual: equation ${visual.number} [p. ${visual.page}].`));
 }
});
test('numbering includes multiple equations per page without mutating cached data',()=>{
 const pages=[{number:1},{number:2,equations:[{paragraph:0},{paragraph:2}]},{number:3,equations:[]},{number:4,equations:[{paragraph:1}]}];
 const before=structuredClone(pages);
 assert.deepEqual(equationVisuals(pages).map(v=>[v.id,v.number]),[['equation:2:0',1],['equation:2:1',2],['equation:4:0',3]]);
 assert.deepEqual(pages,before);assert.deepEqual(equationVisuals([]),[]);
});
test('followups send bounded history with one provider call while preserving complete local messages',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'folio-chat-budget-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));let calls=0;
 const answer='Detailed discussion. '.repeat(1000);
 const chat=await createPaperChat({dataDir,getPaper:()=>paper,readingCache:{get:async()=>({cache})},codexFactory,apiGenerate:async({messages})=>{
  calls++;assert.ok(messages.length<=5);assert.ok(messages.slice(0,-1).reduce((n,m)=>n+m.content.length,0)<=5800);
  assert.match(messages.at(-1).content,/\[p\. 1\]/);return answer;
 }});
 await chat.configure({provider:'openai',model:'test',key:'fixture'});await chat.enable(id,{enabled:true,provider:'openai'});
 for(let i=0;i<7;i++)await chat.ask(id,{question:`Explain observation ${i}`,summary:false});
 assert.equal(calls,7);const saved=await chat.get(id);assert.equal(saved.messages.length,14);
 assert.ok(saved.messages.filter(m=>m.role==='assistant').every(m=>m.content===answer));
 const disk=JSON.parse(await readFile(path.join(dataDir,'paper-chat',id+'.json'),'utf8'));assert.deepEqual(disk.messages,saved.messages);
 await chat.shutdown();
});
