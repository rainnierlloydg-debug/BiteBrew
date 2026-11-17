# API and real-time contract

Base URL: `/api` on the same origin as the frontend. JSON request/response, except multipart upload and CSV/PDF/document output. Authentication is a server-side MySQL session in an HttpOnly, SameSite=Lax cookie (Secure and `__Host-` name in production). No bearer tokens or database credentials belong in the frontend.

Fetch `GET /session` before signing in. Send its `data.csrf` as `X-CSRF-Token` for mutations; login regenerates it. Include credentials with same-origin fetch. Mutations validate Origin when present. Do not disable CSRF to integrate a client. Socket handshake also includes `{csrf}`.

Success: `{data: ...}`. Lists: `{data: [], meta: {page,pageSize,total,lastPage}}`. Reports add `summary`, `period`, `filters`, `scope`, `definitions`, `generatedAt`. Errors: `{error:{code,message,details?}}`; 401 session, 403 permission, 419 CSRF expiry, 409 conflicts, 422 validation, 429 limits, 5xx persistence/service errors. Implemented creates return 200. Never infer success from a local draft save.

Paged lists accept `page` and `pageSize` (1–100). Search uses `q`; date filters use `YYYY-MM-DD` in Asia/Manila. Amount inputs are decimal **strings in pesos**, e.g. `"185.00"`, not centavo integers. Monetary calculations run on the server in integer centavos before saving MySQL decimals. Record identifiers and client operation IDs are UUIDs.

Send a stable `X-Operation-ID` UUID on order/menu/staff/settings/payment/refund/archive/approval mutations. Retries of the same operation/body return the original saved result. Reusing the same ID with changed input returns 409. Start a new ID after reviewing changed input; never replay payment operations through offline draft synchronization.

## Authentication and common endpoints

| Method | Endpoint | Access / input |
|---|---|---|
| GET | `/session` | Public; current safe user/null and CSRF |
| POST | `/login` | `{email,password}`; 10 attempts / 15 minutes per IP |
| POST | `/staff/register` | Public with CSRF; `{name,email,password}`; role is assigned by the owner on approval; 5 requests / 15 minutes. Creates an inactive, pending account without a session. Duplicate emails never overwrite credentials. |
| GET | `/staff?status=pending` | Owner only; paginated pending registrations, without password hashes |
| POST | `/staff/:id/review-registration` | Owner only; `{action:"approve"|"reject",role?:"CASHIER"|"KITCHEN"}` with CSRF and stable operation ID. Approval enables login; rejection archives the inactive account. |
| POST | `/logout` | Signed-in; destroys session and disconnects sockets |
| POST | `/password` | `{currentPassword,password}`; current user |
| GET | `/bootstrap` | Role-limited business details, active categories/discounts, public VAPID configuration |
| GET | `/health` | **Outside `/api`**; database connectivity, no secrets |

## Menu, customer and staff records

The public storefront uses `GET /public/products` without authentication. Results include public variant IDs and prices, plus active categories. Product images are served through `/public/products/:id/image` only for active, unarchived products in active categories.

Customer authentication uses `GET /customer/session`, `POST /customer/register`, `POST /customer/login`, and `POST /customer/logout`. These accounts never grant staff access. Login/registration rotates the session and returns a new CSRF token.

Customer checkout requires an active customer session and CSRF protection. `POST /customer/quote` accepts `{type,contact,pickupAt?,instructions?,items}`; `type` is `TAKEAWAY` or `PICKUP`, scheduled pickup requires a future ISO timestamp, and each item has `{variantId,quantity,addons?,instructions?}`. Identity is taken from the session. Prices, totals, customer IDs, staff IDs and discounts cannot be supplied by the client. The server returns the current price breakdown and `quoteHash`.

