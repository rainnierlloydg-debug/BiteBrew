# Bite & Brew GitHub handoff

Canonical repository: https://github.com/rainnierlloydg-debug/BiteBrew.git

Use **main** for a new clone. `Bite-Brew.git` is an obsolete link and returned Repository not found during the November 18, 2026 audit.

## Verified remote state (November 18, 2026)

The remote default branch is `main`. Its checked commit is `4ea1cef00c0637a08bbf5c4c2790bcd9b8004234` (Improve browser notification tests and push diagnostics). The remote Rainnier, Vonn, Macky and Zyreen branch tips are all ancestors of this main commit; their published contributions are already integrated. Future updates should be checked with Git rather than assuming this dated commit remains latest.

The local frontend and public UI source files matched remote main during this audit. Uncommitted deployment preparation and new documentation are separate local changes; a clone cannot contain unpublished edits.

## Fresh clone

```powershell
git clone --branch main https://github.com/rainnierlloydg-debug/BiteBrew.git
cd BiteBrew
npm.cmd --prefix node-app ci --include=dev
```

Follow the root README for MySQL setup, owner creation, menu seeding and `npm.cmd start`. The runtime application is in `node-app`; PHP/Laravel/Herd is not required. Open the configured Node application origin, normally http://127.0.0.1:3000.

## Existing clone

First save or commit any local work, then:

```powershell
git remote -v
git switch main
git pull --ff-only origin main
npm.cmd --prefix node-app ci --include=dev
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd start
```

Existing installations keep their own private `.env` and database. Do not rerun one-time setup over existing data. `npm start` rebuilds React before starting Node. If the origin already has an installed PWA, save pending drafts, apply an offered update and reload. If an older server is running, stop it before starting this checkout.

## Source versus data

Git shares source, migrations and supplied seed assets. It does not copy private `.env` configuration, installed packages, generated React bundles, MySQL business records, uploaded photos, browser cache or IndexedDB drafts. Run the documented build/setup commands. Matching a teammate's customized menu/accounts/transactions requires an intentional database/media transfer or a shared hosted environment.

`docs/github-source-manifest.json` is a historical source inventory, not the manifest of the current main version. The older screenshots under `docs/verification-artifacts` are historical evidence and should not be used to identify the current UI version.
