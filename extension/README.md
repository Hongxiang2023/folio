# Folio Connector

This free Chromium Manifest V3 extension saves the current page to a Folio app running on the same computer. It works with Chrome and Edge. It is an unpacked extension, not a store-published extension.

## Install and pair

1. Start Folio and leave it running at `http://127.0.0.1:47821`.
2. In Folio, open **Library & connector** using the settings button and click **Copy folder path**.
3. In Chrome’s address bar, enter `chrome://extensions`. In Edge, enter `edge://extensions`. Enable **Developer mode** and click **Load unpacked**.
4. In the Mac folder picker, press **⌘⇧G**, paste the folder path, press **Return**, then click **Select / Open**. In Windows, press **Alt+D**, paste the path, press **Enter**, then click **Select Folder**. Select the whole `extension` folder containing `manifest.json`.
5. In Folio, click **Copy connector pairing key**. In the browser, click the puzzle-piece **Extensions** icon next to the address bar, then **Folio Connector**. Pin it for easier access.
6. At the bottom of the connector popup, expand **Pair with Folio**, paste the key into **Connector token**, and click **Save token**. This is where the connector settings are located.
7. Open an article page, open the connector, and click **Save reference to Folio**, then **Attach available PDF**. Keep the popup open until saving finishes.

After updating Folio, click **Reload** (circular arrow) on the Folio Connector card in your browser’s extension manager, then refresh the article page.

For university access, sign in through your library and open the proxied article first. Same-site PDFs download from that tab using its browser session; recognized proxy URLs retain their institutional hostname. **Open PDF in browser (check access)** lets you confirm the PDF is accessible. If a login page appears, finish signing in, return to the article, refresh, and retry.

Metadata extraction supports scholarly citation meta tags, Dublin Core, basic JSON-LD Article/ScholarlyArticle metadata, canonical URLs, and page-title fallback. Authors are stored separated by semicolons. Review imported metadata; this connector does not have Zotero's site-specific translator coverage.

## Privacy and limitations

Only an explicit save action sends metadata to your local Folio library. No browsing history is collected. The token is stored locally by Chrome, not synced. Required permissions are active-tab access, script injection, local storage, and access to the local Folio endpoint. Cross-site publisher access is optional, requested only when attaching a PDF; newly granted access is removed after the attempt. Existing permissions are preserved. Same-site downloads use active-tab access. The manifest declares HTTP/HTTPS optional patterns so users can approve the specific publisher origin at runtime.

PDF requests may use existing publisher cookies. Some publishers, signed links, cross-origin redirects, and browser cookie policies prevent downloads. No paywall or access control is bypassed. When attachment fails, the reference stays saved: download the PDF normally and import it into Folio. Keep the popup open until the save completes. Downloads currently buffer the PDF in memory, so very large attachments depend on available browser memory; prefer Folio's streaming local file import for large PDFs.

If Folio cannot be reached, ensure its server is running at the exact loopback address above. If authentication fails, copy its current token again. Browser internal pages and some built-in PDF viewer pages do not allow script injection; use the article landing page or import the PDF directly.
