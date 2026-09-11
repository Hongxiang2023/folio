import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const layout=data(compile(await readFile(new URL('../src/reading-layout.ts',import.meta.url),'utf8')));
const code=compile(await readFile(new URL('../src/reading-sections.ts',import.meta.url),'utf8')).replace("from './reading-layout'",`from '${layout}'`);
const {organizeSections,canonicalSection,readingProfile,analyzeJournalPage,filterReadingItems}=await import(data(code));
const page=(number,values)=>({number,paragraphs:values.map(v=>v[0]),headings:values.flatMap(([title,level],paragraph)=>level?[{title,level,paragraph}]:[])});
test('authors are removed and Results, Discussion and Methods retain subsections across pages',()=>{
 const result=organizeSections([
  page(1,[['Ada Lovelace; Grace Hopper',2],['Abstract',1],['An abstract.',0],['Introduction',1],['Background themes',2],['Some context.',0]]),
  page(2,[['Results',1],['First finding',2],['Evidence.',0],['Second finding',2],['More evidence.',0],['Discussion',1],['Interpretation',2],['Interpretation text.',0]]),
  page(3,[['Methods',1],['Sample collection',2],['Methods content.',0],['References',1],['1. Author, A. Journal (2020).',0]]),
  page(4,[['References',1],['2. Author, B. Journal (2021).',0]])
 ],{authors:'Ada Lovelace; Grace Hopper'});
 const headings=result.flatMap(p=>p.headings);
 assert.deepEqual(headings.map(h=>h.title),['Abstract','Introduction','Results','First finding','Second finding','Discussion','Interpretation','Methods','Sample collection','References']);
 assert.ok(!result[0].paragraphs.join(' ').includes('Lovelace'));assert.ok(result[2].paragraphs.includes('Sample collection'));
});
test('Nature infers Results and References without multiplying later bibliographies',()=>{
 const p1=page(1,[['Introduction',1],['Context.',0]]);
 const result=organizeSections([p1,page(2,[['Spatially constrained states',2],['Evidence.',0],['Discussion',1],['Discussion body.',0],['Online content',2],['1. Jackson, H. W. et al. A result (2020).',0]]),page(3,[['Methods',1],['Data availability',1],['1. Author, A. Another result (2021).',0]])],{journal:'Nature'});
 const headings=result.flatMap(p=>p.headings);assert.deepEqual(headings.map(h=>h.title),['Introduction','Results','Spatially constrained states','Discussion','References','Methods','Data availability']);
 assert.ok(headings.find(h=>h.title==='Results').synthetic);assert.ok(headings.find(h=>h.title==='References').synthetic);
});
test('common section aliases normalize and structured abstracts stay one section',()=>{
 assert.equal(canonicalSection('STAR★METHODS'),'Methods');assert.equal(canonicalSection('References and Notes'),'References');assert.equal(readingProfile({journal:'Nature Methods'}),'nature');assert.equal(readingProfile({journal:'Unknown journal'}),'general');
 const result=organizeSections([page(1,[['Abstract',1],['Methods',1],['Abstract methodology.',0],['Results',1],['Abstract findings.',0],['Introduction',1],['Context.',0]]),page(2,[['Results',1],['Detailed findings.',0]])]);
 assert.deepEqual(result.flatMap(p=>p.headings).map(h=>h.title),['Abstract','Introduction','Results']);
});
test('Nature first-page profile keeps a short abstract ending and excludes author typography',()=>{
 const items=[];const item=(str,x,y,height,fontName)=>({str,transform:[1,0,0,1,x,y],width:250,height,fontName});
 items.push(item('Ada Lovelace and Grace Hopper',217,760,9.25,'authors'));
 for(let n=0;n<4;n++)items.push(item('This abstract describes the scientific work and its important findings in detail.',217,700-n*12,10,'prose'));
 items.push(item('github.io/tool).',217,652,10,'prose'));
 for(let n=0;n<5;n++){items.push(item('Introduction body discusses the current scientific evidence and unresolved questions.',40,580-n*11,8.25,'prose'));items.push(item('Additional introductory context continues within the other column of the article.',306,580-n*11,8.25,'prose'));}
 const result=analyzeJournalPage(items,595,{authors:{fontName:'GraphikNaturel-Semibold'},prose:{fontName:'HardingText-Regular'}},1,{journal:'Nature Methods'});
 assert.ok(!result.paragraphs.join(' ').includes('Lovelace'));
 const intro=result.headings.find(h=>h.title==='Introduction');assert.match(result.paragraphs[intro.paragraph],/^Introduction body/);assert.match(result.paragraphs.slice(0,intro.paragraph).join(' '),/github.io\/tool/);
});
test('preprint stamps and known running titles are removed without deleting body prose',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:300,height:8,fontName:'regular'});
 const items=[item('bioRxiv preprint doi: https://doi.org/10.1101/2024.01.01.12345 ; this version posted October 29, 2024.',54,780),item('(which was not certified by peer review) is the author/funder, who has granted bioRxiv a license to display the preprint in perpetuity. It is made',54,772),item('available under a',202,764),item('CC-BY-NC-ND 4.0 International license',263,764),item('.',403,764),item('A preprint about cells',155,738),item('We compared bioRxiv preprints and copyright policies in our analysis.',54,710),item('Scientific evidence remains near the bottom of the page.',54,77),item('2',296,52)];
 const result=analyzeJournalPage(items,612,{},2,{title:'A preprint about cells'},792).paragraphs.join(' ');
 assert.doesNotMatch(result,/version posted|license to display|available under|A preprint about cells/);
 assert.match(result,/compared bioRxiv preprints and copyright policies/);assert.match(result,/Scientific evidence remains/);assert.doesNotMatch(result,/\b2\b/);
 const unknown=analyzeJournalPage([item('available under a CC-BY license.',54,764),item('A preprint about cells',54,738)],612,{},1,{},792).paragraphs.join(' ');
 assert.match(unknown,/available under/);assert.match(unknown,/A preprint about cells/);
});
test('numbered conference sections and appendices retain hierarchy without promoting lists',()=>{
 const result=organizeSections([page(1,[['Abstract',1],['Summary.',0],['1. Introduction',1],['1. A prose contribution.',0]]),page(2,[['2. Background and Related Work',2],['2.1. Large Language Models',2],['Context.',0],['2.2. Single-Cell Foundation Models',2],['Details.',0],['3. Cell2Sentence',2],['3.1. Representation',2],['Details.',0]]),page(3,[['References',1],['1. Smith et al. Some work.',0],['A. Method Details',2],['A.1. Datasets',2],['Details.',0]])]);
 assert.deepEqual(result.flatMap(p=>p.headings).map(h=>[h.title,h.level]),[['Abstract',1],['Introduction',1],['2. Background and Related Work',1],['2.1. Large Language Models',2],['2.2. Single-Cell Foundation Models',2],['3. Cell2Sentence',1],['3.1. Representation',2],['References',1],['A. Method Details',1],['A.1. Datasets',2]]);
});
test('inset conference abstract continues across columns before affiliations',()=>{
 const item=(str,x,y,height=10)=>({str,transform:[1,0,0,1,x,y],width:210,height,fontName:'regular'});
 const items=[item('A paper about scientific models',70,700,16),item('Abstract',150,570,12),item('We describe a scientific model with useful properties',75,550),item('and evaluate its predictions with experimental evidence',75,538),item('to establish performance across diverse biological',75,526),item('applications.',327,570),item('Equal contribution',65,505,9),item('Department of Biology at Example University',55,493,9),item('Correspondence to: Ada Lovelace and Grace Hopper.',55,481,9),item('1. Introduction',307,537,12),item('The scientific body starts here with relevant context.',307,515),item('It continues to describe evidence and experiments.',307,503)];
 const analyzed=analyzeJournalPage(items,612,{},1,{},792);
 const result=organizeSections([{number:1,...analyzed}],{authors:'Ada Lovelace; Grace Hopper'})[0];
 const a=result.headings.find(h=>h.title==='Abstract'),i=result.headings.find(h=>h.title==='Introduction');
 const abstract=result.paragraphs.slice(a.paragraph,i.paragraph).join(' ');
 assert.match(abstract,/diverse biological applications\./);assert.doesNotMatch(abstract,/Equal contribution|Department|Correspondence/);
 assert.doesNotMatch(result.paragraphs.join(' '),/Equal contribution|Department of Biology|Correspondence to/);
});
test('front matter author matching preserves scientific prose that mentions authors',()=>{
 const prose='Ada Lovelace and Grace Hopper developed a scientific method that we evaluate across multiple experimental conditions to identify its strengths and limitations.';
 const result=organizeSections([page(1,[['Abstract',1],[prose,0],['Introduction',1]])],{authors:'Ada Lovelace; Grace Hopper'});
 assert.ok(result[0].paragraphs.includes(prose));
});

