import {createReadStream} from 'node:fs';
import {stat,readFile,readdir} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import path from 'node:path';
function tarHeader(name,size){
 const block=Buffer.alloc(512);block.write(name,0,100,'utf8');
 const oct=(value,offset,length)=>{const digits=value.toString(8);if(digits.length<length){block.write(digits.padStart(length-1,'0')+'\0',offset,length,'ascii');}else{let n=BigInt(value);for(let i=offset+length-1;i>=offset;i--){block[i]=Number(n&255n);n>>=8n;}block[offset]|=128;}};
 oct(0o600,100,8);oct(0,108,8);oct(0,116,8);oct(size,124,12);oct(Math.floor(Date.now()/1000),136,12);block.fill(32,148,156);block.write('0',156);block.write('ustar\0',257);block.write('00',263);
 const checksum=block.reduce((a,b)=>a+b,0);block.write(checksum.toString(8).padStart(6,'0')+'\0 ',148,8);return block;
}
export async function streamBackup(res,library,dataDir){
 async function* entries(){
  const metadata=Buffer.from(JSON.stringify(library,null,2));yield tarHeader('library.json',metadata.length);yield metadata;if(metadata.length%512)yield Buffer.alloc(512-metadata.length%512);
  const ids=new Set(library.papers.map(p=>p.pdfId).filter(Boolean));
  for(const id of ids){const filename=path.join(dataDir,'pdfs',`${id}.pdf`);const {size}=await stat(filename);yield tarHeader(`pdfs/${id}.pdf`,size);for await(const chunk of createReadStream(filename))yield chunk;if(size%512)yield Buffer.alloc(512-size%512);}
  // Conversations are user work; connection settings and credentials never enter backups.
  for(const id of ids){let chat;try{chat=await readFile(path.join(dataDir,'paper-chat',id+'.json'));}catch(e){if(e.code==='ENOENT')continue;throw e;}yield tarHeader(`paper-chat/${id}.json`,chat.length);yield chat;if(chat.length%512)yield Buffer.alloc(512-chat.length%512);}
  let styleFiles=[];try{styleFiles=(await readdir(path.join(dataDir,'citation-styles'))).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const name of styleFiles){const value=await readFile(path.join(dataDir,'citation-styles',name));yield tarHeader(`citation-styles/${name}`,value.length);yield value;if(value.length%512)yield Buffer.alloc(512-value.length%512);}
  yield Buffer.alloc(1024);
 }
 res.writeHead(200,{'Content-Type':'application/gzip','Content-Disposition':'attachment; filename="folio-library.tar.gz"','Cache-Control':'no-store'});
 await pipeline(Readable.from(entries()),createGzip({level:6}),res);
}
