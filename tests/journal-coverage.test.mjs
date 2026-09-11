import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const layout=data(compile(await readFile(new URL('../src/reading-layout.ts',import.meta.url),'utf8')));
const {analyzePage}=await import(layout);
const code=compile(await readFile(new URL('../src/reading-sections.ts',import.meta.url),'utf8')).replace("from './reading-layout'",`from '${layout}'`);
const {canonicalSection,readingProfile,repeatedMarginPatterns,removeRepeatedMargins,filterReadingItems,analyzeJournalPage,organizeSections}=await import(data(code));
const item=(str,x,y,width=200,height=10,fontName='body')=>({str,transform:[height,0,0,height,x,y],width,height,fontName});
const styles={body:{fontName:'Example-Regular'},bold:{fontName:'Example-Bold'}};

test('Nature family names, abbreviations and requested DOI-only metadata select the family without capturing unrelated journals',()=>{
 for(const journal of ['Nature','Nature Computational Science','Nature Cell Biology','Nature Machine Intelligence','Nature Reviews Genetics','Nature Nanotechnology','Nat. Comput. Sci.','Nat Cell Biol','Nat. Mach. Intell.','NCB','NMI'])assert.equal(readingProfile({journal}),'nature',journal);
 for(const doi of ['10.1038/s43588-025-00001-0','10.1038/s41556-024-00001-0','10.1038/s42256-024-00001-0','10.1038/ncb1234'])assert.equal(readingProfile({doi}),'nature',doi);
 for(const context of [{},{journal:'Nature-inspired Computing'},{journal:'Cell Reports'},{journal:'Science Advances'},{doi:'10.1038/s41433-024-00001-0'}])assert.equal(readingProfile(context),'general');
});

test('learned margins require three pages and preserve the same wording in body prose and a unique page label',()=>{
 const samples=Array.from({length:3},(_,n)=>({width:600,height:800,items:[item(`Journal of Example Research ${n+1}`,40,780,400,8),item('The shared scientific statement remains body prose.',40,400),item(`Unique heading ${String.fromCharCode(65+n)}`,40,765,200,8)]}));
 assert.deepEqual(repeatedMarginPatterns(samples.slice(0,2)),[]);
 const patterns=repeatedMarginPatterns(samples);assert.equal(patterns.length,1);
 const header=item('Journal of Example Research 4',40,780,400,8),body=item('Journal of Example Research 4',40,400,400,8),unique=item('Only this page has this label',40,765,200,8);
 assert.deepEqual(removeRepeatedMargins([header,body,unique],600,800,patterns),[body,unique]);
 const repeatedBody=samples.map(s=>({...s,items:[item('A recurrent scientific sentence.',40,400)]}));
 assert.deepEqual(repeatedMarginPatterns(repeatedBody),[]);
});

test('review subsections remain navigable without inventing Results',()=>{
 const input=()=>[{number:1,paragraphs:['Introduction','Opening context.'],headings:[{paragraph:0,title:'Introduction',level:1}]},{number:2,paragraphs:['Emerging mechanisms','Review evidence.'],headings:[{paragraph:0,title:'Emerging mechanisms',level:2}]}];
 for(const context of [{journal:'Nature Reviews Genetics'},{journal:'Nature Cell Biology',articleType:'review'}]){
  const result=organizeSections(input(),context),headings=result.flatMap(p=>p.headings);
  assert.ok(!headings.some(h=>h.title==='Results'));assert.ok(headings.some(h=>h.title==='Emerging mechanisms'));
  assert.ok(result[1].paragraphs.includes('Review evidence.'));
 }
});