test('general first-page metadata removal preserves scientific notes and later references',()=>{
 const affiliation='*Equal contribution †Co-corresponding authors ¹Department of Biology, Example University, USA. Correspondence to: Ada <ada@example.edu>.';
 const proceedings='Proceedings of the 41 st International Conference on Machine Learning, Vienna, Austria. PMLR 235, 2024. Copyright 2024 by the author(s).';
 const scientific='¹The contribution of each cell was normalized before fitting the model.';
 const body='We compared proceedings of conferences and university research to assess publication bias.';
 const result=organizeSections([page(1,[['Introduction',1],[body,0],[scientific,0],[affiliation,0],[proceedings,0],['²Department of Chemistry, Another University, London, UK.',0],['Correspondence to: Example Author <author@example.org>.',0],['Methods',1],['We retained the scientific details.',0]]),page(2,[[proceedings,0],[affiliation,0]])]);
 assert.deepEqual(result[0].paragraphs,['Introduction',body,scientific,'Methods','We retained the scientific details.']);
 assert.equal(result[0].headings.find(h=>h.title==='Methods').paragraph,3);
 assert.deepEqual(result[1].paragraphs,[proceedings,affiliation]);
});

test('journal mastheads and footers are removed only as complete known-journal margin lines',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:200,height:8,fontName:'regular'});
 for(const journal of ['Nature Biotechnology','PLOS ONE','Journal of Experimental Biology']){
  const items=[item(journal,40,21),item(journal,40,765),item('2',540,21),item(journal,40,500),item(`We published the comparison in ${journal}.`,40,35),item(`${journal} 12, 123 (2024).`,40,52),item('Scientific text remains in this manuscript.',40,480)];
  const result=analyzeJournalPage(items,600,{},2,{journal},800).paragraphs.join(' ');
  assert.equal(result.split(journal).length-1,3);assert.match(result,/We published/);assert.match(result,/12, 123 \(2024\)/);assert.match(result,/Scientific text/);
  const unknown=analyzeJournalPage([item(journal,40,21)],600,{},2,{},800).paragraphs.join(' ');assert.equal(unknown,journal);
 }
});

