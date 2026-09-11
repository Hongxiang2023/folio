import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMetadata } from '../extension/extract.js';
import { streamPdfFromTab, downloadFromTab } from '../extension/pdf.js';

test('Penn Nature proxy PDF retains institutional origin and canonical reference', () => {
  const meta = [{ getAttribute: name => ({ name: 'citation_pdf_url', content: 'https://www.nature.com/articles/s41586-026-10452-4.pdf' })[name] }];
  globalThis.document = { title: 'Example', querySelectorAll: selector => selector === 'meta' ? meta : [], querySelector: () => ({ getAttribute: () => 'https://www.nature.com/articles/s41586-026-10452-4' }) };
  globalThis.location = new URL('https://www-nature-com.proxy.library.upenn.edu/articles/s41586-026-10452-4');
  const result = extractMetadata();
  assert.equal(result.pdfUrl, 'https://www-nature-com.proxy.library.upenn.edu/articles/s41586-026-10452-4.pdf');
  assert.equal(result.url, 'https://www.nature.com/articles/s41586-026-10452-4');
  globalThis.location = new URL('https://unrelated.example/article');
  assert.equal(extractMetadata().pdfUrl, 'https://www.nature.com/articles/s41586-026-10452-4.pdf');
  delete globalThis.document;
});

test('PDF transfer uses tab credentials and bounded chunks; listener is cleaned up', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.location = new URL('https://publisher.example/article');
  const bytes = new Uint8Array(100000).fill(42); bytes.set(new TextEncoder().encode('%PDF-'));
  let listener; let count = 0;
  globalThis.chrome = {
    runtime: { id: 'test', onMessage: { addListener: fn => listener = fn, removeListener: () => listener = null },
      sendMessage: async message => { count++; assert.ok(message.data.length <= 44000); return new Promise(resolve => listener(message, { id: 'test', tab: { id: 7 } }, resolve)); } },
    scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] }
  };
  globalThis.fetch = async (url, options) => { assert.equal(options.credentials, 'include'); return new Response(bytes); };
  try {
    const blob = await downloadFromTab(7, 'https://publisher.example/article.pdf');
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
    assert.ok(count > 1); assert.equal(listener, null);
    globalThis.fetch = async () => new Response('Forbidden', { status: 403 });
    await assert.rejects(downloadFromTab(7, 'https://publisher.example/article.pdf'), /403/);
    assert.equal(listener, null);
    assert.match((await streamPdfFromTab('https://other.example/file.pdf', 'x')).error, /outside/);
  } finally { globalThis.fetch = oldFetch; delete globalThis.chrome; delete globalThis.location; }
});
