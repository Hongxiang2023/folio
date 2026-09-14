import {spawn} from 'node:child_process';
import {access,mkdir,chmod,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {validateModel,validateChat} from './ai-providers.mjs';

export async function discoverCodex(){
 const candidates=['/Applications/ChatGPT.app/Contents/Resources/codex','/Applications/Codex.app/Contents/Resources/codex',path.join(os.homedir(),'Applications/ChatGPT.app/Contents/Resources/codex'),path.join(os.homedir(),'Applications/Codex.app/Contents/Resources/codex'),...(process.env.PATH||'').split(path.delimiter).filter(Boolean).map(p=>path.join(p,process.platform==='win32'?'codex.exe':'codex'))];
 for(const candidate of candidates){try{await access(candidate,constants.X_OK);return candidate;}catch{}}
 return null;
}
export const CODEX_READING_CONFIG={
 'features.shell_tool':false,'features.unified_exec':false,'features.shell_snapshot':false,
 'features.apps':false,'features.browser_use':false,'features.computer_use':false,
 'features.multi_agent':false,'features.plugins':false,'features.remote_plugin':false,
 'features.hooks':false,'features.code_mode':false,'features.code_mode_host':false,
 'features.image_generation':false,'features.view_image':false,'features.memories':false,
 'features.goals':false,'features.workspace_dependencies':false,'features.skill_search':false,
 'features.skill_mcp_dependency_install':false,'tools.view_image':false,
 'web_search':'disabled','cli_auth_credentials_store':'file','check_for_update_on_startup':false,
 'history.persistence':'none','project_doc_max_bytes':0,'analytics.enabled':false,
};
// macOS enforces these file boundaries for the runtime and any child process.
export function codexSandboxProfile(home,binary){
 const quoted=JSON.stringify;
 const read=[`(literal "/")`,`(subpath "/System")`,`(subpath "/usr/lib")`,`(subpath "/usr/share")`,`(subpath "/dev")`,`(subpath "/private/etc/ssl")`,`(literal "/private/etc/resolv.conf")`,`(literal "/private/etc/hosts")`,`(literal "/private/etc/localtime")`,`(subpath ${quoted(home)})`,`(literal ${quoted(binary)})`];
 const excluded=rules=>`(require-all ${rules.map(rule=>`(require-not ${rule})`).join(' ')})`;
 return `(version 1)(allow default)(deny file-read-data ${excluded(read)})(deny file-write* ${excluded([`(subpath ${quoted(home)})`,`(subpath "/dev")`])})(deny process-exec (require-not (literal ${quoted(binary)})))`;
}
export function createCodexChat({dataDir,executable,spawnImpl=spawn,discover=discoverCodex,platform=process.platform,resolvePath=realpath}){
 const home=path.join(dataDir,'codex-reading'),cwd=path.join(home,'empty-workspace');
 let child,starting,sequence=0,buffer='',active,loginId,answerBusy=false;
 const pending=new Map();
 const send=message=>{if(!child?.stdin.writable)throw new Error('Codex is not running.');child.stdin.write(JSON.stringify(message)+'\n');};
 function fail(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Codex connection closed.'));}pending.clear();active?.reject(new Error('Codex connection closed.'));active=undefined;child=undefined;starting=undefined;}
 function request(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Codex request timed out.'));},timeout);pending.set(id,{resolve,reject,timer});try{send({id,method,params});}catch{clearTimeout(timer);pending.delete(id);reject(new Error('Codex is not running.'));}});}
 function receive(message){
  if(message.id!==undefined&&message.method){send({id:message.id,error:{code:-32601,message:'Refhaven does not provide tools or approvals.'}});return;}
  if(message.id!==undefined){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(new Error('Codex could not complete this request. Check sign-in and model access.')):p.resolve(message.result);}return;}
  const p=message.params||{};
  if(!active||p.threadId!==active.threadId)return;
  if(message.method==='item/completed'&&p.item?.type==='agentMessage')active.text=p.item.text||active.text;
  if(message.method==='item/started'&&p.item&&!['userMessage','agentMessage','reasoning','plan'].includes(p.item.type)){
   active.reject(new Error('Codex attempted a tool action. Reading chat was stopped.'));active=undefined;shutdown();return;
  }
  if(message.method==='turn/completed'){
   const current=active;active=undefined;
   if(p.turn?.status!=='completed'||!current.text.trim())current.reject(new Error('Codex did not complete an answer. Check your account or model access.'));
   else current.resolve(current.text.slice(0,100000));
  }
 }
 async function start(){
  if(starting)return starting;
  starting=(async()=>{
   if(platform!=='darwin')throw new Error('ChatGPT connection currently requires macOS. Use an API key on this platform.');
   const found=executable||await discover();if(!found)throw new Error('Install Codex CLI or the Codex desktop app to connect your ChatGPT account.');
   await mkdir(cwd,{recursive:true,mode:0o700});await chmod(home,0o700);
   const binary=await resolvePath(found),isolatedHome=await resolvePath(home);
   const temporary=path.join(isolatedHome,'tmp');await mkdir(temporary,{recursive:true,mode:0o700});
   // Only Refhaven's login is accessible. Do not inherit account keys, host Codex
   // environment, plugins, proxies or a caller's working-directory instructions.
   const env={PATH:'/usr/bin:/bin',HOME:isolatedHome,CODEX_HOME:isolatedHome,TMPDIR:temporary};
   child=spawnImpl('/usr/bin/sandbox-exec',['-p',codexSandboxProfile(isolatedHome,binary),binary,'app-server','--listen','stdio://',...Object.entries(CODEX_READING_CONFIG).flatMap(([k,v])=>['-c',`${k}=${JSON.stringify(v)}`])],{cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true});
   child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>16*1024*1024){shutdown();return;}let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);try{receive(JSON.parse(line));}catch{}}});
   const current=child;child.stderr.resume();child.on('error',()=>{if(child===current)fail();});child.on('exit',()=>{if(child===current)fail();});
   await request('initialize',{clientInfo:{name:'folio_reading',title:'Refhaven Reading',version:'0.1.0'}});send({method:'initialized',params:{}});
  })();try{await starting;}catch(e){shutdown();throw e;}
 }
 async function status(){
  const installed=!!(executable||await discover());if(!installed)return {installed:false,connected:false};
  if(platform!=='darwin')return {installed:true,supported:false,connected:false,reason:'ChatGPT connection currently requires macOS. Use an API key on this platform.'};
  await start();const result=await request('account/read',{refreshToken:false});
  return {installed:true,supported:true,connected:result.account?.type==='chatgpt',...(result.account?.type==='chatgpt'?{email:result.account.email,plan:result.account.planType}:{})};
 }
 async function login(){await start();if(loginId)await request('account/login/cancel',{loginId}).catch(()=>{});const result=await request('account/login/start',{type:'chatgpt'});const url=new URL(result.authUrl);if(url.protocol!=='https:'||!['auth.openai.com','chatgpt.com'].includes(url.hostname))throw new Error('Codex returned an unexpected login URL.');loginId=result.loginId;return {authUrl:url.href,loginId};}
 async function logout(){await start();if(loginId)await request('account/login/cancel',{loginId}).catch(()=>{});loginId=undefined;await request('account/logout');shutdown();}
 async function answer({model,system,messages,images=[],signal}){
  if(model)validateModel(model);validateChat(messages,images);if(signal?.aborted)throw new Error('AI request cancelled.');
  if(answerBusy)throw new Error('Wait for the current answer before sending another message.');
  answerBusy=true;try{
  await start();
  const result=await request('thread/start',{...(model?{model}:{}),cwd,approvalPolicy:'never',sandbox:'read-only',ephemeral:true,baseInstructions:system+'\nAnswer only from the supplied paper context. Do not use tools or access files, networks, commands, or applications.',config:CODEX_READING_CONFIG});
  const threadId=result.thread.id;
  return await new Promise((resolve,reject)=>{
   const done=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
   const abort=()=>{shutdown();done(reject,new Error('AI request cancelled or timed out.'));};
   const timer=setTimeout(abort,180000);
   active={threadId,text:'',resolve:value=>done(resolve,value),reject:error=>done(reject,error)};
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
   const text=messages.map(m=>`${m.role==='user'?'USER':'ASSISTANT'}:\n${m.content}`).join('\n\n');
   const input=[{type:'text',text},...images.flatMap(image=>[{type:'text',text:`Paper image, page ${image.page}`},{type:'image',url:image.data}])];
   request('turn/start',{threadId,input,sandboxPolicy:{type:'readOnly',networkAccess:false}}).catch(()=>{if(active?.threadId===threadId){active=undefined;done(reject,new Error('Codex could not start an answer.'));}});
  });
  }finally{answerBusy=false;}
 }

 function shutdown(){const old=child;child=undefined;starting=undefined;buffer='';if(old){old.stdin.end();old.kill();}fail();}
 return {status,login,logout,answer,shutdown};
}