test('article opening after a graphical cover excludes metadata above the explicit abstract only',()=>{
 const item=(str,x,y,height=10)=>({str,transform:[1,0,0,1,x,y],width:250,height,fontName:'regular'});
 const items=[item('A spatial study of cells',40,700,18),item('Authors at the Department of Biology, Example University',40,660),item('SUMMARY',40,500),item('Our study compares multiple scientific approaches.',40,480),item('INTRODUCTION',40,400),item('Scientific prose remains available for reading.',40,380)];
 const context={title:'A spatial study of cells',journal:'Cell'};
 assert.deepEqual(filterReadingItems(items,600,{},context,800,2).map(i=>i.str),items.slice(2).map(i=>i.str));
 assert.equal(filterReadingItems(items,600,{},context,800,3).length,items.length);
 assert.equal(filterReadingItems(items,600,{}, {...context,title:'A different title'},800,2).length,items.length);
});
test('graphical cover retains highlights and brief while excluding contacts and embedded diagram labels',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:180,height:10,fontName:'regular'});
 const items=[item('A spatial study',40,700),item('Graphical abstract',40,640),item('Embedded diagram label',40,590),item('Highlights',40,300),item('A scientific highlight.',40,280),item('Authors',350,640),item('Example author',350,610),item('Correspondence',350,570),item('author@example.edu',350,550),item('In brief',350,450),item('A scientific summary.',350,430)];
 const clean=filterReadingItems(items,600,{}, {},800,1).map(i=>i.str);
 assert.deepEqual(clean,['A spatial study','Highlights','A scientific highlight.','In brief','A scientific summary.']);
 assert.equal(filterReadingItems(items,600,{}, {},800,2).length,items.length);
 const footer=[item('Example et al., 2026, Cell 189, 1–19',40,71),item('October 29, 2026 © 2026 The Author(s). Published by Elsevier Inc.',40,61),item('https://doi.org/10.1016/j.cell.example',40,51),item('ll',500,51)];
 assert.deepEqual(filterReadingItems([...items,...footer],600,{}, {journal:'Cell',doi:'10.1016/j.cell.example'},800,1).map(i=>i.str),clean);
});
test('Cell publisher strips matched margin furniture but retains scientific prose and citation-like body text',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:180,height:9,fontName:'regular'});
 const context={journal:'Cell',doi:'10.1016/j.cell.example'};
 const items=[item('Please cite this article in press as: Example et al., A study, Cell (2026),',40,780),item('https://doi.org/10.1016/j.cell.example',40,768),item('ll',40,720),item('OPEN ACCESS',40,708),item('Resource',450,710),item('Resource availability is discussed below.',40,500),item('Cell 189, 1–19, October 29, 2026',40,22),item('This is an open access article under the CC BY license (https://example.org).',40,12),item('Cell 189, 1–19, October 29, 2026',40,80),item('We analyzed cell access to resources.',40,45)];
 const clean=filterReadingItems(items,600,{},context,800,3).map(i=>i.str);
 assert.deepEqual(clean,items.slice(5,6).concat(items.slice(8)).map(i=>i.str));
 const unknown=filterReadingItems(items.slice(2),600,{}, {},800,3).map(i=>i.str);
 assert.ok(unknown.includes('OPEN ACCESS'));assert.ok(unknown.includes(items[6].str));
});

