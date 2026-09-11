import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:47821',changeOrigin:true,configure(proxy){proxy.on('proxyReq',(outgoing,incoming)=>{if(['http://127.0.0.1:5173','http://localhost:5173'].includes(incoming.headers.origin||''))outgoing.setHeader('Origin','http://127.0.0.1:47821');});}}}}});
