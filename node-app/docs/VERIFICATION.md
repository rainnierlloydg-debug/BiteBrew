# Completed source, evidence and remaining acceptance

Updated on 8 November 2026. All 29 automated tests now pass, including real MySQL/API and authenticated WebSocket integration using a separate test database. Owner/cashier/kitchen authorization is enforced in API middleware and sensitive service operations. Business records were not used for test fixtures. Live push, restore drills and deployment-specific acceptance are still required.

## React migration verification (11 November 2026)

React 19 now renders the frontend. All 35 automated tests passed against the dedicated test database, and headless Edge checks passed for catalog/cart/checkout, all staff screens, permissions, customer chat and offline drafts. React-specific checks cover editable form defaults, select/textarea values, nested rendering, escaped text and unmount cleanup. Existing CSS and shared calculation/storage modules are unchanged. Original-source fixture screenshots are retained locally for comparison. Backend APIs and migrations were not changed.

The fixture navigation helper now waits for active synchronization before a full reload; the original baseline could abandon a synchronization lease during rapid automated page navigation. This changes the test harness, not the application synchronizer.

## Executed checks (original release)

| Check | Result | What it establishes |
|---|---|---|
| JavaScript syntax | Passed for 57 source files at the latest check | Node can parse backend, frontend, worker, scripts and test sources |
| Dependency-free automated tests | 16 passed, 0 failed | Centavo arithmetic/rounding, add-ons/quantities/discount caps, quote fingerprints, native password hashing, role policy, safe account data, encrypted backup roundtrip/integrity |
| MySQL/API/WebSocket integration suite | Passed; 29 total tests, zero failures/skips | Real session/CSRF and role restrictions, menu/archive, snapshots, idempotency, workflow, cash/GCash/refunds, consistent exports, persistent authenticated chat and session revocation |
| Initial SQL on real MySQL 8.0.30 | Passed | Creates 25 tables / 32 foreign keys, enum default, transaction deletion restriction; temporary isolated database removed after checking |
| Headless Edge fixture checks | Passed | All 14 admin screens render without uncaught errors; responsive desktop/mobile POS and add-on totals; installed cached shell/menu; expired-session pause; explicit revised-estimate acceptance; conflict state; idempotent retry after a lost response; local-data cleanup |
| PWA public-asset preparation | Passed | Manifest/PNG icons, precache asset presence and versioned cache; React runtime is bundled locally |

Evidence: [browser results](verification-artifacts/browser-result.json), [SQL results](verification-artifacts/schema-result.json), [desktop dashboard](verification-artifacts/dashboard-desktop-fixture.png), [desktop POS](verification-artifacts/pos-desktop-fixture.png), [mobile POS](verification-artifacts/pos-mobile-fixture.png), [offline POS](verification-artifacts/offline-pos-fixture.png). Screenshots and browser records are explicitly **DEMONSTRATION UI fixtures**; they are not actual sales or proof of backend persistence.

Run from `node-app`:

```powershell
npm install
npm run build
npm run check
npm test
npm run test:browser
```

Configure the dedicated MySQL `TEST_DATABASE_URL` before accepting integration results. It must end `_test` and differ from DATABASE_URL. Integration tests apply the migration, create unique labeled test identities/records, and leave test fixtures for inspection. Never point tests at business records. `npm run test:schema` optionally uses the MySQL command-line client and local setup credentials to validate initial SQL in a random throwaway schema.

## Implemented source

