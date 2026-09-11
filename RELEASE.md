# Source release checklist

Publish this `folio/` folder as a new standalone repository. Do not push the parent workspace: it contains unrelated game source and assets.

Included: original app source, connector source, tests, lockfile, documentation, MIT license. Excluded: node_modules, dist, release installers, private library, PDFs, tokens, environment files, parent Git history and all game assets.

1. Run `npm ci` and `npm run check`.
2. Verify desktop startup and a real paper workflow on each supported OS. Install the unpacked connector and test a publisher page, duplicate save, accessible PDF and inaccessible PDF.
3. Review dependency notices and `npm audit` before public binary release. Electron/Chromium and other packages have separate license notices; preserve packager notices in distributed binaries.
4. Confirm the GitHub owner, repository name, public visibility and MIT license with the project owner.
5. Create a new repository from this folder only and upload after that confirmation. Do not carry over parent Git history.
6. Mark version 0.1.0 as an early preview; do not claim Zotero/Paperpile feature parity.

The included workflow runs tests and builds only. Desktop installers are generated locally with `npm run dist:desktop`; it never publishes automatically. macOS notarization and Windows signing are separate release work. No credentials are included.
