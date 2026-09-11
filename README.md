<p align="center">
  <img src="assets/icon.png" alt="Folio logo" width="112" height="112">
</p>
<h1 align="center">Folio</h1>
<p align="center"><strong>Your papers. Your notes. Your next manuscript.</strong></p>
<p align="center">A free, local-first paper library with PDF reading, browser capture, and references that follow your revisions.</p>
<p align="center">
  <a href="docs/install.md"><strong>Get started</strong></a> ·
  <a href="https://hongxiang2023.github.io/folio/demo/">Try the demo</a> ·
  <a href="docs/user-guide.md">User guide</a>
</p>

## Start here

**No ready-to-install app download yet.** Folio is an early preview that runs from source and opens a desktop window. You will need Node.js and a terminal; the source ZIP is not an app installer.

1. **Install Node.js:** download an LTS version from [nodejs.org](https://nodejs.org/en/download). Folio requires Node.js 22.13 or newer.
2. **Download Folio:** [Download source ZIP](https://github.com/Hongxiang2023/folio/archive/refs/heads/main.zip), then extract it. The folder is normally named `folio-main`.
3. **Open a terminal in that folder**, then run these two commands, one at a time:

   ```sh
   npm ci
   npm run desktop
   ```

The first command downloads dependencies. The second builds Folio and opens its desktop window. Keep the terminal open while using it. Your library is stored separately from the downloaded source folder.

**New to terminals?** Follow the step-by-step [macOS](docs/install.md#macos), [Windows](docs/install.md#windows), or [Linux](docs/install.md#linux) instructions, including how to open Folio again later.

| Want to… | Choose this |
| --- | --- |
| Use Folio with your own papers | [Install and launch the desktop preview](docs/install.md) |
| Explore without installing anything | [Open the interactive demo](https://hongxiang2023.github.io/folio/demo/) — an illustration, not the app |
| Try the real app with fictional data | [Follow the hands-on demo](docs/demo.md) |

## A home for the whole reading workflow

| Collect & organize | Read & understand | Write & revise |
| --- | --- | --- |
| Import PDFs and RIS/Folio references | Original PDF and optional reading view | PMID, DOI, arXiv, and local citation markers |
| Look up PMID, DOI, or arXiv metadata | Text, figures, legends, and source-page links | APA, Nature, Vancouver, IEEE, and more CSL styles |
| Save pages with the Chrome/Edge connector | Notes, highlights, and figure zoom | Word upload, formatted export, and revised bibliography |
| Collections, tags, stars, reading status | Optional paper chat using your AI provider | BibTeX copy and full library backups |

No Folio account or subscription is needed for core features. Your references, PDFs, notes, and highlights stay on your computer. Public identifier lookup and optional AI use external services only for their respective tasks; AI requires your own connection and explicit per-paper enablement.

## Just type the PMID

Write one reference or several at the same location:

```text
One source (36599988).
Several sources (36599988, 40903587).
```

Choose **Generate references**, paste your text or upload Word, select a style, and review the result. Missing public identifiers can be looked up automatically. No `PMID:` prefix is needed for these modern IDs.

**No PubMed ID?** Use a DOI, arXiv ID, or **Copy citation marker** from a saved reference:

```text
A DOI source (doi:10.1038/nphys1170).
An arXiv source (arxiv:1706.03762).
A mixed group (PMID: 36599988; doi:10.1038/nphys1170).
```

These are syntax examples, not scientific claims. Short PMIDs need an explicit prefix, such as `(PMID: 12345)`; ordinary years and formatted citation numbers are left alone.

**During revision:** edit the exported Word file, add new markers outside existing citation controls, and upload it again. Folio refreshes the citations and replaces its reference list. Preserve those controls; to change a citation's sources, replace the whole control with a new marker. [Citation and revision guide →](docs/user-guide.md#generate-and-revise-manuscript-references)

## Keep the original within reach

Open **Read PDF → Reading view** for locally extracted text and figures, section navigation, notes, and highlights. Use **Check original** whenever a passage needs verification. Reading caches work offline and can be removed without deleting the PDF or notes.

Rules cover several Nature-family layouts, Cell Reports, Science Advances, and common article layouts. Extraction remains imperfect for some tables, mathematics, scans, and unusual PDFs; the original stays available. [Reading guide →](docs/user-guide.md#read-pdfs-and-create-reading-views)

## Learn more

[Installation & troubleshooting](docs/install.md) · [Complete user guide](docs/user-guide.md) · [Browser connector](docs/user-guide.md#save-papers-with-the-browser-connector) · [Backup & restore](docs/user-guide.md#back-up-restore-and-move-your-library) · [Optional AI](docs/user-guide.md#ask-a-paper-with-optional-ai)

Folio is an independent early-preview project. It currently has no cloud sync, shared libraries, OCR, or live Word/Google Docs add-in. Review metadata and generated references before submission. Automated source checks cover macOS, Windows, and Linux; this does not establish installer compatibility on every computer.

<details>
<summary><strong>For developers and contributors</strong></summary>

```sh
npm run check          # build, typecheck, and automated tests
npm run dist:desktop   # package locally; does not publish
```

For browser mode, run `npm run build` and `npm start`, then open `http://127.0.0.1:47821/papers`. Stop desktop mode first. For frontend development, keep the local service running and use `npm run dev` in a second terminal.

Report problems with your OS, Folio version, reproduction steps, and error message. Prefer synthetic examples over private papers or manuscripts. Never share your library folder or credentials.

[Release checklist](RELEASE.md) · [Security](SECURITY.md) · [Citation-style notices](CSL-NOTICES.md)

</details>

Source is [MIT-licensed](LICENSE). Dependencies and citation styles retain their own licenses.