After explicit review, `POST /customer/checkout` accepts the same body plus `quoteHash`, with a stable UUID `X-Operation-ID`. It revalidates availability and pricing and creates one Pending, unpaid order. Repeated submissions of the same account/key/body return the original result; changed payloads with that key return 409. Changed prices return 409 `QUOTE_CHANGED` with a new quote for confirmation. Customer orders have no staff creator; `customer_checkouts` records the authenticated account, original response and retry key. Store staff process these orders through the existing order workflow. No online payment is collected by this endpoint.

Owner manages menu, staff, settings and archives. Owner/cashier manage permitted customers and browse active catalog. Kitchen cannot request financial/catalog/staff APIs.

| Method | Endpoint | Behavior |
|---|---|---|
| GET | `/catalog` | Active menu; `q`, `categoryId`, pagination |
| GET/POST | `/menu/products` | Owner list/create; list supports archived=1 |
| PUT | `/menu/products/:id` | Owner update including variants/image |
| GET/POST | `/{categories,addons,discounts,customers}` | List/create permitted records |
| PUT | `/{categories,addons,discounts,customers}/:id` | Update permitted record |
| GET | `/customers/:id/orders` | Linked order history |
| POST | `/uploads` | Owner multipart `file`; JPEG/PNG/WebP ≤3 MB; decode/reencode WebP, ≤25 MP |
| GET/POST | `/staff` | Owner list/create |
| PUT | `/staff/:id` | Owner account update; invalidates account sessions |
| GET | `/archives/:module` | Owner; products/categories/customers/staff |
| POST | `/:module/:id/archive` | Owner; soft archive, actor and audit |
| POST | `/:module/:id/restore` | Owner; uniqueness and relationship checks |
| GET/PUT | `/settings` | Owner; business, logo path, payment methods, charge rates and permissions |
| GET | `/audit` | Owner; paged search of audit records |

Product body: `{code?,name,categoryId,description?,image?,active,demo?,variants:[{id?,name,price,active}]}`. Existing variant IDs must belong to the product. Removed variants become inactive. Images are returned upload paths; upload first, then save product. Archived identifiers remain reserved.

Category: `{name,active}`. Customer: `{name,contact?,active}`. Add-on: `{code?,name,price,active,variantIds:[]}`. Discount: `{name,kind:"FIXED"|"PERCENT",value,active,startsAt?,endsAt?}`. Staff: `{name,email,role:"OWNER"|"CASHIER"|"KITCHEN",active,password?}`; password required on create. Self-demotion/deactivation and removal of the last active owner are blocked.

## POS, kitchen, payment and approval endpoints

| Method | Endpoint | Behavior |
|---|---|---|
| POST | `/orders/quote` | Validate selections and return authoritative quote/hash |
| GET/POST | `/orders` | List/create; filters q/status/from/to/customerId |
| GET/PUT | `/orders/:id` | View/update snapshot; Pending editing; owner correction while Confirmed with reason |
| POST | `/orders/:id/status` | `{status,version,reason?}`; validated transitions |
| GET | `/kitchen` | Owner/kitchen; paged active Confirmed/Preparing/Ready, financial fields redacted |
| POST | `/orders/:id/payments` | `{method:"CASH"|"GCASH",amount,reference?}` |
| POST | `/payments/:id/verify` | `{approved,reason?}`; GCash manual verification/rejection |
| POST | `/payments/:id/refunds` | Owner `{amount,reason}`; limit enforced |
| POST | `/orders/:id/requests` | `{kind:"CANCEL"|"REFUND",paymentId?,amount?,reason}` |
| POST | `/requests/:id/review` | Owner `{approved,reason}` |
| GET | `/{payments,refunds,requests}` | Owner/cashier; status/pagination |

Order input:

```json
{
  "type": "TAKEAWAY",
  "customerId": null,
  "customerName": null,
  "contact": null,
  "tableNumber": null,
  "pickupAt": null,
  "instructions": "",
  "discountId": null,
  "items": [{"variantId":"UUID","quantity":1,"addons":[],"instructions":""}]
}
```

