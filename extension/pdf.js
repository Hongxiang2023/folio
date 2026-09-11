// Runs in the active tab's isolated world. Never receives the Folio pairing token.
export async function streamPdfFromTab(url, transferId) {
  try {
  if (new URL(url).origin !== location.origin) throw new Error('PDF is outside the current article site.');
  const response = await fetch(url, { credentials: 'include', redirect: 'follow' });
  if (!response.ok) throw new Error(`Publisher returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Small messages avoid a single large PDF exceeding browser IPC limits.
      for (let offset = 0; offset < value.length; offset += 32768) {
        const bytes = value.subarray(offset, offset + 32768);
        const data = btoa(String.fromCharCode(...bytes));
        const reply = await chrome.runtime.sendMessage({ type: 'folio-pdf-chunk', transferId, data });
        if (!reply?.ok) throw new Error('Folio connector closed or download interrupted.');
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
  return { ok: true };
  } catch (error) { return { error: error.message }; }
}

export async function downloadFromTab(tabId, url) {
  const transferId = crypto.randomUUID();
  const chunks = [];
  const listener = (message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || sender.tab?.id !== tabId || message?.transferId !== transferId || message.type !== 'folio-pdf-chunk') return;
    try {
      if (typeof message.data !== 'string' || message.data.length > 44000) throw new Error('Invalid chunk');
      chunks.push(Uint8Array.from(atob(message.data), c => c.charCodeAt(0)));
      reply({ ok: true });
    } catch { reply({ ok: false }); }
  };
  chrome.runtime.onMessage.addListener(listener);
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: streamPdfFromTab, args: [url, transferId] });
    if (!results[0]?.result?.ok) throw new Error(results[0]?.result?.error || 'Article download failed.');
    return new Blob(chunks, { type: 'application/pdf' });
  } finally { chrome.runtime.onMessage.removeListener(listener); }
}
