# Pag-clone at pag-update ng Bite & Brew

Tamang repository: **https://github.com/rainnierlloydg-debug/BiteBrew.git**

Gamitin ang **main** branch. Ang `Bite-Brew.git` sa lumang handoff ay hindi ang tamang repository.

## Bagong clone

Sa PowerShell:

```powershell
git clone --branch main https://github.com/rainnierlloydg-debug/BiteBrew.git
cd BiteBrew
npm.cmd --prefix node-app ci --include=dev
```

I-start ang MySQL. Default ng automatic setup ay `127.0.0.1:3308`. Kung nasa port 3306 ang MySQL mo, itakda muna:

```powershell
$env:MYSQL_SETUP_PORT = '3306'
```

Para sa bagong installation na wala pang app `.env` at target databases:

```powershell
npm.cmd run setup:local
npm.cmd run admin
npm.cmd run seed:menu
npm.cmd start
```

Hihingin ng admin command ang pangalan at email. Ginagamit nito ang configured default initial staff password maliban kung may `ADMIN_PASSWORD` sa environment. Hindi nito pinapalitan ang existing accounts. Buksan ang **http://127.0.0.1:3000**, o ang eksaktong `APP_ORIGIN` sa `node-app/.env`.

Ang `setup:local` ay para sa bagong installation; hindi nito nire-reset ang existing database. Para sa custom credentials at ports, sundan ang [root README](../README.md). Node.js ang runtime; hindi kailangan ang PHP, Laravel o Herd.

## May existing clone na

1. Itigil ang Node server gamit ang Ctrl+C sa terminal na nagpapatakbo nito.
2. I-check ang local work gamit ang `git status`. I-save o i-commit ang sariling changes bago mag-update.
3. Sa loob ng tamang checkout, patakbuhin:

```powershell
git remote -v
git switch main
git pull --ff-only origin main
npm.cmd --prefix node-app ci --include=dev
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd start
```

Kung tumanggi ang Git dahil may conflict o hindi fast-forward, ipa-review ang local commits. Huwag burahin ang local work o database para lang mag-update.

Panatilihin ang sariling `node-app/.env`. Huwag ulitin ang one-time setup sa existing installation. Awtomatikong bina-build ang React bago mag-start ang Node server.

## Paano i-check ang version

```powershell
git remote get-url origin
git branch --show-current
git fetch origin
git rev-parse --short HEAD
git rev-parse --short origin/main
git rev-list --left-right --count HEAD...origin/main
```

- Dapat `BiteBrew.git` ang remote at `main` ang branch para sa integrated version.
- Magkaparehong HEAD at origin/main hash, at `0 0` na commit difference, ang tanda na pareho ang committed version.
- I-check din ang `git status`: hindi kasama sa commit comparison ang uncommitted edits.
- Siguraduhing mula sa in-update na checkout tumatakbo ang server. Itigil ang lumang server bago mag-start ng panibago sa parehong port.
- Kung luma pa rin ang screen, i-save o i-sync muna ang offline drafts, i-apply ang PWA update kapag may prompt, at mag-refresh gamit ang Ctrl+F5. Maaaring mawala ang unsent drafts kapag binura ang lahat ng browser site storage.

## Bakit puwedeng magkaiba ang data kahit pareho ang code

Source files, migrations at supplied seed assets ang kinokopya ng Git. Hindi nito kinokopya ang MySQL records, customized prices, staff/customer accounts, transactions, uploaded photos, private `.env`, o device-local IndexedDB drafts ng ibang computer.

Ang `seed:menu` ay starting menu, hindi backup ng customized database. Kung kailangang pareho ang records at photos, kailangan ng database/media transfer o shared hosted system. Panatilihing private ang credentials at database backups.

Ang lumang screenshots sa root `docs/verification-artifacts` at ang `docs/github-source-manifest.json` ay historical evidence/inventory. Hindi sila ang reference ng current UI o current file hashes.
