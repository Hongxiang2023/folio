import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {api} from './api';
import './library-storage.css';

type LibraryLocation={supported:boolean;dataDir:string;localDataDir:string;cloudFolder:boolean};
type LocationChange={cancelled?:boolean;restarting?:boolean};
type Props={onBusyChange?:(busy:boolean)=>void};

export default function LibraryStorage({onBusyChange}:Props){
 const headingId=useId();
 const [location,setLocation]=useState<LibraryLocation|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [phase,setPhase]=useState<'idle'|'choosing'|'revealing'|'restarting'>('idle');
 const alive=useRef(true),pending=useRef(false);
 const busy=phase!=='idle';
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError('');
  try{const result=await api<LibraryLocation>('/api/library-location',{signal});if(alive.current&&!signal?.aborted)setLocation(result);}
  catch(e){if(alive.current&&!signal?.aborted)setError(e instanceof Error?e.message:'Could not read the library location.');}
  finally{if(alive.current&&!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{alive.current=true;const controller=new AbortController();void refresh(controller.signal);return()=>{alive.current=false;controller.abort();};},[refresh]);
 async function chooseFolder(){
  if(pending.current||!location?.supported)return;
  pending.current=true;setPhase('choosing');setError('');setMessage('');
  let restarting=false;
  try{
   const result=await api<LocationChange>('/api/library-location/choose',{method:'POST'});
   if(!alive.current)return;
   if(result.cancelled){setMessage('Folder change cancelled. Your library location is unchanged.');return;}
   if(result.restarting){restarting=true;setPhase('restarting');setMessage('Library folder changed. Folio is restarting…');return;}
   await refresh();setMessage('Library location refreshed.');
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not change the library folder. Reopen these settings if Folio has restarted.');}
  finally{if(!restarting){pending.current=false;if(alive.current)setPhase('idle');}}
 }
 async function revealFolder(){
  if(pending.current||!location?.supported)return;
  pending.current=true;setPhase('revealing');setError('');setMessage('');
  try{await api('/api/library-location/reveal',{method:'POST'});if(alive.current)setMessage('Library folder opened in your file manager.');}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not open the library folder.');}
  finally{pending.current=false;if(alive.current)setPhase('idle');}
 }
 return <section className="folio-library-location" aria-labelledby={headingId}>
  <div className="folio-library-location-heading"><h3 id={headingId}>Library location</h3>{location&&<span className="folio-location-badge">{location.cloudFolder?'Selected folder':'Local folder'}</span>}</div>
  <p>Keep your library locally, or choose a folder managed by your cloud-storage desktop app.</p>
  {loading?<p role="status">Checking library location…</p>:location&&<><span className="folio-location-label">Current library folder</span><code className="folio-location-path">{location.dataDir}</code></>}
  {location?.supported?<>
   <div className="folio-location-actions"><button type="button" className="folio-primary" disabled={busy||loading} onClick={()=>void chooseFolder()}>{phase==='choosing'?'Changing folder…':phase==='restarting'?'Restarting Folio…':'Choose library folder'}</button><button type="button" className="folio-location-open" disabled={busy||loading} onClick={()=>void revealFolder()}>{phase==='revealing'?'Opening…':'Open folder'}</button></div>
   <p className="folio-location-hint">Choose an empty, dedicated folder in the system dialog and review the confirmation. Folio restarts after a successful move. Keep it open until the move finishes.</p>
  </>:!loading&&location&&<p className="folio-location-unavailable">Changing the library folder is available in the Folio desktop app. This browser session uses the folder configured by its local Folio service.</p>}
  <p className="folio-location-hint">References, PDFs, highlights, notes, and citation styles move together. Credentials, AI conversations, and reading caches stay on this computer. Remove unneeded reading caches in the reading view to reclaim their space.</p>
  <details className="folio-cloud-folder-help"><summary>Use a cloud folder and reduce local disk use</summary>
   <ol>
    <li>Install and sign in to your cloud provider’s desktop app, then create and choose an empty Folio folder inside its managed location.</li>
    <li>Wait for your provider to finish uploading the library. Moving it into a cloud folder alone does not free disk space.</li>
    <li>Use the provider’s <strong>Free up space</strong> or <strong>online-only</strong> option for uploaded files in <code>pdfs/</code>. Names and availability vary by provider. Do not delete the PDFs to free space.</li>
    <li>Keep <code>library.json</code> available offline. Opening an online-only PDF downloads it again and may require internet access.</li>
   </ol>
   <p><strong>Use one computer at a time.</strong> Quit Folio and wait for the provider to finish syncing before opening the library on another computer. Folio does not merge simultaneous edits or guarantee that cloud syncing is complete.</p>
   <p>Keep a separate full backup before moving your library. Cloud sync can propagate changes and deletions; it does not replace a backup.</p>
  </details>
  {phase==='choosing'&&<p className="folio-location-status" role="status">Follow the system folder chooser and confirmation. Moving a large library can take time.</p>}
  {message&&<p className="folio-location-status" role="status" aria-live="polite">{message}</p>}
  {error&&<div className="folio-location-error" role="alert"><p>{error}</p>{!busy&&<button type="button" onClick={()=>void refresh()}>Retry location check</button>}</div>}
 </section>;
}
