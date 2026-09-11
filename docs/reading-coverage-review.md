# Reading coverage design and QA review

Date: 2026-09-11. Scope: local reading-view support for Nature-family journals,
Cell Reports, and Science Advances. This is a design review, not a claim that
every article or historical publisher template has passed visual QA.

## Goal and acceptance

Readers should see continuous article prose, trustworthy section navigation,
complete figure legends, and intact equations without publisher furniture or
figure labels mixed into the body. Original PDFs remain the source of truth.

The implementation scope is journal recognition plus evidence-based layout
handling. It does not include OCR, PDF rewriting, external publication, or
uploading library papers. PM owns implementation; this review covers architecture,
QA criteria, and operational boundaries.

## Current architecture findings

- `readingProfile` already recognizes names starting with Nature, but DOI-only
  routing recognizes only a limited set of Nature journal identifiers. A newly
  recognized journal must not automatically inherit all historical font mappings.
- Cell and Science recognition currently targets the flagship journal, so
  Cell Reports and Science Advances need their own verified signatures.
- `readingColumnSplits` already supports one, two, unequal, and three-column
  geometry. Reuse it before adding publisher-specific column counts.
- Figure extraction has a generic caption path based on typography and graphics.
  The HardingText crop path is a verified template rule, not proof that every
  Nature-family layout uses the same caption or figure placement.
- `organizeSections` synthesizes Results at a later-page subsection after an
  Introduction in the Nature profile. This can mislabel review sections. Broad
  journal recognition should not broaden this inference without article-template
  evidence. Existing behavior exposes subsections only beneath Results; that is
  a product convention rather than general document structure.
- Filtering runs before figure extraction and again in `analyzeJournalPage`.
  Any new filter must be idempotent and preserve inline scientific fragments.

## Recommended conservative implementation

1. Separate family identification, article-template evidence, and layout behavior.
   Treat journal metadata as a hint. Match DOI codes explicitly when known; do
   not classify every `10.1038` DOI as one article template.
2. Remove complete margin rows using matching journal/DOI, date/page signatures,
   and location. For repeated running headers, require agreement across pages;
   a single short scientific heading is insufficient evidence.
3. Determine body typography from repeated long prose lines in established
   columns. A font appearing outside body lines is not sufficient to delete it:
   figures, equations, italics, and footnotes can share that font.
4. Prefer caption/graphic region geometry for removing embedded figure labels.
   Preserve fragments on prose baselines, including raised citations, Greek
   letters, italic genes, mathematical operators, and ligatures.
5. Infer an unlabeled abstract only when a coherent inset or spanning block,
   matching body-family typography, and a separate body region establish it.
   Otherwise retain text and avoid inventing a section boundary.
6. Preserve uncertain content and provide the original-page fallback. Avoid
   shrinking a figure crop when panel extent or caption association is uncertain.
7. Increment the cache layout version for changed output; keep updates explicit
   and retain notes/highlight records. Confirm quote-based highlight relocation
   after paragraph changes, rather than only checking saved record counts.

## Acceptance matrix

| Area | Required evidence |
| --- | --- |
| Journal routing | Each requested journal by name and known DOI; missing metadata and unrelated DOI negative controls |
| Article opening | Complete abstract ending; no author/affiliation leakage; first body paragraph retained; graphical-cover variant |
| Reading order | Both columns checked at the gutter; sparse figure page; one-column ending; three-column regression |
| Scientific text | Inline italic term, citation, exponent, symbol, and ligature retained; real paragraph breaks preserved |
| Figures | Every main figure accounted for; complete legend; multi-page legend; no labels in prose; all panels within preview |
| Equations | Display equations remain accessible and associated with the correct page; inline math remains text |
| Navigation | Explicit headings preserved; no synthetic Results in a review without supporting evidence; references boundary correct |
| Updates | Old cache stays usable; explicit rebuild replaces one file; notes and highlights survive and resolve correctly |
| Responsiveness | Cancel works during extraction; returning to Library aborts generation; no eager cache scan at launch |

Run the existing parser, figures, equations, highlights, cache, and build checks.
For each new template, inspect the first page, a dense body page, a figure/legend
page, and a Methods/end-matter page beside the original. Use assertions on
selected source sentences and figure counts, not snapshots alone. Include one
negative fixture for every deletion rule. One sample validates that sample's
template, not every historical article in the journal.

## Operational privacy and IP review

The authorized work is local parsing and validation. Do not send the user's
library files or extracted text to an external service. Public test-paper
discovery can use publisher pages; record the source URL, journal, article date,
access route, and stated license where provided. Prefer clearly reusable open
fixtures for any future shared test corpus. Keep downloaded papers out of a
public repository unless redistribution permission has been checked; derived
fixtures should be minimal and traceable. No external publishing or licensing
claim is approved by this review. Any later release of a corpus needs a separate
rights review against the actual assets and their terms.

These are operational scope controls, not formal legal advice. The present
change does not introduce payments, probabilities, accounts, analytics, or
collection of real-user data.
