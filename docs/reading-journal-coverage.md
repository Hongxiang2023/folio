# Expanded journal reading views — layout 15

## Goal and scope

Readers can generate local, reusable reading views across journals without waiting for a separate parser for each journal. This increment expands Nature-family metadata recognition and validates Nature Computational Science, Nature Cell Biology, Nature Machine Intelligence, Cell Reports and Science Advances. Full Nature journal names use the shared Nature profile; common Nat. abbreviations and the verified DOI stems for the three new Nature samples are recognized too. All other selectable-text PDFs continue to use the general geometry parser.

This is template coverage, not a guarantee for every journal, publication year, article type or PDF. Unknown fonts and ambiguous graphics retain conservative fallbacks. OCR, structured table reconstruction, and exhaustive equation recognition are outside this increment. No subscription, AI service, remote PDF processing or startup cache scan is added.

## Behavior and acceptance

- Repeated running headers and footers can be learned from at least three agreeing pages in the existing bounded twelve-page layout sample. Only the outer margins qualify; matching text in the scientific body is retained.
- Nature's shared inset abstract stays continuous. Wrapped run-in headings retain short endings when font, size and geometry agree; different heading styles and emphasized prose remain separate. Dense table emphasis no longer generates gene-name section entries.
- Cell Reports retains its continuous full-width summary and restores STAR Methods after references, including the legacy plus-shaped extraction of the star glyph. Full Methods remains reachable after an earlier Methods overview. Bold italic method subsections remain navigable. Compound panel labels and spanning legends preserve complete caption text and inline sample sizes.
- Science Advances retains a continuous abstract, two-column body and Methods subsections. Its verified copyright sidebar, spaced masthead, rotated download mark and dated footer are excluded from reading prose.
- Reviews identified by journal name or page label do not acquire an invented Results section. Methods and Discussion can retain real typographic subsections.
- Existing caches remain usable. The Update reading view action regenerates one PDF's cache with layout 15. Source PDFs, saved notes and highlight quotes are preserved; changes in paragraph positions can affect exact highlight anchoring.

## Representative new PDFs

All examples below are published 2024 templates, inspected using original-page renders and complete parser output. Their public PDFs remain in ignored local QA storage and are not distributed with Folio.

| Journal | Sample / source | Pages | Detected figures |
| --- | --- | ---: | ---: |
| Nature Computational Science | [Geometry-dependent solution operators](https://www.nature.com/articles/s43588-024-00732-2) | 17 | 6 |
| Nature Cell Biology | [Aldehyde-induced DNA–protein crosslinks](https://www.nature.com/articles/s41556-024-01401-2) | 37 | 16 (6 main + 10 Extended Data) |
| Nature Machine Intelligence | [Ensemble-based phenotyping](https://eprints.whiterose.ac.uk/215244/) | 29 | 8 (3 main + 5 Extended Data) |
| Cell Reports | [NBAtlas](https://biblio.ugent.be/publication/01JAYTHXK4S1Y6KAWKTEPZ1E2W) | 26 | 6 |
| Science Advances | [Keeping Mars warm with nanoparticles](https://knowledge.uchicago.edu/records/30chh-pt253) | 6 | 3 |

The three new Nature PDFs preserve all baseline prose tokens across 83 pages and all 30 figure objects. Cell Reports figures 2 and 5 now retain their full panel legends and inline sample counts. Its previously omitted STAR Methods pages 22–26 are retained. Science Advances uses full-page previews for ambiguous vector figures.

Five previously supported local samples were also reparsed: Nature spatial ecotypes (49 pages, 17 figures, 11 equation previews), bioRxiv Cell2Sentence (27/12/11), Nature Biotechnology chat-based single-cell exploration (25/9/0), Nature Methods MethSCAn (23/10/13), and Nature Communications scEpiAge (15/5/1). Figure counts stayed unchanged and no existing legend was materially shortened. These equation counts describe detected previews, not complete mathematical coverage.

## Quality and remaining limits

The 202-test application suite and production build passed, followed by 43 focused regressions after the final repeated-Methods navigation correction. Tests cover missing/abbreviated metadata, nonmatching journal controls, repeated-margin safeguards, retained body text and symbols, table boundaries, wrapped headings, reviews, long abstracts, caption completeness, STAR Methods recovery and existing cache/highlight behavior.

Tables remain flattened text; especially Cell's multi-page key resource tables require the original PDF to interpret column relationships. A graphical abstract on a cover is available in the original rather than a dedicated figure preview. Adjacent nested method headings can share a navigation entry, and isolated caption-credit glyphs or difficult ligatures can remain in reading prose. Scanned PDFs, unusual layouts and complex equations still need the original.

## Ownership and operational review

PM owns scope and parser integration. Nature and Cell/Science QA independently inspected the new samples; the figure owner implemented caption corrections; independent QA added positive and negative regressions. The architectural and privacy/IP review is recorded in [reading-coverage-review.md](reading-coverage-review.md). Public downloads are used only for local validation; no user-library files or extracted text were uploaded. The app update is local and does not publish Folio or its test corpus.

Desktop delivery: the locally signed layout-15 app replaced the existing release/mac-arm64/Folio.app after Folio was observed closed. Signature verification and byte-for-byte production-asset checks passed before and after replacement. The previous app bundle is preserved in release/.journal-coverage/previous-bundle for rollback. Folio was left closed; existing library records and caches were not rewritten during installation.
