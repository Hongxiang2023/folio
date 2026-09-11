import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(new URL('../release/',import.meta.url),{recursive:true});
const included=['docs','src','assets','server','desktop','extension','scripts','tests','.github','.gitignore','index.html','vite.config.ts','tsconfig.json','package.json','package-lock.json','README.md','LICENSE','CSL-NOTICES.md','SECURITY.md','RELEASE.md'];
const result=spawnSync('tar',['-czf','release/folio-source-0.1.0.tar.gz',...included],{cwd:root,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
console.log('Created release/folio-source-0.1.0.tar.gz (source only; no library or parent project).');
