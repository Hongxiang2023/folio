import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const layout=data(compile(await readFile(new URL('../src/reading-layout.ts',import.meta.url),'utf8')));
const code=compile(await readFile(new URL('../src/reading-sections.ts',import.meta.url),'utf8')).replace("from './reading-layout'",`from '${layout}'`);
const {filterReadingItems,analyzeJournalPage}=await import(data(code));
const item=(str,x,y,fontName='body',width=245,height=8.25)=>({str,transform:[1,0,0,1,x,y],fontName,width,height});
const styles={body:{fontName:'HardingText-Regular'},bold:{fontName:'HardingText-Bold'},labels:{fontName:'ABCDEF+HelveticaNeueLTStd-Roman'},panel:{fontName:'ABCDEF+HelveticaNeueLTStd-Blk'},symbol:{fontName:'ABCDEF+SymbolStd'},footer:{fontName:'GraphikNature-Regular'}};
const body=[item('A scientific explanation describes how the spatial analysis was performed.',40,100),item('The analysis considers cell types and preserves all relevant measurements.',40,89),item('The experimental result needs its context and scientific interpretation.',306,100)];
test('Nature figure labels and panel letters stay out of prose, but captions and inline symbols survive',()=>{
 const labels=['Cell type','Visualization','Embedding','B cells','Plasma cells','UMAP 2','Architecture'].map((s,n)=>item(s,40+n*55,500,'labels',45,5));
 const caption=item('Fig. 2 | An explanatory caption describes the measurement.',40,200,'bold');
 const symbol=item('μ',110,101,'symbol',4,5);
 const panel=item('a',40,540,'panel',5,8);
 const all=[...body,...labels,caption,symbol,panel];
 const filtered=filterReadingItems(all,595,styles,{journal:'Nature'},792);
 assert.deepEqual(filtered,[...body,caption,symbol]);
 const parsed=analyzeJournalPage(all,595,styles,5,{journal:'Nature'},792).paragraphs.join(' ');
 assert.doesNotMatch(parsed,/Visualization|UMAP 2|Plasma cells/);
 assert.match(parsed,/explanatory caption/);
});
test('Nature Methods subset Graphik labels are excluded without dropping publisher headings',()=>{
 const methodsStyles={...styles,labels:{fontName:'ABCDEF+GraphikNaturel-Regular2'},heading:{fontName:'GraphikNaturel-Semibold'}};
 const heading=item('Results',40,650,'heading');
 const labels=Array.from({length:8},(_,n)=>item('Cell '+n,50+n*50,500,'labels',30,6));
 assert.deepEqual(filterReadingItems([...body,heading,...labels],595,methodsStyles,{journal:'Nature Methods'},792),[...body,heading]);
});
test('fragmented running footer and top DOI header disappear while scientific footnotes remain',()=>{
 const footer=['1080','|','Nature','|','Vol 654','|','25 June 2026'].map((s,n)=>item(s,40+n*40,21,'footer',30,8));
 const header=[item('Article',40,759,'footer'),item('https://doi.org/10.1038/example',306,759,'footer')];
 const footnote=item('1 Measurement uncertainty was assessed independently.',40,30,'body');
 const all=[...body,...footer,...header,footnote];
 assert.deepEqual(filterReadingItems(all,595,styles,{journal:'Nature'},792),[...body,footnote]);
});
test('unknown layouts retain diagram labels and body citations containing volume/year text',()=>{
 const label=item('Cell type',40,500,'labels');
 const citation=item('Nature | Vol 654 | 2026',40,300);
 const all=[...body,label,citation];
 assert.deepEqual(filterReadingItems(all,595,styles,{journal:'Another journal'},792),all);
 assert.deepEqual(filterReadingItems([label],595,styles,{journal:'Nature'},792),[label]);
});

test('legacy Communications figure faces leave prose and inline symbols intact',()=>{
 const legacy={body:{fontName:'ABCDEF+AdvOTdd63dae3'},labels:{fontName:'ABCDEF+MyriadPro-Bold'},symbol:{fontName:'ABCDEF+Symbol'}};
 const body=Array.from({length:4},(_,n)=>item('This scientific paragraph contains sufficiently long body text for the publisher signature.',40,300-n*12,'body',250));
 const labels=Array.from({length:8},(_,n)=>item('Sample '+n,40+n*30,600,'labels',25,6));
 const inline=item('α',90,300,'symbol',5,8);
 const clean=filterReadingItems([...body,...labels,inline],595,legacy,{journal:'Nature Communications'},792,4);
 assert.deepEqual(clean,[...body,inline]);
 const unknown=filterReadingItems([...body,...labels],595,legacy,{journal:'Unrelated journal'},792,4);
 assert.equal(unknown.length,body.length+labels.length);
});
