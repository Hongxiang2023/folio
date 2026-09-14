# Public usability and manuscript revision review

Updated 2026-09-11 after local implementation and API validation. This review
covers source behavior and local automated checks. It does not approve a public
release or claim that native Word and installer workflows have been verified.

## Outcome

The source now supports citations without PMID and reimport of revised,
Refhaven-generated DOCX documents. Keep this a local, single-user application. A
public downloadable preview remains a separate release task; the loopback
service is not a hosted multi-user upload service. Nothing was published or
uploaded during this review.

## Implemented and checked

- Citation identity supports explicit DOI, arXiv and Refhaven local markers alongside
  legacy PMID markers. CSL processor IDs are separate from PMID metadata; internal
  IDs are no longer emitted as fake PMIDs.
- Provider lookup retains richer citation metadata. Temporary request records
  have whitelisted fields, validated identifiers and count/size limits. Preview
  and export do not save records or alter existing library notes.
- Newly generated Word documents carry Refhaven citation/bibliography controls and
  bounded, versioned embedded reference snapshots. Reimport restores source
  identities and regenerates citation order and the owned reference list. Ordinary
  edited prose remains present. Old exports without this metadata still need the
  original marker manuscript.
- Missing metadata, checksum corruption, manually edited citation display, and
  manually edited reference lists produce repair errors. The checksum detects
  accidental changes; it is not proof of authorship or a security signature.
- Existing library/request records take precedence for compatible identities.
  Conflicting identities go through the shared resolver instead of silently
  replacing an embedded reference merely because one alias matches. An existing
  managed citation that cannot resolve prevents Word export.
- Word main-body and table conversion stays local. The conversion endpoints deny
  connector-extension origins, retaining authentication and Host/Origin checks.

`tests/manuscript-api.test.mjs` covers temporary DOI/local preview and export,
request-local metadata, library immutability, offline embedded-record reimport,
ordinary prose revisions, malformed temporary metadata, changed citation display,
corrupt metadata, authenticated injected lookup, identity conflicts and denied
extension conversion, and explicit saving of conference metadata without another
provider lookup. All nine focused API tests passed. These are synthetic
API/package checks, not native Word UI
or visual layout checks. The PM's full build/test run passed 231 tests before the
last focused API additions; rerun totals may increase as tests are added.

## Remaining release gates

1. **Native Word round-trip verification.** Open an export in actual supported
   Word versions, edit surrounding prose, move/delete/copy whole citation controls,
   save, reimport, and switch numeric/author-date styles. Verify controls and the
   custom XML part survive Word saving, renumbering is correct, and exactly one
   bibliography remains. Inspect tables, page breaks, fonts, images and untouched
   package parts. The attempted native UI validation was unavailable because the
   computer-use connection failed; do not represent it as completed.
2. **User-facing workflow validation.** Exercise the updated marker picker,
   DOI/arXiv lookup, lookup-off path, temporary results, explicit library saving,
   unresolved references and revised-DOCX repair errors in the desktop UI. API
   success does not prove these controls are discoverable or correctly presented.
3. **Packaged OS workflows.** Run startup, local storage, citation conversion and
   browser-connector scenarios on every claimed OS. Review signing/notarization
   arrangements and actual installer contents before public binary distribution.
4. **Public source boundary.** Follow `RELEASE.md`: create an isolated repository
   from the Refhaven folder, excluding parent history/game assets, personal papers,
   PDFs, caches, pairing tokens, environment files and backups. Establish a real
   private reporting contact in `SECURITY.md`, check dependency notices/audit, and
   obtain the separate authorization for public publishing.

## Trust and privacy boundaries to retain

Embedded DOCX records are untrusted document snapshots, not instructions to
rewrite a user's library. Conversion must keep them request-local, whitelist
fields, enforce metadata/package limits and never follow external relationships
or arbitrary metadata URLs to recover identity. Existing XML-declaration,
tracked-change and macro guards remain relevant. Preserving unrelated package
parts does not make Refhaven a document sanitizer.

The UI must state that enabled metadata lookup sends identifiers to the selected
fixed providers (PubMed, Crossref or arXiv), while manuscript text and DOCX bytes
stay local. Lookup-off must work for complete saved records and embedded snapshots.
Do not silently substitute full-title or manuscript-passage searches when an
identifier fails. Saving lookup results is a separate explicit action. Optional
paper-chat provider uploads are another user-enabled data flow and must never be
activated by reference generation.

Local library revisions and original manuscript bytes must remain unchanged by
preview/export failures and successes. Export creates a new file. User edits to
metadata remain authoritative when identity agrees; contradictions must be
reported rather than silently changing the work being cited.

Do not infer arbitrary existing Word/Zotero/EndNote formatted citations from their
visible numbers or author names. This is an upload/edit/reimport workflow for
Refhaven-created controls, not a live Word add-in. Keep unsupported document regions
(headers, footnotes, endnotes and text boxes) explicit. No universal style fidelity,
live integration, binary-release readiness or new licensing conclusion follows
from the automated checks recorded here.
