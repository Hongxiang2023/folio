import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../src/reading-bibliography.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {omitBibliography}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const page=(number,paragraphs,headings=[])=>({number,paragraphs,headings,image:'unchanged'});
test('removes a cross-page bibliography then preserves Methods and publication notices',()=>{
 const input=[page(1,['Discussion','Scientific findings.','References','1. Jones, A. A finding. Nature 1, 12 (2020).'],[{paragraph:0,title:'Discussion',level:1},{paragraph:2,title:'References',level:1}]),page(2,['Continued reference title (2021).','2. Smith, B. Another finding (2022).','Publisher’s note Springer Nature remains neutral.','Methods','Experimental prose.'],[{paragraph:3,title:'Methods',level:1}])];
 const {pages,removedParagraphs}=omitBibliography(input);
 assert.equal(removedParagraphs,4);assert.deepEqual(pages[0].paragraphs,['Discussion','Scientific findings.']);
 assert.deepEqual(pages[1].paragraphs,['Publisher’s note Springer Nature remains neutral.','Methods','Experimental prose.']);
 assert.equal(pages[1].headings[0].paragraph,1);assert.equal(pages[1].image,'unchanged');assert.equal(input[0].paragraphs.length,4);
});
test('removes unheaded second list after Methods without consuming acknowledgements or figures',()=>{
 const {pages}=omitBibliography([page(25,['Methods','1. Collect samples from the 2020 cohort.','Code availability','The software is available.','59. Chen, S. et al. Single-cell analysis. Nat. Commun. (2021).']),page(26,['80. Stouffer, S. A., Suchman, E. A. The American Soldier (1949).','Acknowledgements We thank the patients.','Fig. 1 | A diagram.'])]);
 assert.deepEqual(pages[0].paragraphs,['Methods','1. Collect samples from the 2020 cohort.','Code availability','The software is available.']);assert.deepEqual(pages[1].paragraphs,['Acknowledgements We thank the patients.','Fig. 1 | A diagram.']);
});
test('removes explicit author-date references and resumes a headed section',()=>{
 const {pages}=omitBibliography([page(1,['Bibliography','Smith, A. (2020). A title.','Appendix','Useful appendix content.'],[{paragraph:2,title:'Appendix',level:1}])]);
 assert.deepEqual(pages[0].paragraphs,['Appendix','Useful appendix content.']);assert.equal(pages[0].headings[0].paragraph,0);
});
test('remaps retained equations along with text and removes equations inside references',()=>{
 const source={...page(1,['References','1. Jones, A. An article (2020).','Methods','x = y']),equations:[{paragraph:1,image:'reference-image'},{paragraph:3,image:'math-image'}]};
 const {pages}=omitBibliography([source]);
 assert.deepEqual(pages[0].equations,[{paragraph:1,image:'math-image'}]);
});

test('Cell STAR Methods with legacy plus glyph resumes after references',()=>{
 const input=[page(1,['References','1. Jones, A. A finding (2024).'],[{paragraph:0,title:'References',level:1}]),page(2,['STAR+METHODS','KEY RESOURCES TABLE','Experimental materials remain available.','METHOD DETAILS','A scientific procedure.'])];
 const result=omitBibliography(input).pages;
 assert.deepEqual(result[1].paragraphs,input[1].paragraphs);
});
