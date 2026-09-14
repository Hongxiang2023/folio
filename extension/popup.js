/* global chrome */
import { extractMetadata } from './extract.js';
import { downloadFromTab } from './pdf.js';
let articleTabId;
const endpoint = 'http://127.0.0.1:47821';
const $ = id => document.getElementById(id);
let metadata;
let token = '';
let saved = false;
function status(message) { $('status').textContent = message; }
async function api(path, body, headers = {}) {
  let response;
  try { response = await fetch(endpoint + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers }, body }); }
  catch { throw new Error('Cannot reach Refhaven. Start the local Refhaven app on this computer, then try again.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? 'Token rejected. Copy the current connector token from Refhaven Settings.' : result.error || `Refhaven returned HTTP ${response.status}.`);
  return result;
}
async function capture(extra = {}) { return api('/api/capture', JSON.stringify({ ...metadata, ...extra }), { 'Content-Type': 'application/json' }); }
$('pair').addEventListener('click', async () => {
  token = $('token').value.trim();
  await chrome.storage.local.set({ token });
  status(token ? 'Token stored. Click Save reference to connect and save this paper.' : 'Token cleared. Copy a token from Refhaven Settings.');
});
$('save').addEventListener('click', async () => {
  if (!token) { $('settings').open = true; status('Pair with Refhaven first: paste its connector token below.'); return; }
  $('save').disabled = true;
  status('Saving reference…');
  try {
    const result = await capture();
    saved = true;
    status(result.duplicate ? 'Already in your library. You can attach its PDF below if available.' : 'Reference saved to Refhaven.');
    $('pdf').hidden = !metadata.pdfUrl;
    $('save').textContent = 'Save reference again';
  } catch (error) { status(error.message); }
  finally { $('save').disabled = false; }
});
$('pdf').addEventListener('click', async () => {
  if (!saved || !metadata.pdfUrl) return;
  const origin = new URL(metadata.pdfUrl).origin + '/*';
  const sameSite = new URL(metadata.pdfUrl).origin === new URL(metadata.pageUrl).origin;
  let releasePermission = false;
  $('pdf').disabled = true;
  let cleanupWarning = '';
  status('Downloading PDF using your browser session… Keep this popup open.');
  try {
    let blob;
    if (sameSite) {
      blob = await downloadFromTab(articleTabId, metadata.pdfUrl);
    } else {
      const existing = await chrome.permissions.contains({ origins: [origin] });
      const allowed = existing || await chrome.permissions.request({ origins: [origin] });
      if (!allowed) throw new Error('PDF site access was not granted.');
      releasePermission = !existing;
      const response = await fetch(metadata.pdfUrl, { credentials: 'include', redirect: 'follow' });
      if (!response.ok) throw new Error(`Publisher returned HTTP ${response.status}.`);
      blob = await response.blob();
    }
    const signature = await blob.slice(0, 5).text();
    if (signature !== '%PDF-') throw new Error('The publisher returned a login or web page instead of a PDF.');
    const filename = `${metadata.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 140)}.pdf`;
    status('Saving PDF to Refhaven…');
    const upload = await api('/api/pdfs', blob, { 'Content-Type': 'application/pdf', 'X-Folio-Filename': encodeURIComponent(filename) });
    const pdfId = upload.pdfId || upload.id;
    if (!pdfId) throw new Error('Refhaven did not return an attachment identifier.');
    let attached = false;
    try {
      const result = await capture({ pdfId, pdfName: upload.pdfName || filename });
      attached = result.paper?.pdfId === pdfId;
      if (!attached) throw new Error('This reference already has a PDF; manage its attachment in Refhaven.');
    } finally {
      if (!attached) {
        try {
          const cleanup = await fetch(`${endpoint}/api/pdfs/${encodeURIComponent(pdfId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
          if (!cleanup.ok) cleanupWarning = ' An unattached upload may remain in Refhaven storage.';
        } catch { cleanupWarning = ' An unattached upload may remain in Refhaven storage.'; }
      }
    }
    status('Reference and PDF saved. Open Refhaven to read it.');
  } catch (error) { status(`Reference remains saved. PDF could not be attached: ${error.message} Download it in your browser and import it in Refhaven.${cleanupWarning}`); }
  finally { $('pdf').disabled = false; if (releasePermission) await chrome.permissions.remove({ origins: [origin] }).catch(() => {}); }
});
try {
  ({ token = '' } = await chrome.storage.local.get('token'));
  $('token').value = token;
  $('settings').open = !token;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Open a publisher, DOI, or article web page first. Browser internal pages cannot be captured.');
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractMetadata });
  articleTabId = tab.id;
  metadata = result.result;
  if (metadata.pdfUrl) { $('open-pdf').href = metadata.pdfUrl; $('open-pdf').hidden = false; }
  if (!metadata?.title) throw new Error('Could not read this page. Reload the page and try again.');
  $('title').textContent = metadata.title;
  $('authors').textContent = metadata.authors || 'No author metadata found. Edit the reference in Refhaven after saving.';
  $('preview').hidden = false;
  $('save').disabled = false;
  status(metadata.pdfUrl ? 'Paper metadata and a PDF link found. Save the reference first, then choose whether to attach the PDF.' : 'Ready to save. No PDF link found; you can attach a downloaded PDF in Refhaven.');
} catch (error) { status(error.message); }