test('Cell Reports full-width SUMMARY retains a short last line ahead of both body columns',()=>{
 const opening=[item('SUMMARY',40,720,100,10,'bold'),...Array.from({length:3},(_,n)=>item(`The abstract explains experiment ${n} and its measured biological outcomes across the entire cohort.`,40,700-n*12,510)),item('This is the final conclusion.',40,664,130),item('INTRODUCTION',40,640,130,10,'bold')];
 const body=Array.from({length:4},(_,n)=>[item(`Left column body sentence ${n} provides detailed scientific context.`,40,620-n*12,240),item(`Right column body sentence ${n} provides the remaining scientific context.`,320,620-n*12,240)]).flat();
 for(const context of [{journal:'Cell Reports'},{journal:'Cell Rep.'},{doi:'10.1016/j.celrep.2025.115001'}]){
  const result=analyzeJournalPage([...opening,...body],600,styles,1,context,800),text=result.paragraphs.join('\n');
  assert.ok(text.indexOf('This is the final conclusion.')<text.indexOf('INTRODUCTION'));
  assert.ok(text.indexOf('Left column body sentence 3')<text.indexOf('Right column body sentence 0'));
  assert.equal((text.match(/final conclusion/g)||[]).length,1);
 }
});

test('Science Advances copyright sidebar requires journal, page, geometry and a complete license signature',()=>{
 const sidebar=[item('Copyright © 2025',510,720,75,7),item('Creative Commons',510,710,75,7),item('license applies',510,700,75,7)];
 const body=item('Creative Commons licenses were compared in this study.',40,500,400);
 for(const context of [{journal:'Science Advances'},{journal:'Sci. Adv.'},{doi:'10.1126/sciadv.adx1234'}]){
  assert.deepEqual(filterReadingItems([...sidebar,body],600,styles,context,800,1),[body]);
  assert.deepEqual(filterReadingItems([...sidebar,body],600,styles,context,800,2),[...sidebar,body]);
 }
 assert.deepEqual(filterReadingItems([...sidebar,body],600,styles,{journal:'Example Journal'},800,1),[...sidebar,body]);
 assert.deepEqual(filterReadingItems(sidebar.slice(0,2),600,styles,{journal:'Science Advances'},800,1),sidebar.slice(0,2));
 const interior=sidebar.map(i=>({...i,transform:[...i.transform.slice(0,4),100,i.transform[5]]}));
 assert.deepEqual(filterReadingItems(interior,600,styles,{journal:'Science Advances'},800,1),interior);
});

const table=()=>[item('Table 1: Selected genes',40,700,250,10),...Array.from({length:4},(_,r)=>[item(`GENE${r}`,40,675-r*12,40,8,'bold'),item('Class',110,675-r*12,35,8),...Array.from({length:3},(_,c)=>item(String(r+c+1),180+c*50,675-r*12,15,8))]).flat()];
test('bold table genes remain text and a following real heading stays navigable',()=>{
 const result=analyzePage([...table(),item('Mechanistic validation',40,590,220,10,'bold'),item('Experiments confirm these observations in additional samples.',40,570,300)],600,styles);
 assert.ok(!result.headings.some(h=>/GENE/.test(h.title)));
 assert.ok(result.headings.some(h=>h.title==='Mechanistic validation'));
 for(let n=0;n<4;n++)assert.ok(result.paragraphs.join(' ').includes(`GENE${n}`));
});

test('a table in the left column does not suppress a genuine heading in the neighboring column',()=>{
 const result=analyzePage([...table(),item('Independent mechanism',350,650,200,8,'bold'),item('This separate column describes a biological mechanism.',350,630,220,8)],600,styles,{columnSplits:[310]});
 assert.ok(result.headings.some(h=>h.title==='Independent mechanism'));
});