Use `DINE_IN` with table number; use `PICKUP` with customer name and a future ISO pickup timestamp. Quote first, then add its `quoteHash` to create/update. Updating adds current `version`; owner corrections after confirmation add `reason`. Stale versions return 409. Quote mismatch returns `QUOTE_CHANGED` with `error.details.quote`; unavailable selections return `MENU_CONFLICT`. Display differences and obtain explicit acceptance before replacing the saved hash. Official order numbers are server-generated only after persistence.

Kitchen may only mark Preparing or Ready. Confirmation/ordinary cancellation/completion belongs to cashier/owner. Cancellation needs a reason; Preparing/Ready requires owner authorization. Full verified payment is required for completion. Pending GCash does not reduce balance. Cash input is tendered amount, applied up to balance, remainder becomes change. GCash overpayments are rejected. Refunds preserve payment/order history and do not reopen completed status or balances.

## Reports and documents

| Method | Endpoint | Access |
|---|---|---|
| GET | `/dashboard` | Owner/cashier; from/to |
| GET | `/reports/:type` | Owner/cashier according to report permissions |
| GET | `/exports/:type/:format` | Same report filters; csv/pdf |
| GET | `/documents/orders/:id/receipt` | **Outside `/api`**; owner/cashier HTML preview |
| GET | `/documents/orders/:id/receipt.pdf` | **Outside `/api`**; authorized PDF download |
| GET | `/documents/orders/:id/kitchen` | **Outside `/api`**; kitchen slip preview |
| POST | `/documents/:id/printed` | `{kind:"receipt"|"kitchen"}`; audit browser print action |

Report types: sales, transactions, items, cancelled, discounts, collections, refunds, balances. Filters: from/to, staffId, status, method, q, variantId (item rows only), page/pageSize. Cashier access is limited to sales/transactions/items/collections/balances and their own order/collection scope. Balances are current all-time values; selected-period sales use completion timestamps; collections use verification timestamps; refunds use issue timestamps. Method filters apply to collection/refund figures, not completed sales. Exports use all matching rows, capped at 50,000; PDF cap 3,000 rows.

## Notifications and WebSocket chat

| Method | Endpoint | Input / behavior |
|---|---|---|
| GET | `/notifications` | unread=1 optional; paged with unread count |
| POST | `/notifications/read` | `{ids:[UUID]}`; account-scoped |
| GET/POST | `/push/subscriptions` | List / `{subscription,preferences}`; browser-generated PushSubscription JSON |
| DELETE | `/push/subscriptions/:id` | Remove own subscription |
| DELETE | `/push/subscriptions` | Remove all own subscriptions |
| GET/POST | `/chat/rooms` | List / `{orderId?}` general or order room |
| GET | `/chat/rooms/:id/messages` | before/after integer message cursor, limit≤100 |
| POST | `/chat/messages` | Online REST fallback `{roomId,clientId,text}` |
| POST | `/chat/rooms/:id/read` | `{messageId}`; room checkpoint |

Socket.IO endpoint `/socket.io/`, `transports:['websocket']`, `auth:{csrf}` and session cookie. Origin must match APP_ORIGIN. Events use acknowledgment `{data}` or `{error}`:

- `room:join` / `room:leave`: `{roomId}`.
- `message:send`: `{roomId,clientId,text}`; 1–2,000 characters, saved before acknowledgment, stable clientId deduplication.
- `typing`: `{roomId,typing}`; rate-limited.
- Server: `message:new`, `typing`, `invalidate:{topic,id}`, `session-expired`.

General chat is for active staff. Kitchen order rooms require an already-confirmed order. All connections/packets recheck the stored session and active account; a periodic check disconnects expired sessions. Clients re-fetch authoritative operational data and request `messages?after=<lastId>` after reconnect. Render message text as text, never executable HTML. Push text is generic; notification clicks still require normal session/role authorization.
