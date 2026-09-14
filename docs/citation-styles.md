# Expanded citation styles

Goal: let readers format manuscripts for journals and other citation conventions available in Zotero's CSL repository, without uploading manuscripts or requiring a Zotero account. Scope: installed-style search, explicit repository search and installation, custom CSL import, offline persistence, compatible in-text citation formatting and Word export. Footnote/endnote styles are excluded because this workflow does not create citation notes.

In Manuscript references, choose **Get more styles**, search by journal or style name, and install a result. The style becomes selected immediately. A local `.csl` file can also be imported. Installed styles are kept in Refhaven's data directory under `citation-styles/` and included in library backups. Nine styles are bundled and immediately available offline: APA, Vancouver, Chicago author-date, Nature, Science, Cell, The New England Journal of Medicine, IEEE, and Nature Medicine. The full repository is not bundled or downloaded on startup: catalog retrieval is explicit, filtering happens locally, and only selected style/parent/locale files are downloaded. Once installed, formatting is local and works offline. The catalog is cached locally; the initial version does not automatically update installed styles.

The citation engine resolves dependent journal styles to their parent formatting rules while preserving the journal style's name and source XML. Default locales, including child-style overrides, are downloaded and cached as needed. XML files retain their original attribution and license notices; see CSL-NOTICES.md. Word citation output now retains superscript, subscript, italic, bold, and small-cap formatting while preserving surrounding document runs. Output remains formatted text, not live Zotero Word fields. CSL paragraph spacing and all publisher-specific document layout requirements are not guaranteed; inspect the resulting manuscript before submission.

Technical and privacy review: repository downloads use fixed HTTPS hosts and validated slugs, reject redirects, and enforce timeouts and streamed size limits. Arbitrary parent URLs, external XML entities, malformed XML, missing/recursive macros, unsupported note styles, and excessive complexity are rejected. Parent chains and locale counts are bounded. Styles are rendered with a synthetic reference before atomic persistence. Install state is isolated per library. Browser connector extensions cannot manage styles. No manuscript, bibliography metadata, API credentials, or chat history is sent to the style repository.

Acceptance: verify real numeric and author-date styles, dependent aliases and locale overrides; preserve superscript citations in Word; survive offline restart; reject malformed or hostile imports without modifying installed styles; maintain existing citation and document regressions; rebuild the desktop app so the feature is available beyond the development source.

The desktop runtime includes existing operating-system certificate authorities alongside Node defaults for HTTPS downloads. Certificate chain and hostname verification remain enabled; Refhaven installs no certificates.

## PMID lookup and library saving

The reference generator offers two separate choices: **Look up missing PMIDs** (on by default) and **Save looked-up papers to my library** (off by default, available only with lookup enabled). The goal is to format references without growing the library unintentionally. Disabling lookup uses only existing library records. Saving remains explicit and uses the existing capture/deduplication workflow.

Lookup-only metadata lives in the open generator's memory and is included in local preview and export requests. It is discarded when the generator closes, without changing the library, its revision, or backups. Repeated generation can reuse metadata while the generator stays open. Existing library records take precedence over temporary records with the same PMID. At most 100 missing PMIDs are looked up per generation. Failed lookups stay unresolved and block Word export; a failed optional save does not discard successfully retrieved reference metadata.

Acceptance covers pasted text and uploaded Word manuscripts, previews, plain-text and Word exports, explicit saving, duplicate PMIDs, invalid/oversized metadata, and library persistence. Client/server implementation owns the workflow; QA independently covers API regressions. Privacy review: PubMed receives identifiers only; manuscript text and temporary citation metadata go only to Refhaven's authenticated local server. No new external service, durable citation cache, or change to CSL formatting is introduced.

## Paper links and PubMed records

A PubMed URL identifies an indexing record. It is useful for checking metadata, but it need not be the URL printed in a journal reference. Refhaven now supplies a normalized DOI and its `https://doi.org/...` link when available, followed by an existing article URL. It does not guess a publisher URL from a title. The selected CSL style still decides whether and how to print that information; a complete Nature-style journal reference may legitimately omit a URL.

PubMed-only URLs remain available as record links in the library and as a last-resort BibTeX locator. They are not supplied as article URLs to the formatted bibliography. If no DOI or article link is known, Refhaven warns you to review the metadata; do not invent a DOI to remove the warning. Add a verified article URL in **Reference details → Edit → Article URL** when appropriate. PMC full-text links are not treated as PubMed indexing records.

An arXiv preprint keeps its explicit arXiv version link; a related published-paper DOI is not used to relabel that preprint's bibliography entry. Verify the version you intend to cite, including authors, year, journal/proceedings, volume, pages or article number. A working link alone does not establish that every field is correct.

Existing saved records and Word citation controls are preserved. Upload an intact revised Refhaven Word document and regenerate its references to apply the corrected link selection. This update does not rewrite previously downloaded documents automatically.

Reference guidance: [Crossref DOI display recommendations](https://www.crossref.org/display-guidelines/) and [Nature formatting guide](https://www.nature.com/nature/for-authors/formatting-guide).