test('Science running labels and dated volume footers remove printed page numbers without touching body or references',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:160,height:9,fontName:'regular'});
 for(const reversed of [false,true]){
  const parts=['27 JUNE 2003','VOL 300','SCIENCE','www.sciencemag.org'];if(reversed)parts.reverse();
  const items=[item('R E S E A R C H A R T I C L E S',40,730),...parts.map((s,n)=>item(s,100+n*100,17)),item('2062',30,17),item('Scientific body text continues near the bottom.',400,42),item('Research articles were included in this experiment.',40,710),item('A. Example, Science 300, 2062 (2003).',40,52),item('SCIENCE',40,500)];
  const expected=items.slice(6).map(i=>i.str);
  assert.deepEqual(filterReadingItems(items,612,{}, {journal:'Science'},792,2).map(i=>i.str),expected);
  assert.deepEqual(filterReadingItems(items,612,{}, {doi:'10.1126/science.1234567'},792,2).map(i=>i.str),expected);
  assert.equal(filterReadingItems(items,612,{}, {journal:'Unknown'},792,2).length,items.length);
 }
});

test('PLOS combined title masthead and DOI publication footer require matching metadata',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:160,height:9,fontName:'regular'});
 const context={title:'A scientific study of cells',journal:'PLOS Computational Biology',doi:'10.1371/journal.pcbi.example'};
 const items=[item('PLOS COMPUTATIONAL BIOLOGY',35,746),item(context.title,290,746),item(`PLOS Computational Biology | https://doi.org/${context.doi}`,36,36),item('July 12, 2024',300,36),item('2 / 21',555,36),item('Scientific body text.',200,710),item('Example et al., PLOS Computational Biology (2024).',200,52)];
 assert.deepEqual(filterReadingItems(items,612,{},context,792,2).map(i=>i.str),items.slice(5).map(i=>i.str));
 assert.equal(filterReadingItems(items,612,{}, {...context,title:'Different',doi:'10.1371/journal.pcbi.other'},792,2).length,items.length);
});
test('PLOS white production marker signature is confined to repeated first-page sidebar items',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:52,height:10,fontName:'marker'});
 const context={journal:'PLOS Computational Biology'},styles={marker:{fontName:'MinionPro-Regular'}};
 const markers=Array.from({length:5},(_,n)=>item('a1111111111',36,542-n*11.5));
 const body=[item('a1111111111',200,542),item('A scientific identifier a1111111111 is retained.',200,510)];
 assert.deepEqual(filterReadingItems([...markers,...body],612,styles,context,792,1),body);
 for(const n of [2,3])assert.equal(filterReadingItems([...markers,...body],612,styles,context,792,n).length,7);
 assert.equal(filterReadingItems([...markers,...body],612,styles,{},792,1).length,7);
 assert.equal(filterReadingItems([markers[0],...body],612,styles,context,792,1).length,3);
});

