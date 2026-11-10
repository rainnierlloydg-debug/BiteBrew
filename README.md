# Bite & Brew

## Order and Sales Management System

Bite & Brew manages pizza, burgers, fries, and milk tea sales in one workspace. Customers can browse products, customize orders, arrange pickup, and message staff. Owners, cashiers, and kitchen staff use role-based screens to manage orders, preparation, payments, and sales reports.

The application uses **React, Node.js, Express, MySQL, and Prisma**. The frontend and API share the same origin.

**Repository:** [rainnierlloydg-debug/BiteBrew](https://github.com/rainnierlloydg-debug/BiteBrew)

**Default branch:** `main`

**Local address:** <http://127.0.0.1:3000>

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Requirements](#requirements)
- [Fresh installation](#fresh-installation)
- [Existing installations](#existing-installations)
- [Pages and accounts](#pages-and-accounts)
- [Environment configuration](#environment-configuration)
- [Menu, sizes, and add-ons](#menu-sizes-and-add-ons)
- [Order and payment workflow](#order-and-payment-workflow)
- [Chat and offline support](#chat-and-offline-support)
- [Project structure](#project-structure)
- [Commands](#commands)
- [Testing](#testing)
- [Deployment and backups](#deployment-and-backups)
- [Troubleshooting](#troubleshooting)
- [Contributors and branches](#contributors-and-branches)
- [Documentation](#documentation)

## Features

| Area | Capabilities |
| --- | --- |
| Public catalog | Product photos, categories, search, available options, prices, and demonstration labels |
| Customer accounts | Registration/login, browser-local cart, add-ons, takeaway or scheduled pickup checkout, and staff messaging |
| Staff accounts | Shared staff login, registration requests, owner approval, assigned roles, and password changes |
| Point of sale | Variants, quantities, permitted add-ons, preparation notes, discounts, and server-validated quotes |
| Kitchen | Preparation queue and permitted order-status updates |
| Menu management | Products, categories, variants, prices, images, availability, and add-on assignments |
| Payments | Cash tender/change, manually verified GCash payments, refunds, and approval workflows |
| Reports and documents | Sales/collection/refund reports, CSV/PDF exports, receipts, and kitchen-slip previews |
| Administration | Business settings, staff management, archiving/restoration, and audit logs |
| Communication | Staff/order chat over WebSocket, customer support inbox, notifications, and optional Web Push |
| Offline support | Installable PWA, cached permitted views, device-local drafts, and retry-safe synchronization |

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React DOM, HTML, and CSS |
| Frontend build | esbuild; React is bundled locally without a CDN |
| Backend | Node.js and Express 5 |
| Database | MySQL 8 and Prisma 6 |
| Staff real-time communication | Socket.IO using WebSocket transport |
| Authentication | Server-side sessions, HttpOnly cookies, password hashing, CSRF protection, and role checks |
| Offline storage | IndexedDB, Cache Storage, and a module service worker |
| Supporting libraries | Sharp image processing, PDFKit documents, and Web Push |

React components for the landing page, catalog, and customer accounts are in `node-app/frontend/components/`. Existing staff controllers render React elements through `node-app/frontend/markup.jsx`, preserving their form bindings and workflows. Shared pricing calculations remain in `node-app/public/shared/`.

PHP, Laravel, and Herd are not runtime requirements for this Node application.

## Requirements

- **Node.js 22.12 or newer**, with npm.
- **MySQL 8**, running before setup or application startup.
- **Git** for cloning and updating the source.
- A modern browser; automated browser checks use Microsoft Edge by default.
- For automatic local setup, a MySQL account allowed to create databases/users and grant privileges.

Examples use **Windows PowerShell** and `npm.cmd`, which also works when PowerShell blocks the `npm.ps1` launcher. On macOS/Linux, use `npm` and the equivalent shell commands.

## Fresh installation

Use this procedure for a new installation. If `.env` and the database already exist, follow [Existing installations](#existing-installations).

### 1. Clone and install dependencies

```powershell
git clone https://github.com/rainnierlloydg-debug/BiteBrew.git
cd BiteBrew
npm.cmd --prefix node-app ci --include=dev
```

Run subsequent commands from the repository root. Root npm scripts delegate to `node-app`. Include build dependencies because React is built before startup.

### 2. Start MySQL and configure local setup

Automatic setup defaults to **`127.0.0.1:3308`**, using local `root` with an empty password. If your MySQL port is `3306`, set:

```powershell
$env:MYSQL_SETUP_PORT = '3306'
```

Other overrides are `MYSQL_SETUP_HOST`, `MYSQL_SETUP_USER`, and `MYSQL_SETUP_PASSWORD`. Supply any required password privately through your terminal environment.

```powershell
npm.cmd run setup:local
```

Setup creates `ellas_pizza_node` and `ellas_pizza_node_test`, separate database credentials, and private `node-app/.env` values. It generates Prisma and applies migrations. It does not start MySQL.

The script refuses existing target databases/users or an existing `.env`; it does not reset their data. For a manually provisioned database, follow [manual database configuration](node-app/README.md#manual--production-database-configuration).

### 3. Create the owner and load the menu

```powershell
npm.cmd run admin
npm.cmd run seed:menu
```

The owner command prompts for a name, email, and hidden password of **12–128 characters**. No default login or shared password is provided.

`seed:menu` adds the supplied pizza menu, demonstration burgers/milk tea/fries, and category add-ons. Existing product edits are preserved.

### 4. Start the application

```powershell
npm.cmd start
```

The frontend builds automatically before Express starts. Open **<http://127.0.0.1:3000>**. Keep the terminal running; press **Ctrl+C** to stop the server.

Use the exact `APP_ORIGIN` in `.env`. `localhost` and `127.0.0.1` are different origins for sessions and security checks.

## Existing installations

If dependencies, `.env`, and the database are already configured:

```powershell
npm.cmd start
```

For backend development with Node's watcher:

```powershell
npm.cmd run dev
```

The current development command watches the Node server. Rebuild after React JSX changes with `npm.cmd run build`; start/dev commands also perform an initial build.

After pulling updates, stop the server first, then run:

```powershell
git pull origin main
npm.cmd --prefix node-app ci --include=dev
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd start
```

Do not rerun `setup:local` or `import:legacy` as a routine startup step. Save pending work before applying a PWA update.

## Pages and accounts

| Page | URL | Purpose |
| --- | --- | --- |
| Storefront | <http://127.0.0.1:3000/> | Browse products, select options/add-ons, and manage the cart |
| Staff workspace | <http://127.0.0.1:3000/staff.html> | Owner, cashier, and kitchen login |
| Customer account | <http://127.0.0.1:3000/customer.html> | Customer registration/login and Chat with staff |
| Health check | <http://127.0.0.1:3000/health> | Application/database connectivity |

| Role | Main responsibilities |
| --- | --- |
| Owner | Settings, menu/pricing, staff approvals, administration, reports, and authorized financial corrections |
| Cashier | POS, customer/order handling, collections, scoped reports, and communication |
| Kitchen | Preparation queue, permitted preparation updates, chat, and notifications |

New staff select **Create staff account** on the staff login page. Accounts remain inactive until the owner reviews them in **Staff Management → Pending Approval** and assigns Cashier or Kitchen access.

Customers use separate credentials. Guests can browse and build a cart, while checkout and customer chat require an active customer account. Customer order history is not currently included. Signing in as a different account rotates the session; use separate browser profiles for simultaneous staff and customer sessions.

## Environment configuration

Configuration lives in **`node-app/.env`**, not a root `.env`. Use [node-app/.env.example](node-app/.env.example) for manual setup. Keep real credentials out of Git and browser code.

| Variable | Purpose / local default |
| --- | --- |
| `NODE_ENV` | `development` locally; `production` on the server |
| `HOST` | Optional bind address; defaults to `127.0.0.1` |
| `PORT` | Application port; defaults to `3000` |
| `APP_ORIGIN` | Exact origin, normally `http://127.0.0.1:3000` locally |
| `DATABASE_URL` | MySQL application database connection URL |
| `TEST_DATABASE_URL` | Separate test database URL; name must end in `_test` |
| `SESSION_SECRET` | Random secret of at least 48 characters |
| `SESSION_MINUTES` | Session duration; defaults to `120` |
| `TRUST_PROXY` | `0` locally; configure for the actual trusted reverse proxy |
| `UPLOAD_DIR` | Persistent private uploads; defaults to `./var/uploads` relative to `node-app` |
| `VAPID_SUBJECT` | Business contact for Web Push |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keys; the private key stays on the server |
| `LEGACY_ENV_PATH`, `LEGACY_MEDIA_ROOT` | Optional legacy import configuration/media |

`MYSQL_SETUP_*` variables configure the one-time setup account; the running application uses `DATABASE_URL`. The example environment uses port `3306`, while automatic setup defaults to `3308` unless overridden.

MySQL should use UTC server/session time. Application writes use UTC; reports and presentation use **Asia/Manila (UTC+08:00)**. Amounts are displayed in **Philippine pesos (PHP)**.

## Menu, sizes, and add-ons

The supplied catalog contains **14 pizzas, 16 burgers, 6 milk teas, and 4 fries flavors**. Added food/drink products and category add-ons use demonstration prices that must be confirmed in Menu before business use.

| Category | Options |
| --- | --- |
| Milk tea | Classic, Okinawa, Wintermelon, Taro, Matcha, Chocolate; Medium 16 oz and Large 22 oz |
| Fries | Original, Cheese, BBQ, Sour Cream; Regular and Large |
| Burgers | 16 varieties; Burger only or With fries |
| Pizza | Source menu prices; Small/Medium/Large can be configured below |

Add missing demonstration products and category add-ons to an existing catalog with:

```powershell
npm.cmd run menu:expand
npm.cmd run seed:category-addons
```

These commands preserve existing product edits and existing add-on names, prices, and active states.

### Pizza sizes

Fresh pizza seed data initially uses **Menu price (size unspecified)**. To add Small, Medium, and Large to existing pizzas:

```powershell
node node-app/scripts/pizza-sizes.js
```

The script requires an active owner. For newly created sizes it uses the current active variant's price: **Small = base, Medium = base + ₱50, Large = base + ₱100**. Existing named size variants are retained. Other active variants become unavailable rather than being deleted; add-on links are copied to new sizes. Review these demonstration size prices in Menu.

### Category add-ons

| Category | Supplied add-ons and demonstration prices |
| --- | --- |
| Burgers | Cheese ₱15, lettuce ₱10, tomato ₱10, sauce ₱10, extra beef patty ₱35; patty limited to supported beef burgers |
| Fries | Cheese sauce ₱15, bacon bits ₱20, cheese powder ₱10, BBQ dip ₱10 |
| Milk tea | Extra pearls ₱10, nata de coco ₱15, egg pudding ₱15, cream cheese topping ₱20 |

Add-ons apply per item and only to assigned variants. Different combinations remain separate customer cart lines. Checkout revalidates permitted add-ons, availability, and current prices.

Menu changes in the app are stored in MySQL. **Cloning/pushing Git source does not copy your customized database, demonstration flags, private uploaded photos, or transaction records.**

## Order and payment workflow

```text
Pending → Confirmed → Preparing → Ready → Completed
```

- Staff POS supports dine-in, takeaway, and scheduled pickup. Customer checkout supports takeaway and scheduled pickup.
- The server calculates and revalidates quotes before accepting an order.
- Customer checkout creates a **Pending, unpaid order** and collects no online payment.
- Completion requires full verified payment. Editing, cancellation, refunds, and corrections follow role/workflow restrictions.
- Cash records tender, the amount applied, and change. GCash remains pending until staff manually verify the payment.
- Receipts and kitchen slips support preview/printing; receipt PDF export is available. Receipts are transaction acknowledgments, not validated official tax invoices.
- Historical snapshots and audits remain preserved when menu records or accounts change.

## Chat and offline support

Staff use general and order-linked conversations with authenticated WebSocket delivery and reconnect recovery. Customers select **Chat with staff** from their account page; staff reply through **Chat → Customer messages**. Each customer sees only their own conversation. Customer messages refresh every **4 seconds** while online. Chat is stored server-side and is not queued offline.

Open the app online once to download the permitted PWA shell and menu. Installation, service workers, and push require HTTPS or a loopback development origin.

Offline draft states are **Local Draft, Queued, Syncing, Synced, and Needs Review**. Drafts have estimated totals and no official order number until accepted by the server. Price changes require review, unavailable selections need correction, and authentication expiry pauses synchronization.

Payments, refunds, live reports, and official updates require connectivity. Drafts are device-local and are not a database backup. Save pending work before applying a PWA update.

Web Push requires permission, configured VAPID keys, and outbound access to browser push services. In-app notifications remain available when push is unavailable.

## Project structure

```text
BiteBrew/
├── README.md
├── package.json                 # Root convenience commands
└── node-app/
    ├── frontend/                # React components and rendering layer
    ├── public/                  # Served HTML, CSS, JS, images, and PWA files
    │   ├── assets/              # Generated React bundle; ignored by Git
    │   ├── js/                  # Controllers and client services
    │   └── shared/              # Shared brand and pricing calculations
    ├── server/                  # Express routes, services, and middleware
    ├── prisma/                  # Schema and checked-in migrations
    ├── data/                    # Menu source data and seed assets
    ├── scripts/                 # Setup, build, seed, and maintenance tools
    ├── tests/                   # Calculation, security, and API tests
    ├── docs/                    # API, usage, operations, verification guides
    ├── var/                     # Private runtime/uploads; ignored by Git
    └── .env.example             # Template; real .env is ignored
```

## Commands

Run from the repository root unless stated otherwise.

| Command | Purpose |
| --- | --- |
| `npm.cmd run setup:deps` | Install application dependencies |
| `npm.cmd run setup:local` | One-time local database/environment setup |
| `npm.cmd run admin` | Create the initial owner |
| `npm.cmd run seed:menu` | Add the supplied menu and demonstration category add-ons |
| `npm.cmd run menu:expand` | Add missing demonstration food/drink products |
| `npm.cmd run seed:category-addons` | Add category add-ons and variant links |
| `npm.cmd run db:generate` | Generate the Prisma client |
| `npm.cmd run db:deploy` | Apply migrations without resetting data |
| `npm.cmd run build` | Build React/icons and update the PWA cache version |
| `npm.cmd start` | Build the frontend and start Express |
| `npm.cmd run dev` | Initial build and watched Node server |
| `npm.cmd run check` | Check JavaScript and React JSX syntax |
| `npm.cmd test` | Run automated tests |
| `npm.cmd run test:browser` | Build and run isolated browser fixture checks |
| `npm.cmd run backup` | Create an encrypted database/media backup |
| `npm.cmd run import:legacy` | Import a separately configured legacy database/media source |

For scripts exposed only inside `node-app`, use `npm.cmd --prefix node-app run <script>`, for example `npm.cmd --prefix node-app run vapid:generate`.

## Testing

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:browser
```

The React migration verification passed **35 automated tests**, **73 JavaScript/JSX syntax checks**, and headless Edge fixture checks for catalog/cart/checkout, staff screens/roles, customer chat, and offline drafts. See [verification details](node-app/docs/VERIFICATION.md) for scope and remaining acceptance work.

- Integration requires a separate `TEST_DATABASE_URL` ending in `_test`, different from the business database.
- Demonstration test fixtures remain in that test database for inspection.
- Missing database configuration skips integration tests; a skipped test is not database verification.
- Browser checks use an isolated fixture server, not live business transactions. Set `EDGE_BINARY` for a different Edge installation path.
- Live push delivery, restore drills, and deployment/device-specific acceptance remain outstanding.

## Deployment and backups

Deployment requires a **Node.js server, MySQL, HTTPS, WebSocket support, and persistent upload storage**. GitHub stores source; uploading code does not deploy the complete application.

Install dependencies on the target platform with `npm ci --include=dev` from `node-app`, generate Prisma, apply migrations, and build. Set production values for `NODE_ENV`, `APP_ORIGIN`, session secrets, and database credentials. Initially run one supervised Node process behind a trusted TLS reverse proxy.

React assets are generated before startup. Persist the database and `UPLOAD_DIR` across deployments. Keep `.env`, uploads, backups, and database storage out of Git and public access.

Set `BACKUP_PASSPHRASE` privately to at least 20 characters before running:

```powershell
npm.cmd run backup
```

Backups include business tables and uploaded media, excluding sessions and environment secrets. Restore into a separate empty database and separate upload directory, verify the result, then switch application configuration. See [deployment and recovery procedures](node-app/docs/OPERATIONS.md).

Legacy import is optional and requires separately preserved source configuration/media not shipped through Git. Read [legacy migration details](node-app/README.md#supplied-menu-and-legacy-import) before running it.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `npm.ps1 cannot be loaded` | Use `npm.cmd` in PowerShell |
| Database connection refused | Start MySQL; check host, port, credentials, and database in `node-app/.env` |
| Setup says `.env` or database exists | Use existing configuration and `db:deploy`; do not reset business data to rerun setup |
| Missing Prisma client/migrations | Run `db:generate` and `db:deploy` after installing dependencies |
| React packages/build tools missing | Run `npm.cmd --prefix node-app ci --include=dev` |
| Port `3000` in use | Stop the other instance or change both `PORT` and `APP_ORIGIN` consistently |
| Newly registered staff cannot log in | Owner approval and an assigned role are required |
| Customer cannot use staff login | Use `/customer.html`; the account types are separate |
| Session/security-token errors | Use the configured origin; sign in again and check for account switching in another tab |
| Old screen after updating | Save pending work, apply the PWA update, and refresh with Ctrl+F5 |
| Push/install unavailable on a LAN URL | Check HTTPS, browser support, installation requirements, and permission |
| Customized menu/photos absent after clone | Restore/import the database and uploads separately |

## Contributors and branches

| Contributor | Branch | Main contribution |
| --- | --- | --- |
| [Rainnier](https://github.com/rainnierlloydg-debug) | `rainnier-branch` | Backend, database, services, tests; later React migration on `main` |
| [Macky](https://github.com/mackymagbanua33-source) | `macky-branch` | Original storefront, staff interface, styling, and frontend workflows |
| [Zyreen](https://github.com/Zyreen-uni) | `zyreen-branch` | Configuration, documentation, and integration |

**`main` contains the latest integrated application.** Contributor branches preserve their contribution history and may be behind `main`. Use a working branch for new changes and integrate after review/checks. Commit authorship and the authenticated account performing a push are separate identities.

## Documentation

- [Detailed setup and feature notes](node-app/README.md)
- [Roles and demonstration guide](node-app/docs/GUIDE.md)
- [API and WebSocket reference](node-app/docs/API.md)
- [Deployment, backups, and recovery](node-app/docs/OPERATIONS.md)
- [Verification evidence and limitations](node-app/docs/VERIFICATION.md)

## License

A project license has not been specified in this repository.
