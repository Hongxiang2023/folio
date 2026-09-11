# Folio user guide

This guide covers the current local desktop/browser app. Start with [the demo](demo.md) if you want to explore using fictional data. Folio is an early preview: keep backups and review generated references before submission.

## Contents

- [Install and open Folio](#install-and-open-folio)
- [Add and edit papers](#add-and-edit-papers)
- [Organize your library](#organize-your-library)
- [Read PDFs and create reading views](#read-pdfs-and-create-reading-views)
- [Ask a paper with optional AI](#ask-a-paper-with-optional-ai)
- [Generate and revise manuscript references](#generate-and-revise-manuscript-references)
- [Save papers with the browser connector](#save-papers-with-the-browser-connector)
- [Back up, restore, and move your library](#back-up-restore-and-move-your-library)
- [Troubleshooting and limits](#troubleshooting-and-limits)

## Install and open Folio

Follow the [installation guide](install.md): Apple silicon Macs can use the downloadable app; other platforms can run from source. Browser mode opens at `http://127.0.0.1:47821/papers`; the local service must keep running. Desktop mode starts its own service. Stop one mode before starting the other with the same library.

No Folio account is required. Saved PDFs, organization, reading caches, and formatting with installed citation styles work offline. Public metadata lookup, connector publisher downloads, style downloads, and cloud AI require internet access.

## Add and edit papers

### Look up a PMID, DOI, or arXiv ID

1. Choose **Add paper / PMID**.
2. Enter a PubMed ID, DOI/doi.org URL, or arXiv ID. When multiple lookup fields are filled, PMID is tried first; otherwise DOI is preferred over arXiv.
3. Choose **Find paper details** and review the returned title, authors, year, journal/conference, reference type, and identifiers.
4. Optionally attach a PDF and choose **Save paper**.

You can also enter metadata manually. Separate authors with semicolons; `Family, Given; Family, Given` helps preserve name order. Separate tags with commas. Choose **Conference paper** or **Preprint** where appropriate; journal articles, books, chapters, reports, theses, and manuscripts are also offered.

Lookups use PubMed, Crossref, or arXiv. A DOI lookup/save may discover a verified PMID. Identifier availability varies by provider and discipline; no PMID is required to keep or cite a reference.

To correct a paper, select it and choose **Edit** in Reference details. Edit metadata there when you need a revised reference. Compatible library metadata takes precedence over an exported Word file's older snapshot on the next generation. Conflicting identifiers need correction rather than automatic merging.

### Import or attach PDFs

Choose **Import PDF**, select one or multiple files, or drag PDFs into the library. A single PDF opens metadata review; a batch uses filenames as initial titles. Review those titles and fill in identifiers afterward. Importing a PDF does not guarantee complete scholarly metadata extraction.

For a reference without a file, choose **Attach PDF**. Use **Edit → Replace PDF (optional)** to replace an attachment. The original PDF bytes are retained. Exact duplicate files share stored PDF data; this does not merge the reference records themselves.

Imports stream to disk without a 50 MB application limit. Disk space and OS/browser constraints still apply. Very large PDFs are better imported from disk than downloaded through the connector.

### Import another reference library

Choose **Import references** and select `.ris` or a Folio reference-export `.json` file. Imports skip recognized duplicate IDs, PMIDs, DOIs, or source URLs. These files contain reference metadata, not the original PDFs; attach those separately. Reference-import files must be under 20 MB. Arbitrary BibTeX import is not supported.

## Organize your library

- **All papers** shows the complete library. **Reading list** includes papers not marked Finished. **Starred** shows your starred items.
- Use the search box for titles, authors, tags, journal names, PMIDs, or DOIs; it searches reference metadata rather than all PDF text.
- Filter by **To read**, **Reading**, or **Finished**, and sort by **Recent**, **Title**, or **Year**.
- Create a collection with **＋ New**, then assign a selected paper using its Collection dropdown. Each paper belongs to one collection. Manage a collection to rename or remove it; removing one moves its papers to Unfiled and keeps their PDFs and notes.
- Use **Edit** to manage tags and metadata. The star button marks a paper as a favorite.
- Reading notes save automatically after a short pause or when the field loses focus. Check **Saved** before closing; a failed save shows a retry message.

Opening a To read paper's PDF changes its status to Reading. Set Finished yourself after reading. **Copy BibTeX citation** copies the selected paper's export text. **Delete reference** asks for confirmation and removes the reference and its attachment association; a shared PDF remains if another reference needs it. Make a backup before removing valuable work.

## Read PDFs and create reading views

### Original PDF

Choose a paper with an attachment, then **Read PDF**. The original viewer supports the browser's built-in PDF controls. Use **Download PDF** or **Open PDF in a new tab** when needed. Reading notes are available alongside the original.

### Optional reading view

1. Switch to **Reading view** and choose **Generate reading view**.
2. Wait for local extraction, or use **Cancel** to stop it.
3. Navigate with **Go to section** or **Go to page**. Select **Text size** for a more comfortable text pane.
4. Use **Check original** beside a page whenever a passage or layout needs verification.

The reader extracts selectable text, common headings, figures and legends. Results may include subsections. Detected display equations are preserved as small PDF crops rather than editable mathematics. Bibliographies are omitted from the reading text and remain in the original PDF.

Journal rules include Nature-family layouts, Nature Computational Science, Nature Cell Biology, Nature Machine Intelligence, Cell Reports, Science Advances, and common heading/column patterns. These rules do not guarantee correct extraction for every article, publication date, or supplement. [Journal coverage notes](reading-journal-coverage.md) describe the scope.

### Figures, highlights, and notes

Use the figure dropdown or arrows to browse detected figures. The legend appears below the image. **Text on this page** moves the text pane; **Open original at page** opens the source PDF. A full-page preview means the crop boundaries were uncertain.

Use the zoom slider or Ctrl/Cmd-scroll over the preview (25–600%). Drag to pan; keyboard arrow keys and scrollbars are alternatives. **Fit width** resets the view. Higher zoom can render a sharper crop locally from the original PDF, but cannot recover detail absent from its source image.

Select text in the article pane, then choose **Highlight selection**. **Saved highlights** lets you revisit or remove a quote. If an updated extraction no longer locates the exact quote, it stays listed rather than being placed on unrelated text. Notes and highlights belong to the reference, not the cache. They are not annotations written into the original PDF.

### Cache and performance

A reading cache is generated on this computer and reused offline. Identical PDFs share one cache. Existing older caches show **Update reading view** when newer parsing rules are available. Updating replaces that PDF's cached extraction; it does not continually accumulate copies.

Caches add disk use. Folio loads a paper's reading cache when that reading view is opened; generating more reading views does not mean every cache is loaded during normal startup. Actual opening speed still depends on the library, computer, PDF, and cache size.

**Remove reading cache** deletes the derived view while keeping the PDF, notes, highlights, and chat. Full compressed backups omit caches because they can be regenerated; copying the entire library folder includes them. Storage totals appear under **Library & connector**.

Reading extraction supports up to 500 pages, a 16 MiB encoded-image budget, and a 24 MiB total cache limit. These are reading-view limits, not PDF import limits. Scanned and password-protected files, complex tables, unusual columns, and inline mathematics may need the original viewer. OCR is not included.

## Ask a paper with optional AI

Paper chat is optional. Opening or importing a PDF does not send it to an AI provider.

1. Generate its reading view, then choose **Ask this paper → Connection**.
2. Choose **ChatGPT account**, **OpenAI API**, or **Claude API** and save the connection. API connections need your key and an available model ID.
3. For ChatGPT, use **Start ChatGPT sign-in**, continue through the browser link, then **Check connection**. This currently requires macOS and an installed Codex CLI or Codex/ChatGPT runtime. Other platforms can use API connections.
4. Choose **Enable AI & summarize this paper** to send extracted paper content and request the initial summary.
5. Ask a question. You can include the selected text or opt into a figure/equation image using the selector. Check page links against the source.

Summaries and follow-ups use bounded paper excerpts and recent conversation. A long-paper answer may be labeled as incomplete. Figure/equation selection supplies available cached images and legends; equation numbering follows detected order and can differ from the printed paper. Text-only context cannot reliably explain images that were not supplied.

**Stop** cancels an active request. **Disable AI** stops further use until enabled again and preserves history. **Clear conversation** deletes saved chat and disables consent. Changing providers requires enabling that provider for the paper.

Cloud AI uses internet and your provider's subscription limits or separately billed API usage. Extracted content, questions, recent chat, and selected images go to that provider. AI can make mistakes; page links identify supplied context rather than prove the answer. Responses currently arrive as completed answers, not streamed tokens.

Conversation history is local and included in full backups. Connection settings, keys, and isolated ChatGPT runtime credentials are excluded. Desktop API keys use encrypted OS storage when available; otherwise keys stay in memory. See [AI implementation and privacy notes](ai-reading.md).

## Generate and revise manuscript references

### Insert identifiers while writing

Put one reference or a group in parentheses:

| What you have | Marker |
| --- | --- |
| Modern numeric PubMed ID | `(36599988)` |
| Several PubMed IDs | `(36599988, 40903587)` |
| Explicit PMID, including short IDs | `(PMID: 12345)` |
| DOI | `(doi:10.1038/nphys1170)` |
| arXiv ID | `(arxiv:1706.03762)` |
| Mixed identifiers | `(PMID: 36599988; doi:10.1038/nphys1170; arxiv:1706.03762)` |
| Saved paper without a public identifier | Use **Copy citation marker** to obtain `(folio:its-local-id)`. |

These examples illustrate syntax only. Numeric shorthand recognizes 7–9 digit PMIDs; shorter IDs need `PMID:`. Bare numbers in running prose, ordinary years such as `(2024)`, and already formatted `[1]` are not treated as identifiers. You can type numeric PMIDs directly; copying a marker from Folio is optional. Keep a marker within one paragraph.

For multiple references at one location, write one parenthetical group. Folio resolves the identities, deduplicates supported aliases, and lets the selected citation style format/order the cluster. Repeated references reuse their identity; numbering and author–date formatting depend on the style.

### Generate a manuscript

1. Choose **Generate references** in the library sidebar.
2. Paste marker-bearing text or upload a `.docx`. Your source file is not overwritten.
3. Select a **Citation style**. Common bundled styles include APA, Vancouver, Chicago author–date, Nature, Science, Cell, NEJM, IEEE, and Nature Medicine.
4. Leave **Look up missing identifiers** enabled when you want provider lookups. Optionally select **Save looked-up papers to my library**. Otherwise the temporary records are used only for this generator and its exports.
5. Choose **Generate references**, then inspect the manuscript preview, reference list, and warnings.
6. Resolve missing/conflicting identifiers before **Download Word document**. **Download plain text** is also available, but its formatted citations do not retain Word's revision controls.

Lookup sends identifiers to PubMed, Crossref, or arXiv, never the manuscript text. A paper already in the library or an intact exported document can be formatted offline. Temporary lookup sessions support up to 100 records; larger bibliographies can use saved library records.

### Add another journal style

Use **Search installed styles** to filter local styles. Under **Get more styles**, search the style repository and choose **Install**, or use **Import a CSL style** for a `.csl` file under 1 MB. Installed styles are available offline. Repository searches/downloads require internet and do not send your manuscript or library.

The workflow supports in-text citation styles, not styles requiring true footnotes or endnotes. Review formatting even when a journal-named style is available. [Citation style details](citation-styles.md)

### Revise an exported Word document

1. Keep a backup of the exported `.docx`.
2. Edit your prose in Word. Leave Folio's generated citation controls and bibliography intact.
3. Add new markers, such as `(40903587)` or `(36599988, 40903587)`, outside existing controls.
4. To change an existing citation's sources, remove its **entire citation control**, then insert the new marker. To remove a citation, remove its entire control. Retained controls can move with their text.
5. Upload the revised file into **Generate references**, resolve any new identifiers, select the desired style, and generate again.
6. Download the new Word document. Folio refreshes citations in the current manuscript order and replaces its managed bibliography rather than adding another copy.

Update author/title/year or other bibliographic corrections in **Reference details → Edit** in Folio. Compatible current library records take precedence over the snapshot stored in the document. Identity conflicts require correction; they are not silently switched to another paper.

Word exports include a limited snapshot of cited bibliographic metadata so an intact document can be revised without the original library. No library notes, PDF files, or credentials are included in that metadata. Share an exported manuscript only with people who should receive its references and manuscript content.

If a generated citation or reference list was manually changed, restore its intact control/list from your backup and make the correction through the supported workflow. Do not strip all content controls or paste formatted citation numbers as plain text and expect their identities to survive. Older exports without revision metadata require the original marker manuscript. This is a file upload/export workflow, not live integration inside Word or Google Docs.

Word conversion covers main-body paragraphs and tables, including markers split across text runs. Headers, footnotes, endnotes, and text boxes are unchanged. Accept or reject tracked changes in a copy before importing it. Word files must be under 20 MB compressed and 100 MB expanded. Review the final document's layout in your editor after export.

## Save papers with the browser connector

The connector is provided as an unpacked Chrome/Edge extension, not a store installation. Firefox and Safari packages are not provided.

1. Keep Folio running. Open **Library & connector → Connector folder**, then **Copy folder path**.
2. Visit `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the entire connector folder containing `manifest.json`. Source builds use the repository's `extension` directory; desktop packages include their own copy.
3. On macOS, press Command–Shift–G in the picker to paste the folder path. On Windows, use Alt+D for the address bar.
4. In Folio, choose **Copy connector pairing key**. Open **Folio Connector** from the browser Extensions menu, expand **Pair with Folio**, paste into **Connector token**, and choose **Save token**.
5. Open an article page. Use **Save reference to Folio**, then **Attach available PDF** if offered. Keep the popup open while saving/downloading.

The connector reads supported scholarly citation metadata from the invoked page. PDF host access may require a browser permission. For university access, sign in through your library first. If capture fails, use **Open PDF in browser (check access)** or download the PDF yourself and attach it in Folio. Folio does not bypass publisher access restrictions.

After a connector update, choose **Reload** on the extension's browser-manager card, then refresh the article page. Keep your pairing key private. To revoke it, stop Folio, remove only `connector-token` from the library folder, restart, and pair trusted connectors again.

## Back up, restore, and move your library

The exact folder is shown under **Library & connector**. Defaults are:

| Platform | Default library folder |
| --- | --- |
| macOS | `~/Library/Application Support/Folio` |
| Windows | `%LOCALAPPDATA%/Folio` |
| Linux | `~/.local/share/folio` or `$XDG_DATA_HOME/folio` |

Advanced users can set `FOLIO_DATA_DIR` before startup. Do not run two services against the same library.

**Export references** downloads Folio JSON with reference metadata, including notes/highlights where present, but without PDF attachments. Use this for reference transfer, not as your only PDF backup.

**Download full compressed backup**, in **Library & connector**, creates a `.tar.gz` with references, referenced PDFs, and supported local library data such as conversations. It excludes regenerable reading caches and private pairing/API/account credentials. PDFs are losslessly archived rather than downsampled. Keep Folio open until the download finishes.

To restore a downloaded backup:

1. Quit Folio and stop its local service.
2. Preserve the current library folder as a rollback copy.
3. Extract the archive. Restore its contents into the intended library folder, keeping `library.json` and `pdfs/` together and retaining other included library subfolders.
4. Reopen Folio and check a few references, PDFs, notes, and conversations. Recreate reading caches as needed; pair the connector again if its token is absent.

You can also quit Folio and copy the entire library folder to another disk. That copy includes caches and may include private credentials; treat it as private. Never put your live library folder in a public repository.

For the earlier browser prototype, first export its reference backup and import the JSON here. Old browser-stored PDFs do not move automatically; download/re-attach them and keep the old data until migration is verified.

## Troubleshooting and limits

| Symptom | What to check |
| --- | --- |
| Library will not open / port is busy | Stop other Folio instances and source services. Use the address printed by the running local service. Do not expose the port publicly. |
| Imported PDF has a filename as its title | Edit the reference, add an identifier, and use Find paper details. |
| No reading text or missing figures | Check the original PDF. Scans need OCR outside Folio; extraction may miss complex layouts. |
| Old reading layout remains | Use Update reading view when offered. Notes and highlights are retained. |
| Reference marker stays unchanged | Check parentheses, explicit prefixes for short IDs, missing records, or conflicting identifiers. Enable lookup when online. |
| Citation numbers cannot be revised | Use the intact Folio Word export with citation controls, or return to the original marker manuscript. Plain formatted numbers carry no recoverable identity. |
| Word import reports edited generated text | Restore intact citation controls/reference list, update metadata in Folio, and add new markers outside controls. Accept/reject tracked changes in a copy. |
| A style is unavailable | Search/install it or import an in-text CSL style. Footnote/endnote styles are not supported here. |
| Connector cannot save | Keep Folio running, check pairing, reload the extension after updates, and refresh the article page. |
| Reference saved but PDF failed | Check publisher access in your browser; download and attach it manually. |
| AI cannot connect | Check provider/model, key or sign-in state, network, and account limits. ChatGPT account mode currently requires macOS. |
| AI misses a result | Include the relevant selected passage or figure and verify the original; excerpt selection and model answers can be incomplete. |

Folio currently has no cloud sync, shared library, full-text library search, editable PDF annotation layer, arbitrary BibTeX import, or live Word/Google Docs plugin. Keep a backup and review references and PDF extraction before relying on them for publication.
