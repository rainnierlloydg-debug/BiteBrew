# Roles and demonstration checklist

## Role guide

| Capability | Owner | Cashier | Kitchen |
|---|---|---|---|
| Dashboard / POS / orders | Yes | Yes | Kitchen view only |
| Kitchen preparation updates | Yes | Permitted order workflow | Preparing / Ready |
| Cash / manual GCash verification | Yes | Yes | No |
| Approve refunds / preparation-stage cancellation | Yes | Request approval | No |
| Reports | All | Own permitted sales/collection reports | No |
| Menu / prices / uploads | Yes | Browse available menu | No |
| Customer records | Yes | Permitted customer management | No |
| Staff, archives, audits, settings | Yes | No | No |
| General / permitted order chat | Yes | Yes | Confirmed order rooms |
| In-app / browser notifications | Role-scoped | Role-scoped | Role-scoped |

Owners create staff accounts; there is no public staff registration. Deactivation, archiving, password resets and role changes invalidate existing account sessions and sockets. Keep at least one active owner. Use the profile button to change your own password with current-password confirmation.

Walk-in orders need no registration. Optional customer profiles can be linked for repeat business; archiving a profile preserves historical order snapshots. For Pickup, provide a name and future pickup time. Dine-In requires a table number. Contact information is optional.

## Demonstration setup

Use an isolated `_test` database and new browser profile. Do not create fabricated transactions in the business database. Label test product/customer/account names **DEMONSTRATION**, use fictional contacts and do not upload private payment screenshots. The supplied business menu is separate from invented demonstration transactions.

## Acceptance walkthrough

1. Owner signs in, creates a cashier and kitchen account, changes a password, and verifies kitchen cannot open reports/staff APIs. Deactivate a signed-in test account and verify its API/socket access is revoked.
2. Create/edit a category and demonstration product with variant prices, upload/replace its picture, configure add-ons and deactivate a variant. Archive/restore it; verify an archived category blocks restoring its product until the category is restored.
3. As cashier, build an order with quantity, add-ons and instructions. Check subtotal, discount permission and charges. Save once; retry with the same operation ID and confirm only one official number exists.
4. Edit while Pending. Confirm the order, open it in kitchen, mark Preparing then Ready. Verify notes/quantities and redaction of financial details. Verify invalid transitions and ordinary confirmed item edits are blocked.
5. Record a partial cash payment. Record GCash and verify balance remains unchanged until manually approved. Reject a separate pending payment with reason. Finish payment with extra cash, check change, and complete the order only when fully verified.
6. Request cancellation after Preparing and verify owner approval/rejection. Issue partial/full refunds linked to original payments; test limits and confirm completed orders stay completed.
7. Open receipt and kitchen slip inside the current app; inspect the preview, download receipt PDF and test browser/thermal printing. Confirm reprints appear in audit logs.
8. Compare dashboard and reports using matching dates/staff scope. Verify midnight boundaries in Asia/Manila; distinguish completion dates from verification dates. Download CSV/PDF and compare totals and refund categories.
9. Install the PWA after visiting online. Disconnect, reopen cached POS, check Offline/Last synced, save/edit/delete a Local Draft, then queue it. No official number or payment is assigned offline.
10. Reconnect and use Sync Now. Verify accepted mapping, no duplicate after a deliberately interrupted response, and retained drafts on session expiry. Change a menu price/availability before synchronization; verify Needs Review and explicit revised-price acceptance.
11. Attempt logout with unsynchronized drafts; verify warning, then clear private local data on accepted logout. Confirm another account cannot see the first account’s drafts.
12. Enable push with an explicit button, change preferences, test new confirmed/Ready/overdue/refund-request events on appropriate roles, deny permission to verify in-app fallback, and unsubscribe. Test on each deployment’s real browser/provider.
13. Send General and order-linked messages between two browsers. Confirm acknowledgment only after persistence, safe rendering of HTML-like text, unread counts, typing, pagination and missed-message recovery after reconnect. Verify kitchen cannot join an unconfirmed order room.
14. Check desktop, tablet and mobile: collapsible navigation, order panel scroll/footer, touch targets, keyboard focus, modal Escape/unsaved confirmation, reduced motion, readable status text, empty/loading/error/retry states.
15. Create an encrypted backup and restore it into a separate empty `_restore` database. Compare tables/media and financial totals, and repeat sign-in after sessions are invalidated.

Record browser/version, test database name (no credentials), test date, evidence and failures. See [verification](VERIFICATION.md); unchecked steps must not be presented as passed.
