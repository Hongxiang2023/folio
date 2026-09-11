import test from 'node:test';
import assert from 'node:assert/strict';
import {compactHistory,selectPaperPassages} from '../server/paper-context.mjs';
import {buildPaperContext} from '../server/paper-chat.mjs';
const paper={title:'Fixture',authors:'A',journal:'J'};
const source=()=>({pages:Array.from({length:30},(_,i)=>({number:i+1,paragraphs:[`Page ${i+1}: `+'Background measurements and routine observations. '.repeat(70)]})),figures:[]});
const size=result=>result.selected.reduce((n,b)=>n+b.text.length,0);

test('focused retrieval reaches late evidence and preserves neighboring qualifications',()=>{
 const cache=source();cache.pages[28].paragraphs=['A qualification: this relationship is observational.','Spatial ecotypes identify recurring cellular neighborhoods.','The estimate depends on sampling density.'];
 const result=selectPaperPassages(cache,'How are spatial ecotypes identified?',{page:1});
 assert.ok(size(result)<=12000);assert.equal(result.limited,true);
 assert.ok(result.selected.some(b=>b.page===29&&b.text.includes('Spatial ecotypes')));
 assert.ok(result.selected.some(b=>b.page===29&&b.text.includes('observational')));
 assert.ok(result.selected.some(b=>b.page===29&&b.text.includes('sampling density')));
 const context=buildPaperContext(cache,paper,'How are spatial ecotypes identified?',{page:1});
 assert.match(context.content,/\[p\. 29\] Spatial ecotypes/);
 assert.match(context.content,/Selected excerpts; not the complete paper/);
});

test('ambiguous followups recover the previous topic while explicit new topics take priority',()=>{
 const cache=source();cache.pages[20].paragraphs=['Spatial ecotypes identify cellular neighborhoods.'];cache.pages[25].paragraphs=['Chemotherapy resistance involves drug efflux.'];
 const history=[{role:'user',content:'Describe spatial ecotypes'},{role:'assistant',content:'They identify neighborhoods [p. 21].'}];
 const followup=selectPaperPassages(cache,'Why?',{history});
 assert.ok(followup.selected.some(b=>b.page===21));
 const fresh=selectPaperPassages(cache,'Describe chemotherapy resistance',{history});
 assert.ok(fresh.selected.some(b=>b.page===26));
 assert.equal(fresh.selected.some(b=>b.page===21),false);
});

test('broad and no-match questions distribute evidence across pages; summaries retain their larger budget',()=>{
 const cache=source();
 const broad=selectPaperPassages(cache,'What are the limitations?');
 assert.ok(size(broad)<=24000);assert.equal(new Set(broad.selected.map(b=>b.page)).size,30);
 const unmatched=selectPaperPassages(cache,'未知概念');assert.ok(size(unmatched)<=12000);assert.equal(new Set(unmatched.selected.map(b=>b.page)).size,30);
 const summary=selectPaperPassages(cache,'Summarize',{summary:true});assert.ok(size(summary)<=90000);assert.ok(size(summary)>size(broad));assert.equal(new Set(summary.selected.map(b=>b.page)).size,30);
});

test('mandatory selection and legend reserve space and duplicate caption is not resent',()=>{
 const cache=source();const selection='Selected observations. '.repeat(200),caption='Selected figure legend. '.repeat(150);
 cache.pages[2].paragraphs.push(selection);cache.pages[4].image='data:image/jpeg;base64,YQ==';cache.figures=[{label:'Fig. 1',page:5,captionPage:6,caption}];
 const options={page:3,selection,visualId:'figure:0',includeVisuals:true};
 const result=selectPaperPassages(cache,'Explain this',options);
 assert.ok(size(result)+selection.length+caption.length<=12000);
 const context=buildPaperContext(cache,paper,'Explain this',options);
 assert.ok(context.content.includes(`Selected passage [p. 3]: ${selection}`));assert.ok(context.content.includes(`Legend [p. 6]: ${caption}`));
 assert.equal(context.content.split(caption).length,2);assert.equal(context.content.split(selection).length,2);
 assert.deepEqual(context.images,[{data:cache.pages[4].image,page:5}]);
});

test('ranking recovers relevant text beyond a partially allocated coverage chunk',()=>{
 const cache={pages:Array.from({length:30},(_,i)=>({number:i+1,paragraphs:[`Page ${i+1}. `+'Context '.repeat(95)+'Important limitations involve bias. '+'Additional observations. '.repeat(30)]})),figures:[]};
 const result=selectPaperPassages(cache,'What are the limitations?');
 assert.ok(result.selected.some(b=>b.text.includes('Important limitations involve bias.')));
 assert.equal(new Set(result.selected.map(b=>b.page)).size,30);assert.ok(size(result)<=24000);
});

test('oversized paragraphs are searchable beyond their beginning and Unicode terms match',()=>{
 const cache={pages:[{number:1,paragraphs:['Background '.repeat(1500)+'βcatenin regulates adhesion. '+'Other observations '.repeat(1500)]}],figures:[]};
 const result=selectPaperPassages(cache,'Describe βcatenin adhesion');
 assert.ok(result.selected.some(b=>b.text.includes('βcatenin regulates adhesion')));assert.ok(size(result)<=12000);assert.equal(result.limited,true);
});

test('recent history is bounded, chronological and does not mutate full saved content',()=>{
 const history=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:`message ${i} `+'x'.repeat(20000)+` ending ${i}`}));
 const before=structuredClone(history),result=compactHistory(history);
 assert.equal(result.length,4);assert.ok(result.reduce((n,m)=>n+m.content.length,0)<=5800);
 result.forEach((m,i)=>{assert.ok(m.content.startsWith(`message ${i+8} `));assert.ok(m.content.endsWith(` ending ${i+8}`));assert.match(m.content,/earlier message shortened/);});
 assert.deepEqual(history,before);assert.deepEqual(compactHistory([]),[]);
});

test('short sources remain complete and long explicitly selected legends are marked incomplete',()=>{
 const cache={pages:[{number:1,paragraphs:['A small source paragraph.'],image:'data:image/jpeg;base64,YQ=='}],figures:[]};
 assert.equal(selectPaperPassages(cache,'Explain').limited,false);
 cache.figures=[{label:'Fig. 1',page:1,caption:'legend '.repeat(3000)}];
 assert.equal(selectPaperPassages(cache,'Explain',{includeVisuals:true,visualId:'figure:0'}).limited,true);
});