test('modern Science furniture uses thematic header, dated article footer and rotated publisher download signatures',()=>{
 const item=(str,x,y)=>({str,transform:[8,0,0,8,x,y],width:160,height:8,fontName:'regular'});
 const vertical={...item('Downloaded from https://www.science.org on April 21, 2022',566,377),transform:[0,-8,8,0,566,377]};
 const items=[item('RESEA RCH | C O M P L E T IN G A S C I E N T I F I C P R O J E C T',200,730),item('Example et al., Science 376, 44–53 (2022)',36,17),item('1 April 2022',200,17),item('2 of 10',530,17),vertical,item(vertical.str,36,377),item('Example et al., Science 376, 44–53 (2022)',36,80),item('Scientific prose at the top remains.',400,704)];
 assert.deepEqual(filterReadingItems(items,594,{}, {journal:'Science'},756,2).map(i=>i.str),items.slice(5).map(i=>i.str));
 assert.equal(filterReadingItems(items,594,{}, {},756,2).length,items.length);
 const inside={...vertical,transform:[0,-8,8,0,300,377]};assert.ok(filterReadingItems([inside],594,{}, {journal:'Science'},756,2).includes(inside));
});

test('Science inset abstract author block and numbered affiliation strip preserve the adjacent body column',()=>{
 const item=(str,x,y,height=8,width=150,fontName='prose')=>({str,transform:[1,0,0,1,x,y],width,height,fontName});
 const context={journal:'Science',title:'A complete scientific study'};
 const title=item(context.title,36,700,18,340,'title');
 const authors=Array.from({length:6},(_,n)=>[item('Example Author',36+n%2*160,675-Math.floor(n/2)*12,8,100,'author'),item(String(n+1),138+n%2*160,678-Math.floor(n/2)*12,5,6,'author')]).flat();
 const abstract=Array.from({length:4},(_,n)=>item('This wide abstract line explains the scientific experiments and their important findings.',36,610-n*12,8,340));
 const body=[item('The adjacent scientific body is preserved.',395,675,9),item('Scientific context underneath the abstract remains.',36,530,9)];
 const notes=Array.from({length:6},(_,n)=>[item(String(n+1),36,450-n*10+3,4,5,'notes'),item('Department of Biology, Example University, USA.',42,450-n*10,6.5,300,'notes')]).flat();
 notes.push(item('*Corresponding author. Email: author@example.edu',36,380,6,330,'notes'));
 const all=[title,...authors,...abstract,...body,...notes];
 assert.deepEqual(filterReadingItems(all,600,{},context,792,1),[...abstract,...body]);
 assert.equal(filterReadingItems(all,600,{},context,792,2).length,all.length);
 assert.equal(filterReadingItems(all,600,{}, {...context,title:'Different title'},792,1).length,all.length);
 const withoutMarkers=all.filter(i=>!/^\d+$/.test(i.str));
 assert.equal(filterReadingItems(withoutMarkers,600,{},context,792,1).length,withoutMarkers.length);
});

