import test from 'node:test';import assert from 'node:assert/strict';
import {generateAPI} from '../server/ai-providers.mjs';
const common={key:'secret-test-key',model:'test-model',system:'Use paper only',messages:[{role:'user',content:'Explain'}]};
test('OpenAI posts only supplied context to fixed endpoint and rejects redirects',async()=>{
 let sent;const result=await generateAPI({...common,provider:'openai',images:[{page:3,data:'data:image/jpeg;base64,YQ=='}],fetchImpl:async(url,options)=>{sent={url,...options};return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Answer'}]}]})};}});
 assert.equal(result,'Answer');assert.equal(sent.url,'https://api.openai.com/v1/responses');assert.equal(sent.redirect,'error');const body=JSON.parse(sent.body);assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.equal(body.input[0].content[2].type,'input_image');
});
test('Anthropic formats vision data and extracts only text blocks',async()=>{
 let sent;const result=await generateAPI({...common,provider:'anthropic',images:[{page:1,data:'data:image/jpeg;base64,YQ=='}],fetchImpl:async(url,options)=>{sent={url,...options};return {ok:true,json:async()=>({content:[{type:'text',text:'Answer'},{type:'tool_use',input:{secret:'ignored'}}]})};}});
 assert.equal(result,'Answer');assert.equal(sent.url,'https://api.anthropic.com/v1/messages');assert.equal(JSON.parse(sent.body).messages[0].content[2].source.data,'YQ==');assert.equal(sent.headers['anthropic-version'],'2023-06-01');
});
test('provider errors do not echo remote key-bearing errors',async()=>{
 for(const status of [401,429,500])await assert.rejects(generateAPI({...common,provider:'openai',fetchImpl:async()=>({ok:false,status,json:async()=>({error:common.key})})}),e=>!e.message.includes(common.key));
 await assert.rejects(generateAPI({...common,provider:'openai',fetchImpl:async()=>{throw new Error(common.key);}}),/Could not reach/);
});
test('validates images and models before transport and propagates cancellation',async()=>{
 await assert.rejects(generateAPI({...common,provider:'openai',model:'model\nheader',fetchImpl:()=>assert.fail()}),/model ID/);
 await assert.rejects(generateAPI({...common,provider:'openai',images:[{page:1,data:'https://elsewhere.test/image'}],fetchImpl:()=>assert.fail()}),/paper image/);
 const controller=new AbortController();controller.abort();await assert.rejects(generateAPI({...common,provider:'openai',signal:controller.signal,fetchImpl:async(_,options)=>{assert.ok(options.signal.aborted);throw new Error('aborted');}}),/cancelled/);
});
