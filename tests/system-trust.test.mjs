import test from 'node:test';import assert from 'node:assert/strict';
import configure from '../desktop/system-trust.cjs';
test('desktop trust retains default roots and appends only existing system roots',()=>{
 let installed;const calls=[];
 assert.equal(configure({getCACertificates:type=>{calls.push(type);return type==='default'?['bundled','extra']:['system','bundled'];},setDefaultCACertificates:value=>{installed=value;}}),true);
 assert.deepEqual(calls,['default','system']);assert.deepEqual(installed,['bundled','extra','system']);
});
test('older runtimes and an empty system store leave existing defaults unchanged',()=>{
 assert.equal(configure({}),false);
 assert.equal(configure({getCACertificates:()=>[],setDefaultCACertificates:()=>assert.fail('Must not replace defaults')}),true);
});
