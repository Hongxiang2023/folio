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

## Mac preview installer

The v0.1.0-preview.1 download targets Apple silicon and macOS 13+. It is ad-hoc signed and unnotarized, not a Developer ID release. Include that limitation beside the download and use only Apple's per-app first-launch guidance. Do not promise warning-free installation.

Build from the tagged source with:

```sh
npm ci
npm run build
npx --no-install electron-builder --mac dmg --arm64 --publish never --config.directories.output=release/mac-preview --config.mac.identity=- --config.mac.notarize=false
```

Verify the DMG, mount it read-only, copy its app to a test location, verify the app signature and packaged source, and smoke-test with an isolated library while other Refhaven instances are closed. Include Electron/Chromium notices through `extraResources`. Publish only the DMG and its SHA-256 checksum file as release assets; never upload the staging folder, debug logs, libraries, or keys. Test results describe the tested Mac, not all target machines.
