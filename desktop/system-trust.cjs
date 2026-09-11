// Use roots already trusted by the OS as well as Node's defaults (including
// explicitly configured extra roots). TLS chain and hostname checks stay on.
module.exports=function configureSystemTrust(tls=require('node:tls')){
 if(typeof tls.getCACertificates!=='function'||typeof tls.setDefaultCACertificates!=='function')return false;
 const defaults=tls.getCACertificates('default'),system=tls.getCACertificates('system');
 if(system.length)tls.setDefaultCACertificates([...new Set([...defaults,...system])]);
 return true;
};
