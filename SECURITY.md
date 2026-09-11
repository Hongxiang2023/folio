# Security and privacy

Folio is a single-user loopback desktop service, not a network or multi-user server. It binds to 127.0.0.1, checks Host/Origin and requires a per-install key or a same-origin session cookie for API access. Browser connector access requires explicit pairing. Treat its key like access to the library; a process already running as the same OS user can read local files.

No remote PDF fetch occurs in the library service. The extension fetches the publisher URL only with requested browser host permission. PDFs and metadata are untrusted inputs. Electron's renderer has no Node integration, uses context isolation and sandboxing, and loads local app code. Keep Electron and dependencies updated.

Do not expose the port through a reverse proxy. Do not commit library data, publisher PDFs, pairing keys or backups. Report a security defect through [GitHub private vulnerability reporting](https://github.com/Hongxiang2023/folio/security/advisories/new). Do not post tokens, private papers, or library files in a public issue.
