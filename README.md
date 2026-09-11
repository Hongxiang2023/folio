# Folio

**Keep your papers, read with context, and turn identifiers into manuscript references.**

Folio is a free, local-first reference manager with a desktop app, PDF reading view, Chrome/Edge connector, and a Word upload/export workflow. Your library lives on your computer. Core library and citation features need no account or subscription. Optional paper chat uses your own AI provider.

**Early desktop preview.** Source installation is available below. Public installer signing and wider cross-platform testing remain release work. Folio is an independent project, not affiliated with Zotero or Paperpile.

[Live demo](https://hongxiang2023.github.io/folio/) · [User guide](docs/user-guide.md) · [Hands-on tutorial](docs/demo.md) · [Security](SECURITY.md) · [Release checklist](RELEASE.md)

## From papers to a revised manuscript

| Your task | Folio's workflow |
| --- | --- |
| Collect | Import PDFs, look up a PMID/DOI/arXiv ID, import RIS/Folio JSON, or save a page with the browser connector. |
| Organize | Search reference metadata; use collections, tags, stars, and reading status. |
| Read | Keep the original PDF beside an optional offline text-and-figures reading view; save notes and highlights. |
| Understand | Optionally ask about the paper, a selected passage, or a figure/equation using your AI connection. |
| Cite | Write PMID, DOI, arXiv, or local-library markers and generate formatted citations plus a bibliography. |
| Revise | Edit the exported Word file, insert new markers, upload it again, and refresh citations and references. |
| Keep a backup | Export reference metadata or download a full compressed library backup with PDFs. |

### Write the PMID directly

No special prefix is needed for modern numeric PubMed IDs:

```text
This result supports our approach (36599988).
Several studies support this approach (36599988, 40903587).
```

Folio looks up missing identifiers when **Look up missing identifiers** is selected. Choose a citation style, review the preview, and download Word. Ordinary years such as `(2024)` and citation numbers such as `[1]` are left alone; short PubMed IDs need an explicit prefix, such as `(PMID: 12345)`.

Papers without PubMed IDs work too:

```text
We used the published method (doi:10.1038/nphys1170).
A related approach appears in a preprint (arxiv:1706.03762).
Compare both sources (PMID: 36599988; doi:10.1038/nphys1170).
```

These are syntax examples, not claims that those papers support the sample sentences. For a saved reference with no public identifier, use **Copy citation marker** in its details. It produces a local Folio marker.

For revisions, preserve existing Word citation controls and Folio's reference list. Add new markers outside those controls and re-upload the document. To replace a citation's sources, delete the entire citation control and type the replacement marker. This is an upload/export workflow, not a live Word add-in. [Full citation and revision instructions →](docs/user-guide.md#generate-and-revise-manuscript-references)

## Try it without your own library

[The demo guide](docs/demo.md) includes a clickable, self-contained walkthrough and fictional references for an offline hands-on trial. Open the [live walkthrough](https://hongxiang2023.github.io/folio/), or download the repository and open `docs/demo/index.html` locally. The walkthrough is an illustration, not a recording or screenshot of the live app.

## Run from source

Install **Node.js 22.13 or newer**, then clone this repository and run:

```sh
git clone https://github.com/Hongxiang2023/folio.git
cd folio
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:47821/papers** and keep the process running. `Ctrl+C` stops it. Folio binds to your computer's loopback interface; it is not an internet-facing server.

For a desktop window, stop that service first, then run:

```sh
npm run desktop
```

Browser and desktop modes normally use the same library folder. Run one service per library at a time. The [demo guide](docs/demo.md#hands-on-demo-in-an-isolated-library) shows how to use a separate temporary library.

## Reading that keeps the source close

Choose **Read PDF → Reading view → Generate reading view** for selectable article text, section/page navigation, figure previews, and saved highlights. The original PDF stays available through **Check original**. Figure zoom reaches 600%, with sharper local rendering when possible. Detected display equations are kept as image crops.

Layout rules cover several Nature-family journals, Cell Reports, Science Advances, and common article layouts. This is heuristic PDF extraction, not a guarantee for every paper or journal. Complex tables, mathematics, scans, and unusual layouts may require the original PDF. No OCR is included. Reading caches are generated locally and can be removed without deleting notes or the PDF. [Reading guide →](docs/user-guide.md#read-pdfs-and-create-reading-views)

## Local by default, connected when you choose

- References, PDFs, notes, highlights, and paper conversations are stored locally. There is no built-in cloud sync or telemetry.
- Identifier lookup contacts PubMed, Crossref, or arXiv; those services receive identifiers and network request information, not your manuscript. Saving identifier-bearing references can also look up verified PMIDs.
- The connector reads the active article page when invoked. PDF access depends on your publisher access; Folio does not bypass it.
- AI is optional and requires explicit per-paper enablement. Extracted text, questions, recent conversation, and selected images go to your chosen provider. Provider billing or account limits apply.
- Exported Word files include the cited bibliographic metadata needed for revision. They do not embed library notes, PDF attachments, or credentials in that metadata.

[Storage and backup instructions](docs/user-guide.md#back-up-restore-and-move-your-library) · [AI details](docs/ai-reading.md) · [Security boundaries](SECURITY.md)

## Develop and contribute

```sh
npm run check          # build, typecheck, and automated tests
npm run dist:desktop   # package locally; does not publish
```

For frontend development, keep `npm start` running and use `npm run dev` in a second terminal. Vite proxies API calls to the local service. Build desktop artifacts on the corresponding OS. See [RELEASE.md](RELEASE.md) for release gates and [CSL-NOTICES.md](CSL-NOTICES.md) for citation-style notices.

When reporting a problem, include the OS, Folio version, exact steps, and an error message. A synthetic or legally shareable reproduction is preferable to a private manuscript. Never share your library folder, connector token, API keys, or account credentials.

Current limits include no cloud/shared libraries, full-text library search, PDF annotation layer, arbitrary BibTeX import, live Word/Google Docs add-in, Firefox/Safari connector, or OCR. Citation metadata and generated references should be checked before submission.

Source is MIT-licensed. Bundled dependencies and styles retain their own licenses.
