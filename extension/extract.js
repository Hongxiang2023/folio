// Self-contained: Chrome serializes this function for execution in the active tab.
export function extractMetadata() {
  const meta = (names) => {
    const wanted = names.map(n => n.toLowerCase());
    return Array.from(document.querySelectorAll('meta')).filter(el => wanted.includes((el.getAttribute('name') || el.getAttribute('property') || '').toLowerCase())).map(el => (el.getAttribute('content') || '').trim()).filter(Boolean);
  };
  const first = names => meta(names)[0] || '';
  const httpUrl = raw => { try { const u = new URL(raw, location.href); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
  let article = {};
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(el.textContent);
      const candidates = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])];
      const match = candidates.find(x => x && [x['@type']].flat().some(t => ['ScholarlyArticle', 'Article'].includes(t)));
      if (match) { article = match; break; }
    } catch { /* A page can contain malformed unrelated structured data. */ }
  }
  const jsonAuthors = [article.author || []].flat().map(a => typeof a === 'string' ? a : a?.name || '').filter(Boolean);
  const authors = meta(['citation_author', 'dc.creator', 'dc.creator.personalname', 'dcterms.creator']);
  const date = first(['citation_publication_date','citation_date','dc.date','dcterms.issued']) || article.datePublished || '';
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const title = first(['citation_title','dc.title','dcterms.title']) || article.headline || article.name || document.title || 'Untitled reference';
  const pubmedUrl = new URL(location.href);
  const pmid = first(['citation_pmid', 'pmid']) || (pubmedUrl.hostname === 'pubmed.ncbi.nlm.nih.gov' ? pubmedUrl.pathname.match(/^\/([1-9]\d{0,8})\/?$/)?.[1] || '' : '');
  let pdfUrl = first(['citation_pdf_url']) ? httpUrl(first(['citation_pdf_url'])) : (/\.pdf(?:$|[?#])/i.test(location.href) ? httpUrl(location.href) : '');
  const page = new URL(location.href);
  // Prefer publisher PDF links already rewritten by the institution's proxy.
  const linkedPdf = Array.from(document.querySelectorAll('a[href]')).map(a => httpUrl(a.getAttribute('href'))).find(href => href && new URL(href).origin === page.origin && (!pdfUrl || new URL(href).pathname === new URL(pdfUrl).pathname) && /\.pdf(?:$|[?#])/i.test(href));
  if (linkedPdf) pdfUrl = linkedPdf;
  if (pdfUrl) {
    const pdf = new URL(pdfUrl);
    const publisherPrefix = pdf.hostname.replace(/\./g, '-') + '.';
    if (page.protocol === 'https:' && page.hostname.startsWith(publisherPrefix) && /(?:^|\.)(?:proxy|ezproxy)\./i.test(page.hostname.slice(publisherPrefix.length))) {
      pdf.protocol = page.protocol; pdf.host = page.host; pdfUrl = pdf.href;
    }
  }
  return {
    pageUrl: location.href,
    pmid: /^[1-9]\d{0,8}$/.test(pmid) ? pmid : '',
    title: String(title), authors: (authors.length ? authors : jsonAuthors).join('; '),
    year: String(date).match(/\b(?:19|20)\d{2}\b/)?.[0] || '',
    journal: first(['citation_journal_title','prism.publicationname']) || article.isPartOf?.name || '',
    doi: first(['citation_doi','dc.identifier.doi','prism.doi']).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i,''),
    url: httpUrl(canonical || location.href),
    pdfUrl
  };
}