test('arXiv rotated version stamps are removed without suppressing horizontal references or interior labels',()=>{
 const stamp={str:'arXiv:1706.12345v7 [cs.CL] 2 Aug 2023',transform:[0,20,-20,0,32,237],width:341,height:20};
 const horizontal={...stamp,transform:[10,0,0,10,32,237]},interior={...stamp,transform:[0,20,-20,0,250,237]};
 const body={str:'Scientific body remains.',transform:[10,0,0,10,100,600],width:300,height:10};
 assert.deepEqual(filterReadingItems([stamp,horizontal,interior,body],612,{}, {},792,1),[horizontal,interior,body]);
});
test('matched title and institution email mark conference front matter without requiring university affiliations',()=>{
 const item=(str,x,y)=>({str,transform:[10,0,0,10,x,y],width:250,height:10});
 const items=[item('A paper about computer vision',100,700),item('Example Research',100,650),item('{first, second}',100,630),item('@example.com',350,630),item('Abstract',40,550),item('We describe a scientific computer vision method.',40,530),item('1. Introduction',40,450)];
 assert.deepEqual(filterReadingItems(items,612,{}, {title:'A paper about computer vision'},792,1),items.slice(4));
 assert.equal(filterReadingItems(items,612,{}, {title:'Different paper'},792,1).length,items.length);
});
test('first-page conference contribution and publication notes leave scientific footnotes intact',()=>{
 const metadata=['∗Equal contribution. Listing order is random. The authors jointly developed this method.','†Work performed while at Example Research. ‡Work performed while at Another Research Center.','31st Conference on Neural Information Processing Systems (NIPS 2017), Long Beach, CA, USA.'];
 const scientific=['∗The contribution of each feature was normalized.','Work performed while at higher temperature improves the reaction rate.','⁴The variance of the dot product follows from independence.'];
 const result=organizeSections([page(1,[['Abstract',1],...metadata.map(s=>[s,0]),...scientific.map(s=>[s,0])]),page(2,metadata.map(s=>[s,0]))]);
 assert.deepEqual(result[0].paragraphs,['Abstract',...scientific]);assert.deepEqual(result[1].paragraphs,metadata);
});

test('Genome Biology dated mastheads and printed page labels require the publisher signature in the upper margin',()=>{
 const item=(str,x,y)=>({str,transform:[8,0,0,8,x,y],width:170,height:8});
 const items=[item('Example et al. Genome Biology (2025) 26:334',56,750),item('Page 2 of 39',500,746),item('https://doi.org/10.1186/s13059-example',56,740),item('Example et al. Genome Biology (2025) 26:334',56,500),item('A scientific comparison remains.',56,710)];
 for(const journal of ['Genome Biology','Genome Biol'])assert.deepEqual(filterReadingItems(items,595,{}, {journal,doi:'10.1186/s13059-example'},790,2),items.slice(3));
 assert.equal(filterReadingItems(items,595,{}, {},790,2).length,items.length);
});
test('Genome first-page contact sidebar and license block stay separate from the scientific abstract and footnotes',()=>{
 const item=(str,x,y,height=10,width=200)=>({str,transform:[height,0,0,height,x,y],width,height});
 const context={title:'A study of biological models',journal:'Genome Biol'};
 const metadata=[item(context.title,56,650,24,350),item('Example Author',56,600,11,100),item('1',160,604,7,5),item('Second Author',175,600,11,100),item('2',278,604,7,5)];
 const body=[item('Abstract',185,550),item('A scientific abstract about computational biology.',185,530,10,350),item('Scientific body content remains available.',185,300,10,350),item('A scientific footnote remains available.',185,220,7,330)];
 const sidebar=[item('*Correspondence:',56,549,7.5,100),item('author@example.org',56,539,7.5,100),item('Department of Biology',56,525,7.5,110),item('Example University',56,515,7.5,100)];
 const license=[item('© The Author(s) 2025.',180,135,7,100),item('Open Access This article uses a Creative Commons license.',180,126,7,350),item('The license permits use with attribution.',180,117,7,350)];
 assert.deepEqual(filterReadingItems([...metadata,...body,...sidebar,...license],595,{},context,790,1),body);
 assert.equal(filterReadingItems([...body,...sidebar,...license],595,{},context,790,2).length,body.length+sidebar.length+license.length);
});