| Area | Implementation |
|---|---|
| Architecture | Same-origin Express REST backend, Prisma MySQL schema/migration, React frontend with preserved controllers and responsive green glass UI |
| Authentication | Native salted scrypt, bcrypt legacy verification, MySQL sessions, HttpOnly/SameSite cookies, Secure cookies in production, CSRF/Origin validation, login limiting, password changes, permission middleware and account/session invalidation |
| Menu / people | Category/product/variant/add-on/discount/customer/staff CRUD, safe image decoding/reencoding, availability, archive/restore and uniqueness/relationship checks |
| POS / workflow | Backend quotes, quantity/add-on/charge/discount calculations, transaction snapshots, unique official numbers, version guards, controlled corrections, reasons, role-limited transitions and kitchen redaction |
| Payments / refunds | Partial/multiple cash and pending GCash, manual verification/rejection, change, reference deduplication, bounded owner refunds and approval requests, history preservation |
| Dashboard / reports | Selected-period activity, separate sales/collections/refunds, all-time balances, best sellers, trend, status breakdown, recent orders, common report service, pagination, CSV/PDF and print layouts |
| Documents | Embedded receipt/slip preview, receipt download, browser/thermal print styles, document audit; no official tax-invoice compliance claim |
| PWA / offline | Install manifest/icons, module worker, fallback/update UI, user-scoped IndexedDB drafts/menu/limited snapshots, cached indicators, private logout cleanup |
| Synchronization | Durable selected-draft queue, UUID operations, lease, Background Sync plus foreground/manual fallbacks, bounded retries, authentication pause, conflict/revised-quote acceptance, accepted-number mapping |
| Push | Actual Web Push backend/worker handlers, explicit subscription/preferences/unsubscribe, VAPID configuration, durable deduplicated outbox, retry/expiry cleanup, generic text and in-app fallback |
| Staff chat | WebSocket-only Socket.IO, shared session/CSRF authentication, authorized rooms, persistent messages before ack, client-ID deduplication, history cursors/read positions/unread/typing/reconnect recovery |
| Audit / settings | Restricted audit records with actors and before/after, server-side business/permissions/rates, historical snapshots retained |
| Operations | Separate local setup, initial admin CLI, supplied menu seed, read-only legacy importer, encrypted backup/restore, API/role/install/production/acceptance documentation |

“Implemented” means the source and controls exist; areas requiring installed packages/MySQL/providers remain subject to the acceptance checks below.

## Required before business use

- Install packages, generate Prisma Client, run `prisma validate` and migration deploy on a clean MySQL target. Generate and retain the Node lockfile. Confirm Prisma schema and deployed schema agree.
- Repeat the MySQL/API/WebSocket suite after future permission or transaction changes; all current subtests pass without skips. Check authentication/CSRF/RBAC; menu, archive/restore and upload persistence; historical prices; totals; transitions; GCash/cash; refund limits; duplicate handling; report/export consistency; cookie/session expiry and active socket deactivation.
- Import legacy data only after backup/frozen source writes, then reconcile counts, dates, verified payment/refund balances, receipts and media. Legacy import has not yet been executed for this replacement.
- Verify actual push delivery with configured VAPID keys, browser permission, subscription expiry and denied-permission fallback. Test real authenticated two-browser chat and reconnect recovery.
- Check PWA installation and background scheduling on each actual browser/device under HTTPS. The browser harness verifies cache/offline logic but cannot establish OS delivery or Background Sync scheduling guarantees.
- Perform a database/media restore drill with a separate `_restore` target. Encryption codec tests do not prove database restore correctness.
- Perform manual keyboard/screen-reader/thermal-printer checks and the [full walkthrough](GUIDE.md). Desktop/mobile screenshots establish layout evidence, not comprehensive accessibility certification.

## Limits and external requirements

- Internet/package registry access is needed for installation and Prisma engine downloads on a fresh machine; dependencies are installed in the current workspace. MySQL, HTTPS/reverse proxy, persistent uploaded media and browser push connectivity must be configured externally.
- One Node process is the supported initial deployment. Rate limiting is in memory; horizontal deployment needs shared coordination/Socket.IO adapter before use.
- Report source/export cap is 50,000 records; PDF cap is 3,000 rows. Print preview labels its current page; CSV/PDF export all matching rows. Current POS/customer pickers download up to 100 records; the supplied 14-product menu fits, but a larger catalog needs paged selection UI.
- Built-in backup is intended for small installations (200 MB / 100,000 rows per table limits). Use database/provider snapshots for larger installations.
- Legacy import omits optional inventory, expenses, cashier shifts, public ordering, old chat, pending approval requests and local unsent drafts. The original database and preserved business files remain available for review; the old application source was removed. Use a fresh isolated target if a partially interrupted import needs recovery.
- GCash is manually verified; no payment gateway, SMS, delivery, loyalty or optional inventory/expense/shift module is integrated.
- Push/background execution depend on browser/OS support, connectivity and permission. Offline draft storage can be evicted by the browser and is not an encrypted backup. No payments are accepted offline.
- Tax/charge configuration is operational only; official tax-invoice compliance requires separate business configuration and validation.

The previous screenshot-driven removal requests were superseded by the latest complete specification, which explicitly includes Staff Management, Audit Logs, Customers, Recent Orders and Outstanding Balances. Optional inventory, expenses and cashier shifts are excluded from the new runtime.
