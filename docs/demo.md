# Try Refhaven with fictional data

This demo has two parts: a clickable illustration that needs only a browser, and a hands-on exercise in the real app. All included references, prose, authors, and diagrams are synthetic. No private library, real paper PDF, account, or API key is included.

## Click through the walkthrough

Use the [live walkthrough](https://hongxiang2023.github.io/folio/demo/), or download the project and open [`demo/index.html`](demo/index.html) in your browser. GitHub shows HTML source rather than executing it, so open the downloaded file locally. It is self-contained and works without a server, build, network request, or account.

The eight stops cover collecting, organizing, reading, optional AI, citing, revising, the connector, and backups. Buttons change the illustration or show the next operation. This is **not the Refhaven app**, a live screenshot, an actual AI answer, or a functional citation engine. It writes no data and makes no network requests.

## Hands-on demo in an isolated library

Run this from a source checkout with Node.js 22.13 or newer. First quit other Refhaven instances so port 47821 is free. You will create a separate temporary library rather than importing demo records into your existing one.

On macOS/Linux:

```sh
npm ci
npm run build
FOLIO_DEMO_DIR="$(mktemp -d)"
printf 'Demo library: %s\n' "$FOLIO_DEMO_DIR"
FOLIO_DATA_DIR="$FOLIO_DEMO_DIR" npm start
```

On Windows PowerShell:

```powershell
npm ci
npm run build
$folioDemoDir = Join-Path ([System.IO.Path]::GetTempPath()) ("folio-demo-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $folioDemoDir | Out-Null
$env:FOLIO_DATA_DIR = $folioDemoDir
Write-Host "Demo library: $folioDemoDir"
npm start
```

Open **http://127.0.0.1:47821/papers**. Confirm the temporary path in **Library & connector** before importing anything. Installation needs internet; the following library/citation exercises work offline once built.

### 1. Import and organize three references

1. Choose **Import references** and select [`demo/folio-demo-references.json`](demo/folio-demo-references.json).
2. Check that three fictional titles appear under **Demo collection**.
3. Search for `fictional`, filter by Reading, and open Starred.
4. Create another collection, move a reference to it, and change its reading status.
5. Add a note and wait for **Saved**. Try **Copy BibTeX citation**.

Expected: search and organization update immediately. The computing reference is a conference paper with no public identifier. **Copy citation marker** gives it `(folio:demo-computing)`.

### 2. Generate references without PubMed or internet

1. Choose **Generate references** and paste [`demo/manuscript.txt`](demo/manuscript.txt).
2. Turn off **Look up missing identifiers**.
3. Select **Nature** or **Vancouver**, then **Generate references**.
4. Verify two unique bibliography entries from the three citation locations. The grouped marker cites both fictional papers.
5. Download Word and open it in your editor. You can also try APA and inspect author–date formatting.

Expected: all local markers resolve from the demo library; repeated references do not create duplicate bibliography entries. The third imported paper is not cited until the next exercise.

### 3. Revise the exported Word file

1. Keep a copy of your first export.
2. In Word, add `(folio:demo-revision)` to the sentence indicated in the manuscript, outside existing citation controls. Add or edit ordinary prose if desired.
3. Save the edited `.docx`, then upload it back into **Generate references**.
4. Generate and download again, with lookups still off.

Expected: the bibliography contains three unique references and only one managed reference list. Existing and new citations are refreshed together. You can choose APA to try changing styles during revision. Do not manually rewrite the generated citation text or bibliography; [the user guide](user-guide.md#revise-an-exported-word-document) explains replacing a whole citation control.

### 4. Read a synthetic PDF, save a highlight, and inspect a figure

1. Open [`demo/sample-paper.html`](demo/sample-paper.html) in a browser. Use **Print / save as PDF**, or your browser's Print command, to save a local PDF. Leave it as selectable text; do not take screenshots.
2. In Refhaven, select **Designing a calmer research reading workflow**, choose **Edit**, attach that PDF, and save.
3. Choose **Read PDF → Reading view → Generate reading view**.
4. Navigate between sections/pages, select a passage, choose **Highlight selection**, and add a note.
5. If Figure 1 is detected, try the figure navigator, zoom, and **Check original**. PDF encoding and pagination depend on your browser; imperfect figure detection is a reason to use the original view.
6. Remove the reading cache and confirm that the original PDF, notes, and saved highlight remain. Generate again if desired.

Expected: a real locally generated reading view of the synthetic article. This is not a parser benchmark or a promise that all publisher layouts work.

### 5. Explore optional connections deliberately

The clickable walkthrough illustrates AI and connector setup without external calls. These live features need user-supplied access:

- **AI:** follow [Ask a paper](user-guide.md#ask-a-paper-with-optional-ai), connect your own account/key, and explicitly enable the synthetic paper if you want to test a live answer. Provider billing/limits apply. The example question is “Which statements are illustrative rather than measured results?” The included walkthrough's sample reply is fixed demonstration text, not a model output.
- **Connector:** follow [connector setup](user-guide.md#save-papers-with-the-browser-connector). Use an article you may access, save its reference, and optionally attach its PDF. This is an optional online exercise; it is not needed to complete the offline demo.
- **More styles:** try **Get more styles** and search/install an in-text style online, or import your own CSL file. Bundled styles work offline.

### 6. Export, back up, and finish

Choose **Export references** for metadata-only JSON. In **Library & connector**, download a full compressed backup and inspect the extracted archive: the attached PDF and reference data are included; reading caches and private connector/provider credentials are excluded.

Stop the server with `Ctrl+C`. On Windows, also run `Remove-Item Env:FOLIO_DATA_DIR` before launching Refhaven normally from that shell. The macOS/Linux command above scoped the override to the demo process. Your ordinary library was never selected by this exercise. Keep or delete the printed temporary demo folder using your file manager after the service is stopped.

## Numeric PMID and mixed-source examples

The offline demo uses fictional local IDs so it never assigns invented metadata to real publications. In a real manuscript, modern PMIDs can be typed directly:

```text
One source (36599988).
Two sources at one location (36599988, 40903587).
A short PMID needs its prefix (PMID: 12345).
A mixed group (PMID: 36599988; doi:10.1038/nphys1170).
An arXiv source (arxiv:1706.03762).
```

These are syntax examples only. To try them live, use a separate text session and enable lookup; providers receive the identifiers. Ordinary years such as `(2024)` are not converted. You do not have to type `PMID:` for the two eight-digit examples.

## Reproducibility and boundaries

The JSON and text files are plain, reviewable source assets. The sample paper is printable HTML. The walkthrough has no remote dependencies, tracking, local storage, or authentication. All content is original synthetic material under the repository's license. It is safe to share these demo files; do not substitute private files or credentials when publishing a reproduction.
