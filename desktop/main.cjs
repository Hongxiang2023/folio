const {app,BrowserWindow,dialog,shell,session,Menu,safeStorage,nativeImage}=require('electron');
const path=require('node:path');
// Honor the computer's existing HTTPS trust before making Node network requests.
require('./system-trust.cjs')();
const {pathToFileURL}=require('node:url');
app.setName('Folio');
process.title='Folio';
let server;
const origin='http://127.0.0.1:47821';
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{const win=BrowserWindow.getAllWindows()[0];if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(async()=>{
  if(process.platform==='darwin')app.dock?.setIcon(path.join(__dirname,'../assets/icon.png'));
  if(process.platform==='darwin')Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Folio',submenu:[{role:'about'}, {type:'separator'}, {role:'hide'}, {role:'hideOthers'}, {role:'unhide'}, {type:'separator'}, {role:'quit'}]},{role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}]));
  const {createFolioServer,defaultDataDir}=await import(pathToFileURL(path.join(__dirname,'../server/index.mjs')).href);
  const {resolveLibraryLocation,prepareLibraryMove,activateLibraryMove,finalizeLibraryMove}=await import(pathToFileURL(path.join(__dirname,'../server/library-location.mjs')).href);
  const localDataDir=defaultDataDir();
  const location=await resolveLibraryLocation({configDir:localDataDir,defaultDataDir:localDataDir});
  let storageReady=!(location.migration&&['activated','cleaning'].includes(location.migration.status));
  const libraryLocation={
   async choose(){
    const result=await dialog.showOpenDialog({title:'Choose an empty Folio library folder',buttonLabel:'Use this folder',properties:['openDirectory','createDirectory']});
    if(result.canceled||!result.filePaths[0])return null;
    const target=result.filePaths[0];
    const confirmation=await dialog.showMessageBox({type:'question',title:'Move your Folio library?',message:'Move references, PDFs, annotations, and citation styles to this folder?',detail:target+'\n\nFolio will verify the copy, restart, then remove the old library files. Credentials, AI conversations, and reading caches stay on this computer. For cloud storage, wait for upload to finish before using your provider’s online-only setting. Use this library on one computer at a time.',buttons:['Cancel','Move library'],defaultId:0,cancelId:0});
    return confirmation.response===1?target:null;
   },
   async reveal(){const error=await shell.openPath(location.dataDir);if(error)throw Error(error);},
   async move(targetDir){const migration=await prepareLibraryMove({sourceDir:location.dataDir,targetDir,configDir:localDataDir});await activateLibraryMove({configDir:localDataDir,migrationId:migration.id});},
   restart(){app.relaunch();app.quit();}
  };
  server=await createFolioServer({dataDir:location.dataDir,localDataDir,libraryLocation,storageReady:()=>storageReady,cropImage:(data,c)=>{const image=nativeImage.createFromDataURL(data),size=image.getSize();const x=Math.floor(c.x*size.width),y=Math.floor(c.y*size.height);return 'data:image/jpeg;base64,'+image.crop({x,y,width:Math.max(1,Math.min(size.width-x,Math.ceil(c.width*size.width))),height:Math.max(1,Math.min(size.height-y,Math.ceil(c.height*size.height)))}).toJPEG(92).toString('base64');},secretStorage:safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text')?{encrypt:value=>safeStorage.encryptString(value).toString('base64'),decrypt:value=>safeStorage.decryptString(Buffer.from(value,'base64'))}:undefined,extensionDir:app.isPackaged?path.join(process.resourcesPath,'extension'):path.join(__dirname,'../extension')});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(47821,'127.0.0.1',resolve);});
  const allowClipboard=(contents,permission)=>{try{return permission==='clipboard-sanitized-write'&&new URL(contents?.getURL()||'').origin===origin;}catch{return false;}};
  session.defaultSession.setPermissionCheckHandler((contents,permission,requestingOrigin)=>{try{return allowClipboard(contents,permission)&&new URL(requestingOrigin).origin===origin;}catch{return false;}});
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(allowClipboard(contents,permission)));
  const win=new BrowserWindow({show:false,width:1380,height:920,minWidth:700,minHeight:550,title:'Folio',backgroundColor:'#f5f7f5',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(({url})=>{try{const parsed=new URL(url);if(parsed.origin===origin&&parsed.pathname.startsWith('/api/pdfs/'))return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}}};if(['https:','http:'].includes(parsed.protocol))void shell.openExternal(parsed.href);}catch{}return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{try{const parsed=new URL(url);if(parsed.origin===origin)return;event.preventDefault();if(['https:','http:'].includes(parsed.protocol))void shell.openExternal(parsed.href);}catch{event.preventDefault();}});
  win.webContents.on('will-prevent-unload',()=>{dialog.showMessageBoxSync(win,{type:'info',title:'Changes are still saving',message:'Please wait for Folio to finish saving, then close the window.',buttons:['Keep Folio open']});});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  await win.loadURL(`${origin}/papers`);
  if(location.migration&&['activated','cleaning'].includes(location.migration.status)){
   const result=await finalizeLibraryMove({configDir:localDataDir,migrationId:location.migration.id});
   if(!result.completed)await dialog.showMessageBox({type:'warning',title:'Library moved; cleanup needs attention',message:'Your new library is ready. Some old files were kept for safety.',detail:result.warnings.join('\n')});
  }
  if(!storageReady){storageReady=true;await win.loadURL(`${origin}/papers`);}
  win.show();
  console.log('Folio desktop ready on 127.0.0.1:47821');
 }).catch(error=>{dialog.showErrorBox('Folio could not start',error.code==='EADDRINUSE'?'Another Folio library service is already running. Close it before opening the desktop app.':error.message);app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('will-quit',()=>server?.close());
}
