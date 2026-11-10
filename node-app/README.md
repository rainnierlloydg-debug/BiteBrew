# Bite & Brew Order and Sales Management System

Express 5, Node.js 22.12+, Prisma 6, MySQL 8 and React 19. The frontend and API share one origin. esbuild produces the local React runtime; no PHP or Laravel runtime is required.

**Verification status:** all 35 automated tests pass, including real MySQL/API and authenticated WebSocket integration. Owner, cashier and kitchen restrictions are tested; live push delivery, restore drills and device-specific checks remain outstanding. See [verification](docs/VERIFICATION.md) for exact results and remaining acceptance checks. Do not use this release for business transactions until those checks pass.

## React frontend

The landing page, catalog and customer account screens are React components in `frontend/components/`. Staff pages, product dialogs, cart and chat render React elements through `frontend/markup.jsx`, retaining the existing controllers and form bindings. This compatibility layer converts application-owned, escaped templates into React elements; it does not use `dangerouslySetInnerHTML`. Native browser dialogs, session handling, APIs, CSS, storage keys and business calculations retain their existing behavior.

Run `npm run build` after source changes. It bundles React locally into `public/assets/react-runtime.js`, regenerates the PWA cache version, and requires no CDN. Generated assets are ignored by Git. `npm start`, `npm run dev` and browser checks build automatically first. The existing URLs (`/`, `/staff.html`, `/customer.html`) are preserved.

## Local installation

Run from this directory (`node-app`). Keep the original MySQL database and the preserved business files in `var/import` until migration has been independently checked.

```powershell
npm install
npm run build
npm run setup:local
```

`setup:local` defaults to MySQL at `127.0.0.1:3308`, local root with no password. Set `MYSQL_SETUP_HOST`, `MYSQL_SETUP_PORT`, `MYSQL_SETUP_USER`, and `MYSQL_SETUP_PASSWORD` privately when different. It creates **new** `ellas_pizza_node` and `ellas_pizza_node_test` databases with separate random application passwords and writes an ignored `.env` with session and VAPID secrets. It refuses an existing target database or `.env`; it does not reset existing data. The setup account needs CREATE DATABASE, CREATE USER and GRANT privileges. No global MySQL settings are changed.

Choose one initialization path:

```powershell
# Existing Ella’s Pizza workspace: preserve staff, menu photos and transaction snapshots.
npm run import:legacy

# OR a fresh installation: choose your own owner credentials, then load supplied menu.
npm run admin
npm run seed:menu
```

```powershell
npm start
```

Open **http://127.0.0.1:3000**. Use exactly the configured `APP_ORIGIN`; `localhost` and `127.0.0.1` are different origins. Existing Herd/PHP URLs do not run this Node application. Root `npm start` delegates to this project.

The public landing page at `/` explains the system and displays the current product catalog with category filters, search, available variants and prices. `/api/public/products` exposes only public catalog fields and images for active, unarchived products in active categories; other uploads remain restricted to staff. Restart the server after adding these API routes. Admin/owner, cashier and kitchen staff share the login at `/staff.html`. Existing `/?page=...` workspace bookmarks redirect to the staff page. Customers use the separate `/customer.html` login and registration page. Customer accounts use a separate credential table and cannot access staff APIs. Visitors can open product details and add product variants and quantities to a browser-local cart without signing in. Checkout requires a customer login or registration and returns to the preserved cart. Authenticated checkout supports takeaway or scheduled pickup, revalidates stock and prices, shows a server quote for confirmation, and creates a Pending, unpaid order in the staff order list. No online payment is collected. Customer order history is not included. Customer-placed orders have no staff creator; the customer checkout record preserves their origin and retry key. Registration creates a new customer record and never claims existing orders by matching a name or phone number. Existing customer contact records remain usable without a login. Signing in rotates the browser session, so switching between staff and customer access in the same browser requires signing in again.

After pulling changes to customer authentication, stop the running Node server, run `npm run db:generate` and `npm run db:deploy`, then restart with `npm start`.

No default password exists. New staff can use Create staff account on the shared staff login page; registrations stay inactive until the owner approves them in Staff Management > Pending Approval. Staff do not select a role during registration. The owner assigns Cashier or Kitchen on approval, and approval/rejection is audited. Duplicate registrations never overwrite existing credentials. `admin` prompts for the initial owner’s name, email and hidden password (12–128 characters). Environment variables `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` can be used privately for automation. Existing accounts are never silently overwritten. The owner manages staff and resets their passwords in Staff Management; each user changes their own password with current-password verification.

## Finish legacy directory cleanup

The old source and framework entry files have been deleted, and npm pruned the old React/Vite packages. Automatic approval review blocked recursive directory deletion in the agent environment, so remaining PHP vendor/cache files and old directories are hidden in Explorer until local cleanup. From the workspace root, run:

```powershell
powershell -NoProfile -File .\node-app\scripts\remove-legacy.ps1
```

Run this in a local PowerShell environment that permits local scripts. The script verifies the workspace boundaries and preserved media checksums, then removes only listed legacy paths. It preserves `node-app`, its dependencies, private import files and `.runtime/mysql-data`. Use `-WhatIf` to preview targets. Script execution is disabled in the agent environment; permanent directory cleanup was not executed here.

