import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMetadata } from '../extension/extract.js';

function fixture({ meta = [], json = [], title = 'Page title', canonical = '', url = 'https://papers.example/article/1' } = {}) {
  globalThis.location = { href: url };
  globalThis.document = {
    title,
    querySelectorAll(selector) {
      if (selector === 'meta') return meta.map(([name, content]) => ({ getAttribute: key => ({ name, content })[key] || null }));
      if (selector.includes('ld+json')) return json.map(textContent => ({ textContent }));
      return [];
    },
    querySelector: () => canonical ? { getAttribute: () => canonical } : null,
  };
  try { return extractMetadata(); }
  finally { delete globalThis.document; delete globalThis.location; }
}

test('extracts scholarly metadata and resolves relative PDF/canonical links', () => {
  assert.deepEqual(fixture({ canonical: '/canonical/1', meta: [
    ['citation_title','A useful paper'], ['citation_author','Ada Lovelace'], ['citation_author','Grace Hopper'],
    ['citation_publication_date','2024/03/02'], ['citation_journal_title','Journal of Tests'],
    ['citation_doi','https://doi.org/10.1234/example'], ['citation_pdf_url','/files/article.pdf'],
  ] }), { pageUrl: 'https://papers.example/article/1', pmid: '', title: 'A useful paper', authors: 'Ada Lovelace; Grace Hopper', year: '2024', journal: 'Journal of Tests', doi: '10.1234/example', url: 'https://papers.example/canonical/1', pdfUrl: 'https://papers.example/files/article.pdf' });
});
test('handles Dublin Core and case-insensitive tags', () => {
  const data = fixture({ meta: [['DC.Title','Core paper'], ['DC.Creator','Researcher'], ['DCTERMS.issued','2022']] });
  assert.equal(data.title, 'Core paper'); assert.equal(data.authors, 'Researcher'); assert.equal(data.year, '2022');
});
test('ignores broken JSON and extracts a scholarly article in a graph', () => {
  const data = fixture({ json: ['broken', JSON.stringify({ '@graph': [{ '@type':'ScholarlyArticle', headline:'Graph paper', author:[{name:'A'}, {name:'B'}], datePublished:'2025-01-01' }] })] });
  assert.equal(data.title,'Graph paper'); assert.equal(data.authors,'A; B'); assert.equal(data.year,'2025');
});
test('rejects unsafe PDF URLs and preserves useful fallback metadata', () => {
  const data = fixture({ meta: [['citation_pdf_url','javascript:alert(1)']] });
  assert.equal(data.pdfUrl,''); assert.equal(data.title,'Page title'); assert.equal(data.url,'https://papers.example/article/1');
});
test('recognizes direct PDF page URL', () => {
  assert.equal(fixture({ url:'https://papers.example/paper.pdf?download=1' }).pdfUrl,'https://papers.example/paper.pdf?download=1');
});

test('captures PubMed identifiers from metadata or a PubMed page', () => {
  assert.equal(fixture({ meta: [['citation_pmid', '42092150']] }).pmid, '42092150');
  assert.equal(fixture({ url: 'https://pubmed.ncbi.nlm.nih.gov/42092150/' }).pmid, '42092150');
  assert.equal(fixture({ url: 'https://other.example/42092150/' }).pmid, '');
  assert.equal(fixture({ meta: [['citation_pmid', 'invalid']] }).pmid, '');
});
