# Reading view layout support

Goal: make scientific PDFs readable without mixing columns, publisher furniture, captions, or figures into prose. This increment addresses the imported Cell paper and adds arXiv computer-science and Genome Biology coverage across publication years. Reading behavior is inferred from geometry and typography; a journal name alone does not establish a page layout.

Scope and acceptance: recover Cell's continuous summary and section order, preserve all six main figure legends including continuations on following pages, and retain the verified Nature and bioRxiv figure/equation inventories. Keep genuine body mentions and references to journals while removing recognized journal headers/footers. Test two- and three-column layouts, partial-width abstracts, tables next to prose, caption continuations, and sparse pages that lack enough independent column evidence. Run parser regressions, application tests, and a production build before packaging.

The parser supports selectable single-column, unequal two-column, and evidence-backed three-column text. A bounded text-layer pass samples up to twelve pages; two agreeing dense pages can provide gutter positions for sparse pages containing narrow-column prose. Spanning text can contain separate italic, citation, or symbol runs. Regional spanning blocks must preserve the reading order of neighboring columns. Nature retains its verified first-page template. Cell cover/front matter, proceedings affiliations, publisher margin signatures, and matching journal mastheads are filtered conservatively. Ordinary scientific footnotes and journal mentions remain.

Figure detection combines caption typography, explicit continuation markers, and known raster drawing transforms. A next-page legend can attach to a preceding figure page without moving its preview. Ambiguous or vector-heavy figures retain a full-page preview rather than an unreliable crop. Display equations use source-image previews; diagram labels containing parenthesized parameters must not become equations.

arXiv is treated as a source of varied publication templates, rather than one journal layout. The new checks cover single-column NeurIPS and two-column CVPR manuscripts, including TeX font fragments and rotated version stamps. Genome Biology checks cover an older two-column article and a newer single-column article with an inset abstract and author sidebar.

## Representative validation corpus

