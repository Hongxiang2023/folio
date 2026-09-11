// Requests go only to the provider selected by the user; redirects are rejected.
export function validateModel(model){if(typeof model!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model))throw new Error('Enter a valid model ID.');return model;}
export function validateChat(messages,images=[]){
 if(!Array.isArray(messages)||!messages.length||messages.length>40||messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>120000)||messages.at(-1).role!=='user')throw new Error('Invalid conversation.');
 if(!Array.isArray(images)||images.length>3||images.some(i=>!Number.isInteger(i.page)||i.page<1||typeof i.data!=='string'||i.data.length>4000000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(i.data)))throw new Error('Invalid paper image.');
}
export async function generateAPI({provider,key,model,system,messages,images=[],signal,fetchImpl=fetch,timeoutMs=120000}){
 validateModel(model);validateChat(messages,images);
 if(!['openai','anthropic'].includes(provider))throw new Error('Unknown AI provider.');
 if(typeof key!=='string'||!key.trim()||/[\r\n]/.test(key))throw new Error('Add an API key in settings.');
 const last=messages.length-1;
 const input=messages.map((m,i)=>({...m,content:i===last&&images.length?(provider==='openai'?[{type:'input_text',text:m.content},...images.flatMap(image=>[{type:'input_text',text:`Paper image, page ${image.page}`},{type:'input_image',image_url:image.data,detail:'high'}])]:[{type:'text',text:m.content},...images.flatMap(image=>[{type:'text',text:`Paper image, page ${image.page}`},{type:'image',source:{type:'base64',media_type:'image/jpeg',data:image.data.split(',')[1]}}])]):m.content}));
 const url=provider==='openai'?'https://api.openai.com/v1/responses':'https://api.anthropic.com/v1/messages';
 const headers={'content-type':'application/json',...(provider==='openai'?{authorization:`Bearer ${key}`}:{'x-api-key':key,'anthropic-version':'2023-06-01'})};
 const body=provider==='openai'?{model,instructions:system,input,store:false,max_output_tokens:5000}:{model,system,messages:input,max_tokens:5000};
 const combined=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeoutMs)]);
 let response;
 try{response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:combined});}catch{throw new Error(combined.aborted?'AI request cancelled or timed out.':'Could not reach the AI provider.');}
 if(!response.ok)throw new Error(response.status===401||response.status===403?'The provider rejected this key or model access.':response.status===429?'The provider limit was reached. Check your plan or API balance.':`AI provider request failed (HTTP ${response.status}).`);
 let result;try{result=await response.json();}catch{throw new Error('The AI provider returned an unreadable response.');}
 const text=provider==='openai'?(result.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n'):(result.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
 if(!text.trim())throw new Error('The AI provider did not return an answer.');return text.slice(0,100000);
}