## Manual / production database configuration

Create a dedicated utf8mb4 MySQL database and least-privilege application account. Copy `.env.example` to `.env`, replace all placeholders, set a random session secret of at least 48 characters, and set the database port. URL-encode special characters in database usernames/passwords. Do not put credentials in browser files. Use a distinct `_test` database for `TEST_DATABASE_URL`.

```powershell
npm run db:generate
npm run db:deploy
npm run admin
npm run seed:menu
npm run vapid:generate
npm run build
npm start
```

MySQL must run with UTC server/session time for timestamp defaults; all application writes use UTC `Date` objects. Reports and presentation use Asia/Manila (+08:00), including end-exclusive day boundaries. Configure the database server before production use. `prisma migrate deploy` applies the checked-in migration; never run `migrate reset` against business data.

Production requires `NODE_ENV=production`, HTTPS `APP_ORIGIN`, a strong secret, persistent MySQL and `UPLOAD_DIR`, and TLS termination at a trusted reverse proxy. Set `TRUST_PROXY=1` only for one trusted proxy; do not expose the upstream port to untrusted clients. Bind `HOST=0.0.0.0` only when required by the host/container. The default is loopback. See [deployment](docs/OPERATIONS.md).

## Supplied menu and legacy import

`data/menu.json` contains 14 pizzas and nine add-ons transcribed from the supplied menu photograph. Sizes were not supplied; the variant is explicitly “Menu price (size unspecified)”. Existing edited prices, names and pictures are preserved when seeding. Supplied source material is not described as demonstration sales. There are no fabricated production orders, payments or customers. The `demo` flag clearly labels optional demonstration products; automated fixtures are labeled DEMONSTRATION and written only into the test database.

`import:legacy` reads `LEGACY_ENV_PATH` (default `./var/import/source.env`) and the legacy MySQL tables through a read-only consistent snapshot. It requires a different Node target database. It maps integer centavos to decimal PHP, old Manila timestamps to UTC, snapshots, owner/cashier/kitchen accounts, customers, menu, payments, refunds and audit history. It reads preserved media from `LEGACY_MEDIA_ROOT` (default `./var/import`) and copies it into the Node upload directory. Existing bcrypt hashes remain verifiable. Legacy customer website logins do not become staff accounts. Import bookkeeping prevents ordinary repeated imports from overwriting Node edits.

Perform the import while the old system is offline for new writes. Compare order counts, verified payments, refunds and totals before switching staff. Import does not migrate optional ingredient inventory, expenses, shifts, public ordering, legacy chat, pending refund requests or unsent legacy drafts. Keep a source backup. If a migration is interrupted, use a fresh Node target rather than assuming all partially imported financial records are ready. The old application source and entry points have been removed. The original MySQL data is unchanged; 22 media/attachment/backup files and private database connection settings were preserved in `var/import`. Any remaining installed PHP libraries or empty legacy directories are excluded from Explorer and can be removed with the cleanup script.

## Use and administration

- POS: choose variants/add-ons, customer details when needed, notes and permitted discounts; review the backend quote and create a Pending order.
- Workflow: Pending → Confirmed → Preparing → Ready → Completed. Completion requires full verified payment. Ordinary editing is Pending-only. Owner-only confirmed corrections require a reason through the API. Preparing/Ready cancellations require owner approval.
- Payments: cash applies up to the balance and records change. GCash remains Pending until manually checked against the receiving account. Reference text alone does not verify a transfer. Payments and refunds are online-only.
- Receipts and kitchen slips open in an embedded dialog. Receipt PDF download is available after preview; browser printing is supported. Receipt content is a transaction acknowledgment, **not a validated official tax invoice**.
- Menu, categories, customers and staff use archiving/restoration. Orders, original item versions, payments, refunds and audits are preserved. Add-ons and discounts can be deactivated.
- Reports separate completed sales, verified collections, sales refunds, other refunds and current all-time balances. Cashier reports are scoped to their own orders/collections. CSV and PDF use the same report service and filters.

[Role guide and demonstration checklist](docs/GUIDE.md) · [API and WebSocket documentation](docs/API.md) · [Backups and deployment](docs/OPERATIONS.md) · [Features and limitations](docs/VERIFICATION.md)

## PWA, offline drafts and synchronization

Open the app online once. Use **Install app** for guidance. Service workers require HTTPS or a loopback development origin. The app caches its shell, last downloaded permitted menu, and limited read-only dashboard/order snapshots. It shows Offline / Last synced indicators. Customer details are excluded from the recent-order cache; local drafts may contain details entered by their owner and are cleared on logout.

Offline drafts use IndexedDB UUIDs and estimated totals, with no official order number. Save a draft, then Queue it for submission. States: Local Draft, Queued, Syncing, Synced, Needs Review. Background Sync is opportunistic where supported; reconnect, app resume, periodic foreground checks and Sync Now are fallbacks. Payment operations are never queued.

