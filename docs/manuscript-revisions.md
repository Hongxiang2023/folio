# Multi-identifier manuscript revision brief

Goal: let researchers cite papers outside PubMed and revise previously generated references through the existing Word upload/export workflow.

Scope: explicit PMID, DOI, arXiv and local Folio markers; DOI/arXiv metadata lookup; structured conference/preprint metadata; portable citation snapshots; retained/new citation regeneration and bibliography replacement. Public hosting and live Word add-ins are separate work. User confirmed upload/export on 2026-09-11.

Acceptance: legacy PMID behavior remains, aliases deduplicate, normal numbers remain prose, unresolved/conflicting sources block export, library-only and document-only references work offline, source files and library remain unchanged during conversion, malformed metadata fails safely, tests/build pass. Actual Word edit/save/reimport and distribution checks must precede public compatibility claims.

Ownership: PM owns UI/API integration; citation engineering owns marker/CSL/provider code; document engineering owns DOCX roundtrip; QA/compliance reviews integration and public release boundaries.

Risk: editors may strip content controls/custom XML, provider metadata can be incomplete, older Folio files do not contain identities, and ambiguous imported metadata cannot safely be guessed. Preserve originals and explain repair steps. Only requested public identifiers leave the local reference generator; cited bibliographic snapshots travel in the exported file.

## Word save and PubMed retry regression (2026-09-11)

A user-provided Word-saved revision demonstrated two normal editor transformations: renamed custom XML parts and bibliography whitespace normalization. Folio now follows safe internal custom XML relationships and identifies its namespace; future exports store the original bibliography text, and older bundled-style exports require a reconstructed exact checksum before accepting whitespace-only changes. Reference text edits still fail validation. The actual revised document processed its new PMID into three citation clusters and seven references, then reimported offline in a second style. Both input files remained byte-for-byte unchanged; private documents were not added to source fixtures.

PubMed now retries HTTP 429/502/503/504 up to three attempts, respects Retry-After with a shared cooldown, and bounds waiting. Permanent failures and invalid identifiers are not retried. The UI distinguishes unresolved lookups from identifier mistakes and only shows the temporary-record capacity message when relevant. Live checks of the reported and newly added PMIDs succeeded; deterministic tests cover throttled responses.
