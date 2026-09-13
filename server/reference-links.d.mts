export type ReferenceIdentity={doi?:string;sourceUrl?:string;pmid?:string;arxivId?:string;cslType?:string;type?:string;journal?:string};
export function citationDoi(p:ReferenceIdentity):string;
export function referenceUrl(p:ReferenceIdentity,options?:{allowPubMed?:boolean}):string;
export function isPubMedUrl(value:string):boolean;
