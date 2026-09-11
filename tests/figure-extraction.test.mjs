import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const layout=data(compile(await readFile(new URL('../src/reading-layout.ts',import.meta.url),'utf8')));
const code=compile(await readFile(new URL('../src/figure-extraction.ts',import.meta.url),'utf8')).replace("from './reading-layout'",`from '${layout}'`);
const {extractFigureContent,mergeExtractedFigures}=await import(data(code));
const styles={body:{fontName:'HardingText-Regular'},bold:{fontName:'HardingText-Bold'},label:{fontName:'ABCDEF+GraphikNaturel-Regular'}};
const item=(str,x,y,height=7,fontName='body',width=240)=>({str,transform:[1,0,0,1,x,y],height,fontName,width});
test('next-page placeholder links full two-column legend to original figure',()=>{
 const first=extractFigureContent([item('Fig. 2 |',40,100,7,'bold'),item('See next page for caption.',70,100),item('Narrative remains below the figure and is not part of its caption.',40,70,8.25)],595,792,styles,3);
 assert.equal(first.items.length,1);assert.equal(first.figures[0].caption,'');assert.ok(first.figures[0].crop);
 const next=extractFigureContent([item('Fig. 2 | A detailed figure explanation.',40,736,7,'bold'),item('The first column continues with an explanation.',40,726),item('The second column completes the legend.',306,736),item('Scientific article prose is kept separate from the caption.',40,700,8.25)],595,792,styles,4);
 const figures=[...first.figures];mergeExtractedFigures(figures,next.figures);
 assert.equal(figures.length,1);assert.equal(figures[0].page,3);assert.equal(figures[0].captionPage,4);assert.match(figures[0].caption,/second column/);assert.equal(next.items.length,1);
});
test('inline panel references never start a figure legend',()=>{
 const items=[item('Fig. 1d. This is a panel reference inside ordinary prose.',40,600,8.25)];
 assert.deepEqual(extractFigureContent(items,595,792,styles,2).items,items);
 assert.equal(extractFigureContent(items,595,792,styles,2).figures.length,0);
});
test('left-column figure crop keeps neighboring narrative outside its image',()=>{
 const items=[item('Fig. 2 | An explanatory caption.',40,657,7,'bold'),...['VMR','Chromosome','Variance'].map((s,n)=>item(s,45+n*60,700+n*10,6.5,'label',40)),item('Narrative occupies the neighboring right-hand article column.',306,680,8.25)];
 const f=extractFigureContent(items,595,792,styles,3).figures[0];assert.ok(f.crop);assert.ok(f.crop.x+f.crop.width<=.5);assert.ok(f.crop.height>0);
});
test('unverified font never absorbs matching article paragraphs below a caption',()=>{
 const items=[item('Fig. 2 | A caption.',40,600),item('Article prose shares the same font and size but must remain.',40,590)];
 const result=extractFigureContent(items,595,792,{body:{fontName:'Times-Roman'}},2);
 assert.deepEqual(result.items,[items[1]]);assert.equal(result.figures[0].crop,undefined);
});
test('figure-only pages lose diagram labels even when their caption is a short placeholder',()=>{
 const labels=['UMAP 1','Cell type','Embedding'].map((s,n)=>item(s,45+n*65,700+n*10,6.5,'label',50));
 const result=extractFigureContent([item('Fig. 2 | See next page for caption.',40,120,7,'bold'),...labels],595,792,styles,3);
 assert.equal(result.figures.length,1);assert.deepEqual(result.items,[]);
});
test('preprint captions follow smaller typography independently in neighboring columns',()=>{
 const s={body:{fontName:'Times-Roman'},bold:{fontName:'Times-Bold'}};
 const prose=[1,2,3].map(n=>item('Long scientific body prose stays in the manuscript reading view.',55,400-n*12,10));
 const items=[item('Figure 3.',55,539,9,'bold',34),item('Left figure explanation starts here.',90,539,9,'body',195),item('Left figure explanation ends here.',55,528,9,'body',230),item('Figure 4.',307,551,9,'bold',34),item('Right figure explanation starts here.',342,551,9,'body',195),item('Right figure explanation ends here.',307,540,9,'body',230),...prose];
 const r=extractFigureContent(items,612,792,s,5,[{x:.09,y:.1,width:.37,height:.17},{x:.51,y:.1,width:.36,height:.17}]);
 assert.equal(r.figures.length,2);assert.match(r.figures[0].caption,/Left figure explanation ends/);assert.doesNotMatch(r.figures[0].caption,/Right/);assert.match(r.figures[1].caption,/Right figure explanation ends/);assert.deepEqual(r.items,prose);assert.ok(r.figures[0].crop.x+r.figures[0].crop.width<.5);assert.ok(r.figures[1].crop.x>.5);
});
test('centered supplementary captions use the full image placement without swallowing a table above',()=>{
 const items=[item('Figure S1.',135,110,9,'bold',45),item('Caption to a supplementary heatmap.',183,110,9,'body',260),item('Table data that must remain outside the figure.',55,560,9,'body',430)];
 const r=extractFigureContent(items,612,792,{body:{fontName:'Times-Roman'},bold:{fontName:'Times-Bold'}},21,[{x:.09,y:.42,width:.79,height:.4}]);
 assert.equal(r.figures[0].label,'Figure S1');assert.ok(r.figures[0].crop.x<.1);assert.ok(r.figures[0].crop.y>.4);assert.deepEqual(r.items,[items[2]]);
});
test('smaller panel text stays with a bold full-width caption and continues on the next prose page',()=>{
 const s={body:{fontName:'HelveticaNeue-Roman'},bold:{fontName:'HelveticaNeue-Bold'}};
 const first=extractFigureContent([item('Figure 2. Multiscale chromatin organization across cell types',55,100,7.5,'bold',480),item('(A) Overview of the experiment.',55,90.5,7,'body',400),item('(B) Genome-wide correlation.',55,81,7,'body',400),item('(legend continued on next page)',400,40,7.5,'body',140)],603,783,s,5,[{x:.15,y:.14,width:.7,height:.69}]);
 assert.match(first.figures[0].caption,/Genome-wide correlation/);assert.doesNotMatch(first.figures[0].caption,/legend continued/);assert.ok(first.figures[0].crop);assert.equal(first.items.length,0);
 const prose=[1,2,3].map(n=>item('Scientific article prose must remain separate from the caption.',55,600-n*11,8.5));
 const second=extractFigureContent([...prose,item('(C) Spatial distribution of the final measurement.',55,130,7,'body',480),item('See also Figures S1 and S2.',55,120.5,7,'body',250)],603,783,s,6,[],first.figures);
 assert.match(first.figures[0].caption,/Spatial distribution/);assert.match(first.figures[0].caption,/See also/);assert.deepEqual(second.items,prose);assert.equal(second.figures.length,0);
});
test('an unnamed next-page legend anchors the numbered caption to the graphic page',()=>{
 const s={body:{fontName:'HelveticaNeue-Roman'},bold:{fontName:'HelveticaNeue-Bold'}};
 const first=extractFigureContent([item('A',90,670,9,'bold',9),item('(legend on next page)',450,60,7,'body',100)],603,783,s,3,[{x:.14,y:.13,width:.7,height:.74}]);
 assert.equal(first.figures.length,1);assert.equal(first.items.length,0);
 const prose=[1,2,3].map(n=>item('Scientific article prose must remain separate from the caption.',55,600-n*11,8.5));
 const second=extractFigureContent([...prose,item('Figure 1. Complete figure caption',55,150,7.5,'bold',450),item('(A) Explanation of the panel.',55,140.5,7,'body',400)],603,783,s,4,[],first.figures);
 mergeExtractedFigures(first.figures,second.figures);assert.equal(first.figures.length,1);assert.equal(first.figures[0].label,'Figure 1');assert.equal(first.figures[0].page,3);assert.equal(first.figures[0].captionPage,4);assert.deepEqual(second.items,prose);
});
test('panel-like scientific prose is retained without an explicit preceding continuation marker',()=>{
 const items=[item('(C) An ordinary enumerated scientific result.',55,130,7,'body',400)];
 assert.deepEqual(extractFigureContent(items,603,783,{body:{fontName:'HelveticaNeue-Roman'}},3,[],[{page:2,label:'Figure 1',caption:'Complete.'}]).items,items);
});
test('split labels and a distinct caption typeface recover a side legend without absorbing adjacent prose',()=>{
 const s={body:{fontName:'AAAAAA+TimesNewRomanPS'},caption:{fontName:'BBBBBB+Bliss-Regular'},bold:{fontName:'BBBBBB+Bliss-ExtraBold'}};
 const prose=[1,2,3].map(n=>item('Long scientific article text in a different typeface must remain.',400,600-n*11,9,'body',160));
 const r=extractFigureContent([...prose,item('Fig.',225,230,8.5,'bold',14),item('1.',245,230,8.5,'bold',7),item('The side caption begins.',256,230,8.5,'caption',65),item('It continues beside the graphic.',225,220,8.5,'caption',90),item('The final line wraps beneath the graphic across both columns.',225,210,8.5,'caption',320)],612,792,s,1);
 assert.equal(r.figures.length,1);assert.equal(r.figures[0].label,'Fig. 1');assert.match(r.figures[0].caption,/wraps beneath/);assert.equal(r.figures[0].crop,undefined);assert.deepEqual(r.items,prose);
});
test('dedicated multipanel crops retain vector-only panels beyond the nearest raster tile',()=>{
 const labels=['A','B','C'].map((s,n)=>item(s,55+n*130,650-n*150,9,'bold',9));
 const r=extractFigureContent([...labels,item('Figure 4. A multipanel experimental result',55,100,7.5,'bold',450),item('(A) A raster image and vector-only plots.',55,90.5,7,'body',450)],603,783,{body:{fontName:'HelveticaNeue-Roman'},bold:{fontName:'HelveticaNeue-Bold'}},10,[{x:.2,y:.2,width:.2,height:.2}]);
 assert.ok(r.figures[0].crop.y+r.figures[0].crop.height>.85);assert.ok(r.figures[0].crop.x+r.figures[0].crop.width>.9);assert.equal(r.items.length,0);
});
test('opaque embedded font names still connect a bold legend to its regular two-column text',()=>{
 const s={bold:{fontName:'JCLPJO+AdvTT1ef22648.B'},caption:{fontName:'JCMACG+AdvTTec37d199'},diagram:{fontName:'JCMGBH+BentonSansCondensed-Regular'}};
 const labels=[item('Chromosome panel A',40,300,8,'diagram',100),item('Diagram key',200,85,8,'diagram',65)];
 const r=extractFigureContent([...labels,item('Fig. 2. Summary of the assembly.',40,120,8,'bold',240),item('(',40,110,8,'caption',3),item('A',43,110,8,'bold',5),item(') The first panel explanation continues.',48,110,8,'caption',230),item('The left column ends with the final measurement.',40,100,8,'caption',240),item('(B) The second column starts here.',310,120,8,'caption',240),item('The second column finishes its explanation.',310,110,8,'caption',240)],612,792,s,5);
 assert.match(r.figures[0].caption,/^Fig\. 2\. Summary/);assert.match(r.figures[0].caption,/\(A\)/);assert.match(r.figures[0].caption,/second column finishes/);assert.doesNotMatch(r.figures[0].caption,/Chromosome|Diagram/);assert.deepEqual(r.items,labels);
});
test('figure-only pages use a bold title and regular continuation to recover a full legend without body prose',()=>{
 const s={bold:{fontName:'MinionPro-Bold'},body:{fontName:'MinionPro-Regular'}};
 const r=extractFigureContent([item('Fig 4. A full-page experimental analysis.',43,172,8,'bold',305),item('(A) Visualization of the data begins here.',348,172,8,'body',210),item('The first explanation continues across the full printable page.',43,162.5,8,'body',510),item('(B) A complete description of the next measurement follows.',43,153,8,'body',510),item('The final panel explanation ends here.',43,143.5,8,'body',510)],603,783,s,14);
 assert.equal(r.figures.length,1);assert.match(r.figures[0].caption,/final panel explanation ends here/);assert.equal(r.items.length,0);
});
test('colon-labelled legends use connected lines even when their type matches article prose',()=>{
 const s={body:{fontName:'NimbusRomNo9L-Regu'}};
 const body=item('Article prose resumes below the separate caption block.',108,465,10,'body',390);
 const r=extractFigureContent([item('Figure 2: Multi-head attention consists of several',108,510,10,'body',390),item('attention layers running in parallel.',108,499,10,'body',390),body],612,792,s,4);
 assert.match(r.figures[0].caption,/attention layers running in parallel/);assert.deepEqual(r.items,[body]);
});
test('a wrapped body reference beginning Fig. remains ordinary article text',()=>{
 const items=[item('We have three major observations from Table 2 and',321,214,10,'body',240),item('Fig. 4. First, the situation is reversed with residual learning.',309,202,10,'body',240),item('The deeper model performs better on this experiment.',309,190,10,'body',240)];
 const r=extractFigureContent(items,612,792,{body:{fontName:'NimbusRomNo9L-Regu'}},5);assert.equal(r.figures.length,0);assert.deepEqual(r.items,items);
});
test('bold unpunctuated labels and split label numbers recover publisher legends',()=>{
 const s={bold:{fontName:'MyriadPro-Bold'},body:{fontName:'MyriadPro-Light'}};
 for(const label of [[item('Figure 1',60,500,8,'bold',30)],[item('Fig.',60,500,8,'bold',13),item('1',75,500,8,'bold',5)]]){
  const r=extractFigureContent([...label,item('Benchmarking pipeline.',95,500,8,'body',150),item('The first complete explanation crosses the middle of the page.',60,490,8,'body',490),item('The final description ends with the evaluation metrics.',60,480,8,'body',490)],603,783,s,4);
  assert.equal(r.figures.length,1);assert.match(r.figures[0].label,/1$/);assert.match(r.figures[0].caption,/evaluation metrics/);assert.equal(r.items.length,0);
 }
});
test('single-letter table cells do not expand a heatmap crop into the table above it',()=>{
 const letters=['M','G','V','U'].map((s,n)=>item(s,120+n*65,580,9,'body',10));
 const r=extractFigureContent([...letters,item('Figure 9.',130,110,9,'bold',45),item('Attention heatmap visualization.',178,110,9,'body',270)],612,792,{body:{fontName:'Times-Roman'},bold:{fontName:'Times-Bold'}},21,[{x:.1,y:.42,width:.78,height:.4}]);
 assert.ok(r.figures[0].crop.y>.4);assert.deepEqual(r.items,letters);
});
test('short axis labels just below the crop retain their descenders without including the caption',()=>{
 const s={body:{fontName:'Times-Roman'},axis:{fontName:'Helvetica'}};
 const prose=[1,2,3].map(n=>item('Long article prose remains in the neighboring column.',50,450-n*12,10,'body',240));
 const axis=item('iter. (1e4)',420,491.35,6.55,'axis',45);
 const r=extractFigureContent([...prose,axis,item('Figure 1. Training and test error.',309,480.31,8.97,'body',240),item('The caption continues with an explanation.',309,469,8.97,'body',240)],612,792,s,1);
 const bottom=(r.figures[0].crop.y+r.figures[0].crop.height)*792;
 assert.ok(bottom>792-491.35+6.55*.2);assert.ok(bottom<792-480.31-8.97);assert.deepEqual(r.items,prose);
});
test('compound panel labels connect smaller caption type and retain all same-page panels',()=>{
 const s={title:{fontName:'AAAAAA+AdvPSA189'},body:{fontName:'BBBBBB+AdvPSA183'}};
 const prose=[1,2,3].map(n=>item('Scientific article prose below the caption must remain separate.',53,82-n*11,8.47,'body',239));
 const r=extractFigureContent([item('Figure 2. Molecular hallmarks across cell populations',53,165.43,7.4718,'title',353),item('(A and B) Inferred scores across the complete experimental cohort.',53,155.96,6.9738,'body',490),item('The explanation continues on the next line.',53,146.49,6.9738,'body',300),item('(C) Signature scores share the same scale.',53,137.03,6.9738,'body',350),item('See also Figure S2.',53,127.56,6.9738,'body',61),...prose],603,783,s,6);
 assert.match(r.figures[0].caption,/\(A and B\).*\(C\).*See also Figure S2\./);assert.deepEqual(r.items,prose);
});
test('spanning captions retain inline italic sample sizes in baseline order',()=>{
 const s={title:{fontName:'AAAAAA+AdvPSA189'},body:{fontName:'BBBBBB+AdvPSA183'},italic:{fontName:'CCCCCC+Advhelvneue-italic'}};
 const r=extractFigureContent([item('Figure 5. Technical differences between two sequencing assays',53,176.54,7.4718,'title',370),item('(A) Comparison of cell fractions for single-cell (',53,167.07,6.9738,'body',212),item('n',265,167.07,6.9738,'italic',4),item('= 48) vs. single-nucleus (',271,167.07,6.9738,'body',76),item('n',347,167.07,6.9738,'italic',4),item('= 19) RNA-seq samples. Statistical significance',352,167.07,6.9738,'body',191),item('was assessed with a one-sided rank-sum test.',53,157.61,6.9738,'body',223),item('(B) UMAPs from single-cell (left,',53,148.2,6.9738,'body',177),item('n',231,148.2,6.9738,'italic',4),item('= 58,083 cells) and single-nucleus (right,',237,148.2,6.9738,'body',125),item('n',363,148.2,6.9738,'italic',4),item('= 63,703 nuclei) in matched samples',369,148.2,6.9738,'body',174),item('from one patient tumor.',53,138.73,6.9738,'body',122)],603,783,s,12);
 assert.match(r.figures[0].caption,/single-nucleus \(n = 19\) RNA-seq samples\. Statistical significance was assessed/);assert.match(r.figures[0].caption,/left, n = 58,083 cells\) and single-nucleus \(right, n = 63,703 nuclei\) in matched samples from one patient/);assert.equal(r.items.length,0);
});