The server revalidates availability, selected add-ons, prices and permissions. Price conflicts show a revised quote requiring explicit acceptance. Unavailable selections need replacement. Drafts remain until confirmed server acceptance maps them to an official order. Stable operation IDs make a retry safe after a lost response. Authentication expiry pauses the queue; sign in to the same account to resume. Transient retries stop after five attempts; review/manual retry is available. Offline drafts are device-local, not a backup.

Updates wait for user action. Save/discard work before applying an update. Signing out warns about unsynchronized drafts and clears private IndexedDB/cache data. Do not share browser profiles between unrelated operators; browser storage cannot be treated as an encrypted vault.

## Push and real-time chat

Signed-in customers can open **Chat with staff** from their customer account page (`/customer.html`). Staff open **Chat > Customer messages** to select a customer and reply. Each customer sees only their own conversation; anonymous and inactive accounts cannot use chat. Customer conversations are stored separately from staff rooms and refresh every four seconds while online. Messages support history loading and safe retries with the same message ID; they are not queued offline. No order or payment details are automatically exposed through chat.

After updating, stop the Node server, run `npm run db:generate`, `npm run db:deploy` and `npm run build`, then restart it. The customer support migration adds conversation/message tables without changing existing staff chat records.

Set VAPID subject to an appropriate business contact. `vapid:generate` writes keys to `.env` without printing secrets. Keep the private key on the server and stable across deployments. Staff explicitly enable push in Notifications and choose preferences. The app uses real Web Push, role-limited events, a persistent delivery outbox, bounded retries and removal of expired subscriptions. In-app notifications remain available when push is denied/unavailable. Supported endpoints include Chrome/Edge, Firefox and Apple Web Push; browser/platform policy may require installation. iOS/iPadOS requires supported Safari Home Screen installation. Receiving new notifications requires connectivity and permission; OS delivery timing is outside application control. Outbound HTTPS to browser push services is required.

Socket.IO uses WebSocket transport only, shared HttpOnly sessions, CSRF handshake validation and server-authorized rooms. General and order-linked messages persist before acknowledgment. Clients recover missed messages after reconnecting, show typing/unread state, and retry failed sends with the same client message ID. Chat delivery is online-only. The in-process background scheduler and rate limiters currently target a **single Node process**; scaling needs a shared limiter, Socket.IO adapter and dedicated job coordination.

## Checks

```powershell
npm run check
npm test
npm run test:browser
```

`npm test` runs pure checks and the real MySQL/API/WebSocket suite when `TEST_DATABASE_URL` is configured. Integration fixtures remain in that dedicated database for inspection; each run uses unique fixture identities. Missing configuration explicitly skips integration; a skipped test is not a successful database verification. `test:browser` checks UI/PWA/offline behavior using an explicitly isolated fixture server and headless Edge; it does not substitute for MySQL integration. See the verification document before acceptance.

## Milk tea, fries and Bite & Brew branding

The current system name is **Bite & Brew Order and Sales Management System**, covering pizza, milk tea and fries. `seed:menu` also adds six milk tea flavors (Classic, Okinawa, Wintermelon, Taro, Matcha, Chocolate) and four fries flavors (Original, Cheese, BBQ, Sour Cream), with two variants each. These ten additions use clearly labeled demonstration prices and illustrations. Confirm prices and turn off the Demonstration product flag in Menu before treating them as the actual business menu. Milk tea/fries variants do not inherit pizza add-ons.

For an existing installation, `npm run menu:expand` adds missing products without overwriting owner edits. `npm run menu:expand -- --rebrand` also updates the current business name, receipt footer and new-order prefix to Bite & Brew / BB. Historical order/receipt snapshots remain unchanged. Private storage identifiers, database names and account emails are retained to keep existing sessions, drafts, backups and logins compatible.

## Burger menu

`npm run seed:category-addons` adds 13 demonstration add-ons for burgers, fries and milk tea and links them to applicable sizes. Burger choices include cheese, lettuce, tomato, sauce and an extra beef patty (beef burgers only); fries have cheese sauce, bacon bits, cheese powder and BBQ dip; milk tea has extra pearls, nata de coco, egg pudding and cream cheese topping. Prices are demonstration values. Owners can edit prices and availability in Menu > Add-ons. Re-running the command preserves existing names, prices and active states. Fresh `seed:menu` installations include these add-ons.

Staff can choose add-ons in POS, and customers can choose them in product details before adding to cart. Prices apply per item. Different add-on combinations remain separate cart lines; checkout revalidates availability, permitted variants and prices on the server. Restart the Node server after updating the public catalog route, then refresh the browser.

The Burgers category includes 16 demonstration varieties: Classic Beef, Cheeseburger, Double Cheeseburger, Bacon Cheeseburger, Mushroom Swiss, BBQ Beef, Spicy Jalapeno, Hawaiian Beef, Beef & Egg, Crispy Chicken, Spicy Chicken, Grilled Chicken, Chicken Cheeseburger, Fish Fillet, Veggie and Plant-Based. Each has Burger only and With fries variants, an illustration and clearly labeled demo pricing. Confirm actual recipes and prices in Menu before business use. `npm run menu:expand` adds missing products without changing existing prices, photos, archived states or owner edits.
