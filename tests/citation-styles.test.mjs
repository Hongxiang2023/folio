import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createCitationStyles,inspectStyle} from '../server/citation-styles.mjs';
import {generateCitations} from '../server/citations.mjs';
const style=(label='Test numeric',extra='',citation='<text variable="citation-number" vertical-align="sup"/>')=>`<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text" ${extra}><info><title>${label}</title><id>http://www.zotero.org/styles/test-numeric</id><rights license="http://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</rights></info><citation><layout>${citation}</layout></citation><bibliography><layout><text variable="title"/></layout></bibliography></style>`;
const dependent=(id,parent,locale='')=>`<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" ${locale?`default-locale="${locale}"`:''}><info><title>${id}</title><id>http://www.zotero.org/styles/${id}</id><link rel="independent-parent" href="http://www.zotero.org/styles/${parent}"/></info></style>`;
const paper={pmid:'12345678',title:'Example article',authors:'Doe, Jane',year:'2025',journal:'J'};
async function temp(t){const root=await mkdtemp(path.join(tmpdir(),'folio-styles-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const response=(body,status=200)=>new Response(body,{status});
test('custom CSL persists locally, formats citations and survives an offline restart',async t=>{
 const dataDir=await temp(t);let calls=0;const fetchImpl=async()=>{calls++;throw Error('offline');};
 let store=await createCitationStyles({dataDir,fetchImpl});const xml=style();const result=await store.import(xml);
 assert.match(result.installedId,/^custom-/);assert.equal(result.styles.length,10);assert.equal(calls,0);
 const generated=generateCitations('(12345678)',[paper],result.installedId,store.options(result.installedId));assert.match(generated.citations[0].replacementHtml,/<sup>1<\/sup>/);
 store=await createCitationStyles({dataDir,fetchImpl});assert.equal(store.list().length,10);assert.equal(store.options(result.installedId).styleXml,xml);assert.equal(calls,0);
 assert.equal((await store.import(xml)).styles.length,10);
});
test('repository catalog search stays local, filters note styles and validates slugs',async t=>{
 const calls=[],store=await createCitationStyles({dataDir:await temp(t),fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');return response(JSON.stringify([{name:'test-numeric',title:'Journal numeric',categories:{format:'numeric'}},{name:'note-style',title:'Journal note',categories:{format:'note'}},{name:'../../bad',title:'Journal bad'}]));}});
 assert.deepEqual(await store.search('Journal'),{styles:[{id:'test-numeric',label:'Journal numeric'}],truncated:false});await store.search('numeric');assert.equal(calls.length,1);assert.equal(calls[0],'https://www.zotero.org/styles-files/styles.json');
 await assert.rejects(store.install('../evil'),/valid repository/);await assert.rejects(store.install('https://elsewhere/style'),/valid repository/);assert.equal(calls.length,1);
});
test('dependent journal styles preserve child identity, parent XML and locale overrides offline',async t=>{
 const dataDir=await temp(t),calls=[];
 const store=await createCitationStyles({dataDir,fetchImpl:async url=>{calls.push(url);if(url.endsWith('/dependent/journal-test.csl'))return response(dependent('journal-test','parent-test','fr-FR'));if(url.endsWith('/journal-test.csl'))return response('',404);if(url.endsWith('/parent-test.csl'))return response(style('Parent','default-locale="en-US"','<text term="and"/>'));if(url.endsWith('/locales-fr-FR.xml'))return response('<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="fr-FR"><terms><term name="and">et</term></terms></locale>');throw Error('Unexpected URL');}});
 const result=await store.install('journal-test');assert.equal(result.installedId,'journal-test');assert.equal(result.styles.at(-1).label,'journal-test');
 assert.match(generateCitations('(12345678)',[paper],'journal-test',store.options('journal-test')).text,/et/);
 const offline=await createCitationStyles({dataDir,fetchImpl:async()=>{throw Error('offline');}});assert.equal(offline.options('journal-test').locale,'fr-FR');
 const files=(await readdir(path.join(dataDir,'citation-styles'))).filter(f=>f.endsWith('.json'));const saved=JSON.parse(await readFile(path.join(dataDir,'citation-styles',files[0]),'utf8'));assert.match(saved.xml,/journal-test/);assert.match(saved.parents[0].xml,/CC BY-SA/);
 assert.ok(calls.every(url=>url.startsWith('https://raw.githubusercontent.com/citation-style-language/')));
});
test('malformed, note, external entity, missing and recursive macro styles are rejected before persistence',async t=>{
 const store=await createCitationStyles({dataDir:await temp(t),fetchImpl:async()=>{throw Error('Must not fetch');}});
 for(const xml of ['<style>',style().replace('class="in-text"','class="note"'),'<!DOCTYPE style SYSTEM "file:///etc/passwd">'+style(),style().replace('<citation>','<macro name="a"><text macro="a"/></macro><citation>'),style().replace('variable="citation-number"','macro="absent"'),dependent('x','p').replace('http://www.zotero.org/styles/p','http://localhost/private')])await assert.rejects(store.import(xml));
 assert.equal(store.list().length,9);
});
test('failed and cyclic parent downloads never leave half-installed styles',async t=>{
 const store=await createCitationStyles({dataDir:await temp(t),fetchImpl:async url=>url.endsWith('/a.csl')?response(dependent('a','b')):response(dependent('b','a'))});
 await assert.rejects(store.install('a'),/cyclic/);assert.equal(store.list().length,9);
});
test('oversized downloads are rejected and separate libraries do not share installed styles',async t=>{
 const one=await createCitationStyles({dataDir:await temp(t),fetchImpl:async()=>response('x'.repeat(1024*1024+1))});await assert.rejects(one.install('large'),/size/);const result=await one.import(style());
 const two=await createCitationStyles({dataDir:await temp(t)});assert.throws(()=>two.options(result.installedId),/installed/);
});
test('acyclic but exponential macro expansion is rejected before rendering',()=>{
 const macros=['<macro name="m0"><text value="x"/></macro>'];
 for(let i=1;i<28;i++)macros.push(`<macro name="m${i}"><text macro="m${i-1}"/><text macro="m${i-1}"/></macro>`);
 const xml=style().replace('<citation>',macros.join('')+'<citation>').replace('variable="citation-number"','macro="m27"');
 assert.throws(()=>inspectStyle(xml),/expansion is too complex/);
});
test('the nearest dependent locale overrides more distant parent defaults',async t=>{
 const store=await createCitationStyles({dataDir:await temp(t),fetchImpl:async url=>{
  if(url.endsWith('/child.csl'))return response(dependent('child','middle'));
  if(url.endsWith('/middle.csl'))return response(dependent('middle','root','fr-FR'));
  if(url.endsWith('/root.csl'))return response(style('Root','default-locale="en-US"','<text term="and"/>'));
  if(url.endsWith('/locales-fr-FR.xml'))return response('<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="fr-FR"><terms><term name="and">et</term></terms></locale>');
  throw Error('Unexpected URL');
 }});
 await store.install('child');assert.equal(store.options('child').locale,'fr-FR');assert.match(generateCitations('(12345678)',[paper],'child',store.options('child')).text,/et/);
});
