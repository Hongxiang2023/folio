import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/reading-layout.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {pageParagraphs,figureCaptions}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const item=(str,x,y,width=180)=>({str,transform:[1,0,0,1,x,y],width,height:10});
test('two-column text is read down each column and inline figure references are not captions',()=>{
 const items=[];for(let n=0;n<5;n++){items.push(item(`Left column ${n} contains a detailed finding.`,30,700-n*12));items.push(item(`Right column ${n} contains another finding.`,330,700-n*12));}
 const text=pageParagraphs(items,600).join('\n');assert.ok(text.indexOf('Left column 4')<text.indexOf('Right column 0'));
 assert.equal(figureCaptions(['As shown in Fig. 1, this works.'],1).length,0);
 assert.deepEqual(figureCaptions(['Fig. 2 | Results across samples','Extended Data Fig. 3: Further findings'],4).map(f=>f.label),['Fig. 2','Extended Data Fig. 3']);
});
test('empty pages are retained and section boundaries survive',()=>{
 assert.deepEqual(pageParagraphs([],600),[]);
 assert.deepEqual(pageParagraphs([item('Abstract',30,700),item('Some findings are described here.',30,685),item('Results',30,640)],600),['Abstract','Some findings are described here.','Results']);
});
test('narrow Nature columns stay separate and raised citation lists stay inline',()=>{
 const items=[];
 for(let n=0;n<5;n++){items.push({...item(n===0?'Multicellular ecosystems are fundamental units of tissue organiza-':n===1?'tion and key elements of phenotypic variation.':'Further findings within the left column.',39.7,337.6-n*10.75,255.1),height:8.25});items.push({...item(n===1?'multiplexed protein imaging)':'Right column contains a detailed discussion.',306.1,337.6-n*10.75,n===1?106.7:255.1),height:8.25});}
 items.push({...item('1,5,10',412.8,330.35,11.9),height:4.95},{...item(', ignore spatial information.',424.7,326.85,130),height:8.25});
 const paragraphs=pageParagraphs(items,595.3);const text=paragraphs.join('\n');
 assert.match(text,/tissue organization and/);assert.match(text,/imaging\)¹,⁵,¹⁰, ignore/);assert.ok(text.indexOf('Further findings')<text.indexOf('Right column'));assert.ok(!paragraphs.includes('1,5,10'));
});
test('baseline scientific numbers remain unchanged and bold subsections are indexed',async()=>{
 const {analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const result=analyzePage([item('Results',30,720),{...item('Spatially constrained cell states',30,695),fontName:'f2'},item('We measured 10 samples at 37 degrees.',30,680),item('The value was 1.5 and P = 0.02.',30,668)],600,{f2:{fontName:'HardingText-Bold'}});
 assert.deepEqual(result.headings,[{paragraph:0,title:'Results',level:1},{paragraph:1,title:'Spatially constrained cell states',level:2}]);assert.match(result.paragraphs[2],/10 samples at 37 degrees/);assert.match(result.paragraphs[2],/1.5 and P = 0.02/);
});
test('raised scientific exponents are retained without becoming citation markers',()=>{
 const text=pageParagraphs([item('Value 10',30,700,40),{...item('2',70,704,3),height:6},item(' was measured in m',73,700,80),{...item('2',153,704,3),height:6}],600).join(' ');
 assert.match(text,/10² was measured in m²/);
});
test('a raised citation bridges separated baseline clusters before word-wrap repair',()=>{
 const body=(s,x,y,w)=>({...item(s,x,y,w),height:8.25});
 const items=[body('GZMK',39.685,187.1004,31),body('and',77.66,187.1004,13.85),body('FOLR2',92.52,187.1004,23.58),body('in the periphery, respectively',117.098,187.1004,104.936),{...body('6,26–28',222.034,190.6067,17.35),height:4.95},body('. We also identi-',239.384,187.1004,55.419),body('fied genes with previously unknown regional specificity.',39.685,176.3504,255)];
 const result=pageParagraphs(items,595.3);
 assert.equal(result.length,1);assert.equal(result[0],'GZMK and FOLR2 in the periphery, respectively⁶,²⁶⁻²⁸. We also identified genes with previously unknown regional specificity.');
});
const columnFixture=(last='methods, which are either limited',first='in breadth to a modest number of predefined markers',x=306.14)=>{
 const body=(s,x,y,w=255.1)=>({...item(s,x,y,w),height:8.25});
 return [body('A complete preceding paragraph finishes here.',39.685,245,210),body('First, SEs are challenging to profile using existing',48.19,230,246.6),body('existing methods include several different approaches',39.685,219.25),body('and studies have used a variety of established',39.685,208.5),body('techniques to investigate these spatial systems using',39.685,197.75),body(last,39.685,187),body(first,x,337.5,x>307?246.6:255.1),body('(for example, multiplexed protein imaging),',306.14,326.75),body('which provides information about tissue organization.',306.14,316),body('Additional results describe the biological mechanisms.',306.14,305.25),body('These observations informed further experimentation.',306.14,294.5)];
};
test('column flow joins an unfinished full line while preserving a preceding indented paragraph',()=>{
 const paragraphs=pageParagraphs(columnFixture(),595.3);
 assert.equal(paragraphs[0],'A complete preceding paragraph finishes here.');
 assert.match(paragraphs[1],/^First, SEs/);
 assert.match(paragraphs[1],/either limited in breadth/);
 assert.equal(paragraphs.length,2);
});
test('column flow never crosses terminal punctuation, an indent or a section heading',()=>{
 for(const [last,first,x] of [['This is a complete paragraph.','in another independent paragraph we discuss findings',306.14],['methods, which are either limited','in another independent paragraph we discuss findings',314.65],['methods, which are either limited','Results',306.14]]){
  const paragraphs=pageParagraphs(columnFixture(last,first,x),595.3);
  assert.ok(paragraphs.some(p=>p.endsWith(last)));
  assert.ok(paragraphs.some(p=>p.startsWith(first)));
 }
});

test('publisher hint keeps short prose columns separate after figure labels are removed',async()=>{
 const {analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const items=[];for(let n=0;n<3;n++){items.push(item(`Left prose ${n} is a complete sentence.`,30,700-n*12));items.push(item(`Right prose ${n} is a separate sentence.`,330,700-n*12));}
 const text=analyzePage(items,600,{}, {minColumnLines:2}).paragraphs.join('\n');assert.ok(text.indexOf('Left prose 2')<text.indexOf('Right prose 0'));
});

test('unequal-width columns follow their actual gutter and single-column prose stays sequential',()=>{
 const items=[];for(let n=0;n<5;n++){items.push(item(`Left finding ${n} contains a complete detailed statement.`,30,700-n*12,320));items.push(item(`Right finding ${n} contains another complete statement.`,380,700-n*12,190));}
 const result=pageParagraphs(items,600).join(' ');assert.ok(result.indexOf('Left finding 4')<result.indexOf('Right finding 0'));
 const single=pageParagraphs(Array.from({length:5},(_,n)=>item(`Full-width finding ${n} contains a detailed complete statement.`,50,700-n*12,500)),600).join(' ');assert.match(single,/finding 0.*finding 1.*finding 2.*finding 3.*finding 4/);
});
test('TeX and Nimbus medium headings are detected and equation markers never merge with prose',async()=>{
 const {analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 for(const fontName of ['ABCDEF+NimbusRomNo9L-Medi','ABCDEF+CMBX10','ABCDEF+LMRoman10-Bold']){
  const result=analyzePage([{...item('2. Background and Related Work',30,710),fontName:'bold'},item('Ordinary body text provides a complete detailed explanation.',30,690)],600,{bold:{fontName,fontFamily:'serif'}});
  assert.equal(result.headings[0]?.title,'2. Background and Related Work');
 }
 const items=[];for(let n=0;n<5;n++){items.push(item('Left column body contains a complete detailed finding.',30,700-n*12));items.push(item('Right column body contains another detailed finding.',330,700-n*12));}
 items.push({...item('[Folio equation 1]',270,630,140),height:8});
 const result=pageParagraphs(items,600);assert.ok(result.includes('[Folio equation 1]'));assert.equal(result.filter(p=>p.includes('[Folio equation')).length,1);
});

test('paragraph spacing adapts to compact and double-spaced manuscript leading',()=>{
 for(const leading of [12,20]){
  const items=Array.from({length:8},(_,n)=>item(`Line ${n} contains a detailed complete statement.`,30,700-n*leading-(n>=4?leading*.6:0),450));
  const result=pageParagraphs(items,600);assert.equal(result.length,2);assert.match(result[0],/Line 0.*Line 3/);assert.match(result[1],/Line 4.*Line 7/);
 }
});

test('full-width abstract keeps italic and raised runs before two-column body',async()=>{
 const {analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const items=[item('Summary',40,760,65),item('We measured biological processes ',40,735,270),{...item('in situ',311,735,27),fontName:'italic'},item(' across tissue samples.',341,735,220),item('The complete abstract continues with the experimental results.',40,723,510)];
 for(let n=0;n<5;n++){items.push(item(`Left body ${n} contains a detailed complete sentence.`,40,670-n*12,245));items.push(item(`Right body ${n} contains another complete sentence.`,310,670-n*12,245));}
 const result=analyzePage(items,600);const text=result.paragraphs.join(' ');
 assert.match(text,/biological processes in situ across tissue samples/);
 assert.ok(text.indexOf('experimental results')<text.indexOf('Left body 0'));
 assert.ok(text.indexOf('Left body 4')<text.indexOf('Right body 0'));
});

test('three-column journal pages read each column in order without interleaving',()=>{
 const items=[];for(let n=0;n<7;n++)for(const [col,x] of [[0,48],[1,226],[2,404]])items.push(item(`Column ${col} line ${n} contains scientific findings.`,x,710-n*11,164));
 const text=pageParagraphs(items,612).join(' ');
 assert.ok(text.indexOf('Column 0 line 6')<text.indexOf('Column 1 line 0'));
 assert.ok(text.indexOf('Column 1 line 6')<text.indexOf('Column 2 line 0'));
});
test('abstract spanning two of three columns leaves the third column in its reading lane',()=>{
 const items=[item('An abstract across two columns describes the full scientific study.',48,720,340),item('The final abstract sentence contains the key biological conclusion.',48,708,340)];
 for(let n=0;n<8;n++)for(const [col,x] of [[0,48],[1,226],[2,404]])items.push(item(`Column ${col} line ${n} contains scientific findings.`,x,(col===2?720:675)-n*11,164));
 const text=pageParagraphs(items,612).join(' ');assert.ok(text.indexOf('biological conclusion')<text.indexOf('Column 0 line 0'));assert.ok(text.indexOf('Column 1 line 7')<text.indexOf('Column 2 line 0'));
});

test('provided document column splits survive sparse pages and single-column overrides them',async()=>{
 const {readingColumnSplits,analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const items=[item('Left lower scientific sentence.',40,500,150),item('Right upper scientific sentence.',400,700,150)];
 assert.deepEqual(readingColumnSplits(items,600,{columnSplits:[210,390]}),[210,390]);
 assert.deepEqual(readingColumnSplits(items,600,{columnSplits:[210,390],singleColumn:true}),[]);
 assert.match(analyzePage(items,600,{}, {columnSplits:[210,390]}).paragraphs.join(' '),/^Left lower.*Right upper/);
});
test('fragmented justified abstract baseline stays within its established spanning block',async()=>{
 const {analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const items=[item('This abstract starts with a complete scientific description.',40,740,510),item('The following abstract line concludes the scientific explanation.',40,716,510)];
 for(let n=0;n<9;n++)items.push(item(`word${n}`,40+n*57,728,49));
 for(let n=0;n<5;n++){items.push(item(`Left body ${n} contains a complete scientific sentence.`,40,650-n*12,245));items.push(item(`Right body ${n} contains a complete scientific sentence.`,310,650-n*12,245));}
 const text=analyzePage(items,600).paragraphs.join(' ');
 assert.match(text,/description\. word0 word1 word2 word3 word4 word5 word6 word7 word8 The following/);
 assert.ok(text.indexOf('scientific explanation')<text.indexOf('Left body 0'));
});
test('a table spanning the right two columns follows all unrelated left prose',async()=>{
 const {analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const items=[];for(let n=0;n<8;n++)items.push(item(`Left prose ${n} gives scientific background.`,40,710-n*30,160));
 for(let n=0;n<5;n++)items.push(item(`Table explanation ${n} covers both right columns.`,220,710-n*20,330));
 items.push(item('Middle continuation after the table.',220,400,150),item('Right continuation after the table.',400,400,150));
 const text=analyzePage(items,600,{}, {columnSplits:[210,390]}).paragraphs.join(' ');
 assert.ok(text.indexOf('Left prose 7')<text.indexOf('Table explanation 0'));
 assert.ok(text.indexOf('Table explanation 4')<text.indexOf('Middle continuation'));
 assert.ok(text.indexOf('Middle continuation')<text.indexOf('Right continuation'));
});

test('drop capitals attach to the top line of an established indented paragraph',()=>{
 const lines=[{...item('T',35,650,16),height:60},item('he opening sentence begins with a large initial letter.',55,692,145),item('and continues through the following line of prose.',55,680,145),item('before returning to the ordinary paragraph margin.',55,668,145)];
 const text=pageParagraphs(lines,600).join('\n');assert.match(text,/^The opening sentence/);assert.ok(!text.includes(' T'));
});

test('wide labeled tables keep numeric cells in rows above neighboring body columns',()=>{
 const items=[item('Table 1. Comparison of measured outcomes for each sample.',220,700,340)];
 for(let n=0;n<5;n++)items.push(item(`Measurement ${n}`,220,660-n*14,100),item(String(10+n),382,660-n*14,28),item(String(20+n),440,660-n*14,28));
 for(let n=0;n<6;n++)for(const x of [40,220,400])items.push(item(`Body column ${x} line ${n} contains ordinary narrative.`,x,530-n*12,160));
 const paragraphs=pageParagraphs(items,600);assert.ok(paragraphs.includes('Measurement 4 | 14 | 24'));assert.ok(paragraphs.findIndex(p=>p.includes('Measurement 4'))<paragraphs.findIndex(p=>p.includes('Body column 220')));
});

test('citation numbers below a table do not turn adjacent prose columns into table rows',()=>{
 const items=[item('Table 1. Comparison of measured outcomes for each sample.',220,700,340)];
 for(let n=0;n<5;n++)items.push(item(`Measurement ${n}`,220,660-n*14,100),item(String(10+n),382,660-n*14,28),item(String(20+n),440,660-n*14,28));
 items.push(item('Our narrative cites prior sequencing work (',220,530,110),item('16',335,530,8),item(',',344,530,3),item('20',350,530,8),item(') and continues.',360,530,30));
 for(let n=0;n<6;n++)for(const x of [40,220,400])items.push(item(`Body column ${x} line ${n} contains ordinary narrative.`,x,515-n*12,160));
 const paragraphs=pageParagraphs(items,600);assert.ok(!paragraphs.some(p=>p.includes('Our narrative')&&p.includes(' | ')));
});

test('top-level numbered headings retain a distinct level above run-in subheadings',async()=>{
 const {analyzePage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const result=analyzePage([{...item('2. Related Work',30,700),fontName:'bold'},{...item('Residual Representations.',30,680,130),fontName:'bold'},item('Earlier work establishes a useful scientific foundation.',162,680,240)],600,{bold:{bold:true}});
 assert.equal(result.headings[0].level,1);assert.equal(result.headings[0].title,'2. Related Work');
});

test('tiny PDF baseline jitter does not reorder fragments around inline mathematics',()=>{
 const items=[item('sample',30,600,29),item('j',63,600,3),item('. The matrix entries',66,600,84),item('Kij',154,600,11),item('indicate the number of observations.',169,600.0003,125)];
 assert.deepEqual(pageParagraphs(items,600),['sample j. The matrix entries Kij indicate the number of observations.']);
});