test('legacy Nature Communications keeps the inset abstract continuous and excludes affiliations',()=>{
 const item=(str,x,y,height=10,fontName='prose',width=330)=>({str,transform:[height,0,0,height,x,y],width,height,fontName});
 const abstract=Array.from({length:5},(_,n)=>item('This abstract describes the scientific findings and the biological heterogeneity of ageing.',217,480-n*14));
 abstract.push(item('A short ending.',217,410));
 const body=Array.from({length:5},(_,n)=>[item('The introduction presents the scientific context and remaining questions.',40,350-n*11,8.2,'prose',250),item('Additional evidence motivates the approach and explains the study design.',306,350-n*11,8.2,'prose',250)]).flat();
 const mark={...item('1234567890():,;',11,455,5,'sans',35),transform:[0,5,-5,0,11,455]};
 const items=[item('Article',40,688,10,'sans',31),item('https://doi.org/10.1038/s41467-024-51833-5',400,688,8,'sans',160),item('Authors and collaborators',217,530,9,'sans'),...abstract,mark,...body,item('Department of Biology, University affiliation.',40,100,7,'sans'),item('Nature Communications | (2024)15:7567',40,21,8,'sans'),item('1',558,21,8,'sans',4)];
 const styles={prose:{fontName:'ABCDEF+AdvOTdd63dae3'},sans:{fontName:'ABCDEF+AdvOT13119950'}};
 for(const context of [{journal:'Nature Communications'},{doi:'10.1038/s41467-024-51833-5'}]){
  const result=analyzeJournalPage(items,595,styles,1,context,792);
  assert.equal(result.headings[0].title,'Abstract');
  const intro=result.headings.find(h=>h.title==='Introduction');assert.ok(intro);
  assert.equal(intro.paragraph,1);assert.ok(result.paragraphs[0].endsWith('A short ending.'));
  assert.doesNotMatch(result.paragraphs.join(' '),/1234567890|Authors|Department|Nature Communications|doi.org/);
 }
 const horizontal=item('1234567890():,;',40,300);
 assert.deepEqual(filterReadingItems([horizontal],595,styles,{journal:'Nature Communications'},792,2),[horizontal]);
});

test('encoded AdvOT bold subheadings remain separate from body prose',()=>{
 const item=(str,y,fontName)=>({str,transform:[8,0,0,8,40,y],width:250,height:8,fontName});
 const result=analyzeJournalPage([item('Ageing-related changes in expression',700,'bold'),item('in blood-derived single cells',689,'bold'),item('We collected samples to investigate the effects of ageing.',676,'body'),item('The resulting data support the following observations.',665,'body')],595,{bold:{fontName:'ABCDEF+AdvOT70e1938e'},body:{fontName:'ABCDEF+AdvOTdd63dae3'}},2,{journal:'Nature Communications'},792);
 assert.ok(result.headings.some(h=>h.title==='Ageing-related changes in expression'));
 assert.ok(result.paragraphs.some(p=>p.startsWith('We collected')));
});

test('full STAR Methods stays reachable after an earlier Methods overview',()=>{
 const result=organizeSections([page(1,[['Methods',1],['Overview of the procedures.',0]]),page(2,[['References',1],['1. Author, A. Earlier work (2024).',0]]),page(3,[['STAR+METHODS',1],['Cell type annotation',2],['Detailed experimental procedure.',0]])],{journal:'Cell Reports'});
 assert.ok(result[2].headings.some(h=>h.title==='Methods'&&h.paragraph===0));
 assert.ok(result[2].headings.some(h=>h.title==='Cell type annotation'));
});
