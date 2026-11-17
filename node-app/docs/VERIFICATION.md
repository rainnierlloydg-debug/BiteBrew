# Completed source, evidence and remaining acceptance

## Shared sign-in and administrator-managed staff

The 41-test suite passes with the shared `/api/login` endpoint for customers, owners, cashiers and kitchen staff. Integration checks cover automatic destinations, role isolation, session rotation between account types, disabled accounts, rejected role injection, duplicate-email protection, blocked public staff signup and owner-only staff creation. Browser checks cover the single `/login.html` form, customer checkout after registration, administrator-created staff signing straight into the kitchen, sign-out confirmation, and retaining drafts when account switching is canceled. Legacy staff and customer workspace URLs redirect anonymous users to the shared sign-in page.

## Push notification pipeline verification (17 November 2026)

The current suite passes 41 automated tests. Push-specific tests use the real isolated MySQL database for subscription ownership, outbox acceptance, retries, expired endpoints, role restrictions, interrupted final attempts and VAPID key-pair validation. The transport is injected in these tests; they do not contact a real browser push provider. Service-worker tests verify payload display and safe routing to the staff workspace without redirecting a customer tab.

Headless browser fixtures also pass Enable, Test, blocked permission, key renewal, server-registration recovery after local cache loss, and per-device Unsubscribe. Browser permission and subscription APIs are simulated in that fixture. To verify actual device delivery, enable push on the live Notifications page, grant browser permission, and choose Send test notification. A server acceptance response and an actual device notification are separate observations; the latter still requires a permitted browser/device and an available push provider.

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


Account confirmation checks: all 42 automated tests passed, including isolated MySQL checks for no account before confirmation, code expiry, five-attempt lockout, resend cooldown and token replacement, one-time verification, delivery failure cleanup and shared-login access after verification. Email transport is injected in tests; actual email delivery remains pending SMTP sender configuration. Browser fixtures verify Create Account and shared login at 1366x768, 1280x720, 1024x600, 390x844, 360x640, 320x568 and 844x390 with no page scrolling or clipped inputs/actions. The code confirmation screen is checked at desktop, small mobile and landscape sizes. These are viewport layout checks with the on-screen keyboard closed.

Browser history protection: landing ends the current staff session and locks the cached workspace until explicit sign-in. The browser harness exercises real CDP history Back/Forward entries, refresh, direct staff URLs, offline navigation, a restored-page event, paused synchronization and preserved drafts after re-login. Private content is hidden while restoring and checking a session.