| Layout | PDF used for local QA | Checks |
| --- | --- | --- |
| Cell | Integrative spatial profiling of 3D genome organization and gene expression in tissue | Graphical cover, wide summary, heavy-font subheadings, six figures with continued legends |
| Nature | Non-invasive profiling of the tumour microenvironment with spatial ecotypes | Established figure crops and eleven equation previews |
| Nature Methods | MethSCAn | Verified Nature template and figure retention |
| Nature Biotechnology | Multimodal learning enables chat-based exploration of single-cell data | Journal furniture removal and figure retention |
| bioRxiv / PMLR | Cell2Sentence | Abstract/affiliations, twelve captions, separate figures on a shared page |
| Science, 2003 | Myosin V Walks Hand-Over-Hand | Three columns and side captions; [author-hosted PDF](https://people.physics.illinois.edu/Selvin/PRS/PSCV/PTP/2003/Yildiz%20et%20al%20MyoV%20Science%202003.pdf) |
| Science, 2022 | The complete sequence of a human genome | Sparse three-column pages, two-column-wide abstract/table, five captions; [author-hosted PDF](https://eichlerlab.gs.washington.edu/help/glogsdon/Website/Nurk_et_al_Science_2022.pdf) |
| PLOS Computational Biology, 2024 | DOI 10.1371/journal.pcbi.1012224 | Inset single-column prose, production marks, caption typography; [publisher PDF](https://journals.plos.org/ploscompbiol/article/file?id=10.1371%2Fjournal.pcbi.1012224&type=printable) |
| arXiv / NeurIPS | Attention Is All You Need (1706.03762) | Single column, equations, captions, version stamp; [arXiv](https://arxiv.org/abs/1706.03762) |
| arXiv / CVPR | Deep Residual Learning for Image Recognition (1512.03385) | Two columns, inline figure references, section hierarchy; [arXiv](https://arxiv.org/abs/1512.03385) |
| Genome Biology, 2014 | Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2 | Two columns, numbered and unnumbered formulas, publisher headers; [publisher](https://doi.org/10.1186/s13059-014-0550-8) |
| Genome Biology, 2025 | Biology-driven insights into the power of single-cell foundation models | Boxed abstract, author sidebar, figures and running headers; [publisher](https://doi.org/10.1186/s13059-025-03781-6) |

Known limits: this is representative coverage, not a guarantee for every journal or PDF. Recognized numeric table rows are kept together, but tables remain flattened text; the original PDF is authoritative for cell relationships. Arbitrary vector drawings, complex clipping, scanned pages, and damaged or legacy mathematical character maps still need the original PDF. Equation detection is incomplete, including some numbered equations in the PLOS sample. No OCR or remote document processing is introduced.

Ownership: PM integrates parsing, cache migration, packaging, and delivery; text/layout and figure owners implement their respective rules, with independent QA. Synthetic regression fixtures are committed; source papers and renders remain in ignored scratch storage. No manuscript, annotations, library metadata, or user data is uploaded. Original PDFs and copyright/license notices remain unchanged. Version 13 provides a reading-view refresh; saved notes/highlight quotes are retained, though changed text positions can affect exact highlight anchoring.

Validation outcome: eight representative PDFs were reparsed. Cell retains six main figures with complete continued legends and one continuous summary. Nature ecotypes retains eleven equations; bioRxiv retains twelve figures and eleven equations. Both Science samples retain all detected main captions (six and five); PLOS retains four complete captions. The full 166-test application suite passed, followed by passing targeted regressions for the final table/layout changes and a successful production build. The packaged parser/UI were checked against the production assets. The Cell cache was backed up, refreshed through the local API, and read back successfully with unchanged library records.

Expanded validation outcome: the four added PDFs retain five and seven arXiv figures, nine DESeq2 figures, and six modern Genome Biology figures. Their equation preview counts are 7, 2, 24, and 14 respectively. The modern Genome Biology sample contains eighteen numbered equations; four are still undetected (3, 4, 9, 13), so full equation coverage is not claimed. DESeq2 inline prose and a connective line remain outside equation crops, and the first numbered display retains both lines. The expanded 181-test application suite passes. Earlier Cell, Science, PLOS, bioRxiv, and Nature regression checks retain their verified inventories; a bioRxiv crop regression found during QA was corrected.

Final preview check: ResNet axis-label descenders are retained inside Figure 1 and excluded from prose. The final 23 figure/parser integration tests and production build pass after this adjustment. The combined app is staged in the hidden release directory pending closure of the running app; no additional Launchpad installation was created.

## Nature Communications correction (layout 14)

Reader problem and goal: scEpiAge (10.1038/s41467-024-51833-5) had a split abstract, interleaved publisher marks, chart labels in prose, and missing subheadings. Scope is local reading extraction and cache responsiveness; original PDFs, library metadata, notes, highlights, and AI consent are unchanged. PM owns parser integration; technical/QA review owns cache compression and independent regression review. No external publishing or data transfer is introduced.

The older Communications template uses encoded AdvOT faces. Layout 14 recognizes its inset abstract and bold section face, with journal/DOI and typography checks. Rotated production marks and complete margin footer signatures are excluded; identified figure faces stay out of body text while inline symbols remain. Unknown templates retain the generic fallback. Five figure legends and full-page previews are retained; imperfect PDF ligatures and equation detection remain known limitations.

Acceptance: continuous abstract followed by introduction; clean column order without journal footer interruptions; the full ageing-related Results subheading; all five figure legends retained. Validation uses the local 15-page PDF, original-page renders, full parser output, synthetic regressions, and independent QA. The 186-test suite passed; final scoped parser checks and production build also run after the last figure-font adjustment. Source PDFs and QA renders remain in ignored scratch storage.

Cache/startup decision: each distinct PDF has one compressed cache, overwritten on regeneration. Cache contents are fetched only when opening that reading view; startup loads library metadata, and storage totals are scanned only in Settings. Accumulation therefore adds disk usage, not bulk cache loading on launch. This is a code-path finding, not a launch-time benchmark. Compression/decompression now uses asynchronous zlib; JSON parsing/serialization still runs synchronously. Existing size limits, atomic replacement, deletion semantics, and cache-free backups remain unchanged. Rebuilding the desktop app is required for the server compression change to reach an already packaged installation.

## Expanded journal families (layout 15)

See [expanded journal reading views](reading-journal-coverage.md) for the current scope, representative five-journal corpus, retained STAR Methods, shared margin detection, caption corrections, regression results and remaining limitations. Layout 15 supersedes the previous update banner; individual cache refreshes remain explicit.
