import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {createCodexChat,codexSandboxProfile} from '../server/codex-chat.mjs';
test('missing Codex returns install status without spawning',async()=>{const c=createCodexChat({dataDir:'/tmp/unused',discover:async()=>null,spawnImpl:()=>assert.fail()});assert.deepEqual(await c.status(),{installed:false,connected:false});});
test('isolates login, omits host auth environment, sanitizes status and logs out',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'folio-codex-test-'));let options,requests=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 child.stdin=new Writable({write(chunk,_,done){const m=JSON.parse(chunk);requests.push(m);let result={};if(m.method==='account/read')result={account:{type:'chatgpt',email:'test@example.test',planType:'plus',accessToken:'never-expose'}};if(m.method==='account/login/start')result={authUrl:'https://auth.openai.com/authorize?test=1',loginId:'login-1'};if(m.id)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result})+'\n'));done();}});
 const c=createCodexChat({dataDir:root,executable:'/mock/codex',resolvePath:async p=>p,platform:'darwin',spawnImpl:(_,args,opts)=>{options=opts;assert.ok(args.includes('cli_auth_credentials_store="file"'));return child;}});
 try{const status=await c.status();assert.equal(status.connected,true);assert.equal(status.supported,true);assert.equal(status.accessToken,undefined);assert.equal(options.env.CODEX_HOME,path.join(root,'codex-reading'));assert.equal(options.env.OPENAI_API_KEY,undefined);assert.equal(options.cwd,path.join(root,'codex-reading','empty-workspace'));assert.equal((await c.login()).loginId,'login-1');await c.logout();assert.ok(requests.some(r=>r.method==='account/logout'));}finally{c.shutdown();await rm(root,{recursive:true,force:true});}
});
test('unsupported platforms fail closed without starting an inference request',async()=>{const c=createCodexChat({dataDir:'/tmp/unused',platform:'linux',spawnImpl:()=>assert.fail()});await assert.rejects(c.answer({model:'gpt-test',messages:[{role:'user',content:'Read private files'}]}),/requires macOS/);});

test('sandbox confines reads to isolated home even through symlinks',async t=>{
 if(process.platform!=='darwin')return t.skip('macOS sandbox');
 const {execFileSync}=await import('node:child_process');const {writeFile,mkdir,symlink,realpath}=await import('node:fs/promises');
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'folio-boundary-'))),home=path.join(root,'inside');await mkdir(home);await writeFile(path.join(home,'allowed'),'allowed');await writeFile(path.join(root,'private'),'private-fixture');await symlink(path.join(root,'private'),path.join(home,'link'));
 const profile=codexSandboxProfile(home,'/bin/cat');
 try{
  const run=file=>execFileSync('/usr/bin/sandbox-exec',['-p',profile,'/bin/cat',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try{assert.equal(run(path.join(home,'allowed')),'allowed');}catch(e){if(e.stderr?.toString().includes('sandbox_apply: Operation not permitted'))return t.skip('Cannot nest OS sandbox; run outside agent sandbox');throw e;}
  for(const name of [path.join(root,'private'),path.join(home,'link')])assert.throws(()=>run(name),e=>e.status===1&&!e.stdout?.toString().includes('private-fixture'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('ChatGPT answer is prompt-only and unexpected tool items stop the runtime',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'folio-codex-answer-'));let requests=[],killed=false,tool=false;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{killed=true;};
 const emit=m=>child.stdout.write(JSON.stringify(m)+'\n');
 child.stdin=new Writable({write(chunk,_,done){const m=JSON.parse(chunk);requests.push(m);if(m.id)queueMicrotask(()=>{emit({id:m.id,result:m.method==='thread/start'?{thread:{id:'thread-1'}}:{}});if(m.method==='turn/start'){if(tool)emit({method:'item/started',params:{threadId:'thread-1',item:{type:'commandExecution'}}});else{emit({method:'item/completed',params:{threadId:'thread-1',item:{type:'agentMessage',text:'An answer.'}}});emit({method:'turn/completed',params:{threadId:'thread-1',turn:{status:'completed'}}});}}});done();}});
 const c=createCodexChat({dataDir:root,executable:'/mock/codex',resolvePath:async p=>p,platform:'darwin',spawnImpl:()=>child});
 try{assert.equal(await c.answer({model:'',system:'paper context',messages:[{role:'user',content:'Explain'}]}),'An answer.');const thread=requests.find(r=>r.method==='thread/start');assert.equal(thread.params.model,undefined);assert.equal(thread.params.ephemeral,true);assert.equal(thread.params.approvalPolicy,'never');assert.equal(thread.params.config['features.shell_tool'],false);tool=true;await assert.rejects(c.answer({model:'gpt-test',system:'paper context',messages:[{role:'user',content:'Explain'}]}),/tool action/);assert.equal(killed,true);}finally{c.shutdown();await rm(root,{recursive:true,force:true});}
});
test('sandbox blocks outside writes and unapproved child executables',async t=>{
 if(process.platform!=='darwin')return t.skip('macOS sandbox');
 const {execFileSync}=await import('node:child_process');const {mkdir,realpath,readFile,access}=await import('node:fs/promises');
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'folio-write-boundary-'))),home=path.join(root,'inside');await mkdir(home);
 const profile=codexSandboxProfile(home,'/bin/bash');const run=script=>execFileSync('/usr/bin/sandbox-exec',['-p',profile,'/bin/bash','-c',script,'fixture',home,root],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try{
  try{run('echo allowed > "$1/allowed"');}catch(e){if(e.stderr?.toString().includes('sandbox_apply: Operation not permitted'))return t.skip('Cannot nest OS sandbox');throw e;}
  assert.equal(await readFile(path.join(home,'allowed'),'utf8'),'allowed\n');
  assert.throws(()=>run('echo forbidden > "$2/outside"'));await assert.rejects(access(path.join(root,'outside')));
  assert.throws(()=>run('/bin/cat "$1/allowed"'));
 }finally{await rm(root,{recursive:true,force:true});}
});