test('a wrapped run-in heading absorbs its bold ending without absorbing the regular first sentence',()=>{
 const result=analyzePage([item('Learning interactions across',40,700,240,10,'bold'),item('domains.',40,687,45,10,'bold'),item('In this section we evaluate transfer.',90,687,220),item('Further observations support the result.',40,674,260)],600,styles,{singleColumn:true});
 assert.ok(result.headings.some(h=>h.title==='Learning interactions across domains.'));
 assert.ok(result.paragraphs.some(p=>p.startsWith('In this section we evaluate transfer.')));
 assert.ok(!result.headings.some(h=>h.title.includes('In this section')));
 const separated=analyzePage([item('Learning interactions across',40,700,240,10,'bold'),item('domains.',40,650,45,10,'bold'),item('In this section we evaluate transfer.',90,650,220)],600,styles,{singleColumn:true});
 assert.ok(!separated.headings.some(h=>h.title==='Learning interactions across domains.'));
});

test('an emphasized opening word below a heading is prose, not a wrapped heading ending',()=>{
 const result=analyzePage([item('Mechanistic conclusions',40,700,240,10,'bold'),item('Importantly,',40,687,55,10,'bold'),item('the result also holds in untreated cells.',100,687,230)],600,styles,{singleColumn:true});
 assert.ok(result.headings.some(h=>h.title==='Mechanistic conclusions'));
 assert.ok(!result.headings.some(h=>h.title.includes('Importantly')));
 assert.ok(result.paragraphs.some(p=>p.startsWith('Importantly, the result')));
});

test('a smaller run-in heading remains separate from a preceding heading in the same font',()=>{
 const result=analyzePage([item('Mechanistic validation',40,700,230,12,'bold'),item('Independent cohort.',40,686,120,10,'bold'),item('We replicated it.',165,686,145,10),item('The control groups showed consistent effects.',40,673,280,10)],600,styles,{singleColumn:true});
 assert.ok(result.headings.some(h=>h.title==='Mechanistic validation'));
 assert.ok(result.headings.some(h=>h.title==='Independent cohort'));
 assert.ok(!result.headings.some(h=>h.title.includes('validation Independent')));
 assert.ok(result.paragraphs.some(p=>p.startsWith('We replicated it.')));
});

test('Science Advances bold unlabeled abstract stays one paragraph with a single synthetic Abstract heading',()=>{
 const text=[
  'We studied how changing environmental conditions influence the development of biological communities',
  'using repeated observations across several independent regions and carefully controlled experiments',
  'which allowed us to distinguish the contribution of local environmental factors from inherited traits',
  'and revealed a consistent response that explains the observed changes in community structure over time.'
 ];
 const abstract=text.map((str,n)=>item(str,40,700-n*12,420,10,'abstract'));
 const body=[item('INTRODUCTION',40,630,150,12,'bold'),item('The scientific background provides the context for these observations.',40,608,255,10)];
 const fonts={...styles,abstract:{fontName:'ABCDEF+MyriadPro-Semibold'}};
 const result=analyzeJournalPage([...abstract,...body],600,fonts,1,{journal:'Science Advances'},800);
 assert.equal(result.paragraphs[0],text.join(' '));
 assert.deepEqual(result.headings.filter(h=>h.paragraph===0),[{paragraph:0,title:'Abstract',level:1,synthetic:true}]);
 assert.ok(result.headings.some(h=>h.title==='INTRODUCTION'));
 assert.equal(result.paragraphs.filter(p=>text.some(line=>p.includes(line))).length,1);
});

test('STAR+METHODS canonicalizes and remains a Methods boundary in organized Cell Reports text',()=>{
 assert.equal(canonicalSection('STAR+METHODS'),'Methods');
 const result=analyzeJournalPage([item('STAR+METHODS',40,700,200,11,'bold'),item('Samples were prepared using the following protocol.',40,680,280)],600,styles,3,{journal:'Cell Reports'},800);
 const organized=organizeSections([{number:3,...result}],{journal:'Cell Reports'});
 assert.ok(organized[0].headings.some(h=>h.title==='Methods'&&h.paragraph===0));
 assert.ok(organized[0].paragraphs.includes('Samples were prepared using the following protocol.'));
 assert.equal(canonicalSection('STAR+METHODS improves reproducibility'),undefined);
});
