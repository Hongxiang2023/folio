// Reference destinations are derived from existing metadata, never guessed from titles.
function safeUrl(value){try{const url=new URL(String(value||''));return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function isPubMedUrl(value){try{const u=new URL(value),host=u.hostname.toLowerCase();return host==='pubmed.ncbi.nlm.nih.gov'||(['ncbi.nlm.nih.gov','www.ncbi.nlm.nih.gov'].includes(host)&&/^\/pubmed(?:\/|$)/i.test(u.pathname));}catch{return false;}}
function arxivUrl(p){const id=String(p.arxivId||'').trim().replace(/^arxiv:\s*/i,'');return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(id)?'https://arxiv.org/abs/'+id:'';}
function arxivPreprint(p){return (p.cslType||p.type)==='article'&&(/\barxiv\b/i.test(p.journal||'')||/^https?:\/\/(?:www\.)?arxiv\.org\/abs\//i.test(p.sourceUrl||''));}
export function citationDoi(p){
 // An arXiv entry's related journal DOI does not identify its preprint version.
 if(arxivPreprint(p))return '';
 let value=String(p.doi||'').trim();const resolver=/^https?:\/\/(?:dx\.)?doi\.org\//i.test(value);
 value=value.replace(/^doi:\s*/i,'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
 if(resolver)try{value=decodeURIComponent(value);}catch{return '';}
 return /^10\.\d{4,9}\/[^\s\u0000-\u001f]+$/i.test(value)?value:'';
}
export function referenceUrl(p,{allowPubMed=false}={}){
 const source=safeUrl(p.sourceUrl),arxiv=arxivUrl(p);
 if(arxivPreprint(p))return /^https?:\/\/(?:www\.)?arxiv\.org\/abs\//i.test(source)?source:arxiv||(source&&!isPubMedUrl(source)?source:'');
 const doi=citationDoi(p);if(doi)return 'https://doi.org/'+doi.split('/').map(encodeURIComponent).join('/');
 if(source&&!isPubMedUrl(source))return source;
 if(arxiv)return arxiv;
 if(allowPubMed){if(source)return source;if(/^[1-9]\d{0,8}$/.test(String(p.pmid||'')))return 'https://pubmed.ncbi.nlm.nih.gov/'+p.pmid+'/';}
 return '';
}
