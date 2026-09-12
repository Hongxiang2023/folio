<p align="center">
  <img src="assets/icon.png" alt="Folio logo" width="88" height="88">
</p>
<h1 align="center">Folio</h1>
<p align="center"><strong>Your papers. Your notes. Your next manuscript.</strong></p>
<p align="center">A free, local-first reference manager for reading papers and writing manuscripts.</p>
<p align="center">
  <a href="https://github.com/Hongxiang2023/folio/releases/download/v0.1.2-preview.1/Folio-0.1.2-arm64.dmg"><strong>Download for Mac</strong></a> &nbsp;·&nbsp;
  <a href="https://hongxiang2023.github.io/folio/demo/">Interactive demo</a> &nbsp;·&nbsp;
  <a href="docs/user-guide.md">User guide</a> &nbsp;·&nbsp;
  <a href="https://hongxiang2023.github.io/folio/">Website</a>
</p>

[![Folio reading walkthrough: highlighted article text, a figure, five highlight colors, and a saved passage note. Click to open the interactive demo.](docs/assets/preview-reading.png)](https://hongxiang2023.github.io/folio/demo/#read)

<p align="center"><em>Illustrated preview with fictional data.</em> Click the image to try highlighting and adding a sample note.</p>
<p align="center">
  <a href="https://hongxiang2023.github.io/folio/demo/#organize">Explore the library</a> &nbsp;·&nbsp;
  <a href="https://hongxiang2023.github.io/folio/demo/#read">Read & annotate</a> &nbsp;·&nbsp;
  <a href="https://hongxiang2023.github.io/folio/demo/#revise">Cite & revise</a> &nbsp;·&nbsp;
  <a href="https://hongxiang2023.github.io/folio/demo/#cloud-folder">Cloud-folder storage</a>
</p>

## From saved paper to revised manuscript

- **Collect & organize.** Import PDFs and references, look up PMID/DOI/arXiv metadata, or capture a paper from Chrome or Edge. Use collections, tags, stars, and reading status.
- **Read & annotate.** Keep article text and figures together. Use five highlight colors and passage notes, with the original PDF a click away. Reading caches are removable.
- **Cite & revise.** Generate references from identifiers, export Word, then upload your edited document to refresh citations and the bibliography. Preserve Folio’s citation controls between revisions.
- **Choose your storage.** Keep your library local or move it to a folder managed by OneDrive, Google Drive, or Box. After upload, use your provider’s online-only controls for PDFs.

No Folio account, subscription, or analytics. Your library is local by default; cloud-folder storage is optional. Identifier lookup and optional AI use external services for their respective tasks. AI uses your own connection and requires per-paper enablement. [Privacy & security](SECURITY.md)

## Download & install

**[Download Folio for Mac · Apple silicon (.dmg)](https://github.com/Hongxiang2023/folio/releases/download/v0.1.2-preview.1/Folio-0.1.2-arm64.dmg)**

macOS 13 or newer. No Node.js or Terminal needed.

1. Open the downloaded `.dmg`.
2. Drag **Folio** into **Applications**. Quit an older Folio before replacing it.
3. Open **Folio** from Applications, then eject the disk image.

**Early preview:** Folio is not yet Developer ID-signed or Apple-notarized. If macOS blocks first launch and you trust this download, follow the [first-launch instructions](docs/install.md#if-macos-blocks-the-first-launch). Keep normal macOS security protections enabled.

**Intel Mac, Windows, or Linux:** [Run from source](docs/install.md#source-installation). Installers for these platforms are not provided yet. [Check your Mac & installation help](docs/install.md#macos)

## A PMID is enough

```text
One source (36599988).
Several sources (36599988, 40903587).
A CS paper (arxiv:1706.03762).
```

Paste text or upload Word, choose a citation style, and select **Generate references**. Modern numeric PMIDs work directly; no prefix is needed. Missing identifiers can be looked up automatically. These examples illustrate syntax, not scientific claims.

**Revising?** Edit the exported Word file, add new markers outside existing citation controls, and upload it again. Folio refreshes the citations and replaces its managed bibliography. [See the revision workflow](https://hongxiang2023.github.io/folio/demo/#revise)

<details>
<summary><strong>DOIs, mixed groups, short PMIDs, and papers without identifiers</strong></summary>

```text
A DOI source (doi:10.1038/nphys1170).
A mixed group (PMID: 36599988; doi:10.1038/nphys1170).
A short PMID (PMID: 12345).
```

For a saved paper without a public identifier, use **Copy citation marker** to obtain its `(folio:...)` marker. Ordinary years and already formatted citation numbers are left alone.

To change a citation’s sources during revision, replace its entire citation control with a new marker. Correct reference metadata in Folio, then regenerate. Plain formatted numbers do not retain reference identities. [Complete citation guide](docs/user-guide.md#generate-and-revise-manuscript-references)

</details>

## Explore a little further

| I want to… | Start here |
| --- | --- |
| Try the real app with fictional papers | [Hands-on demo & sample files](docs/demo.md) |
| Read, highlight, and add notes | [Reading guide](docs/user-guide.md#read-pdfs-and-create-reading-views) |
| Capture a paper from my browser | [Chrome/Edge connector setup](docs/user-guide.md#save-papers-with-the-browser-connector) |
| Save local disk space | [Cloud-folder guide](docs/user-guide.md#use-a-cloud-provider-folder) |
| Back up or restore my library | [Backup & restore](docs/user-guide.md#back-up-restore-and-move-your-library) |
| Use my own AI connection | [Optional paper chat](docs/user-guide.md#ask-a-paper-with-optional-ai) |

Folio is an independent early-preview project. PDF extraction can be imperfect; verify important passages against the original. Review metadata and generated references before submission. Cloud folders use your provider’s desktop app and do not support simultaneous shared-library editing. There is no OCR or live Word/Google Docs add-in.

<details>
<summary><strong>For developers and contributors</strong></summary>

Install [Node.js LTS](https://nodejs.org/en/download) (22.13 or newer). Clone this repository or [download the source ZIP](https://github.com/Hongxiang2023/folio/archive/refs/heads/main.zip), then run these commands in the folder containing `package.json`:

```sh
npm ci
npm run desktop
```

The source ZIP is project code, not the Mac installer. [Step-by-step source setup](docs/install.md#source-installation)

```sh
npm run check          # build, typecheck, and automated tests
npm run dist:desktop   # package locally; does not publish
```

For browser mode, run `npm run build` and `npm start`, then open `http://127.0.0.1:47821/papers`. Stop desktop mode first. For frontend development, keep the local service running and use `npm run dev` in a second terminal.

Automated source checks cover macOS, Windows, and Linux. The downloadable preview targets Apple silicon Macs only.

Report problems with your OS, Folio version, reproduction steps, and error message. Prefer fictional examples over private papers or manuscripts. Never share your library folder or credentials.

[Release checklist](RELEASE.md) · [Security](SECURITY.md) · [Citation-style notices](CSL-NOTICES.md)

</details>

Source is [MIT-licensed](LICENSE). Dependencies and citation styles retain their own licenses.
