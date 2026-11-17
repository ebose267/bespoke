> **Historical document (Store-System-Fixed audit).** The v3 release supersedes it where they differ. See `docs/CHANGELOG-AUDIT-FIXES.md`. Its live acceptance checklist is still valid and is reproduced in `docs/CLIENT-ONBOARDING.md`.

# Store System — Critical Audit, Fixes and Deployment Checklist

## Executive result

The original design is workable for a small shop, but the first implementation had important failure paths around duplicate checkout requests, duplicate cart lines, interrupted stock deductions, concurrent order actions, email failures, weak input validation and incomplete error recovery. I rewrote the backend and updated the live storefront, owner dashboard and preview dashboard to close those gaps without changing the agreed architecture: Google Sheets + Apps Script, Netlify static pages, Cloudinary images, email notifications and WhatsApp checkout.

**Local test result:** 27 backend simulation tests passed; 7 frontend/static checks passed. All inline JavaScript blocks parse, and all three HTML pages parse. These are automated local tests, not proof of a live Google deployment.

**Not verified live:** no live Google Sheet, Apps Script deployment, Gmail inbox/quota, Cloudinary upload, Netlify site, WhatsApp handoff or real mobile browser session was used. The browser environment blocked the local test site, so interactive visual/mobile QA remains a deployment task.

---

## Feature-by-feature audit

| Feature | How it could break | What changed | Remaining condition / risk |
|---|---|---|---|
| Sheet setup and migration | A new version can expect columns that an older client Sheet does not have; rebuilding headers can shift or overwrite existing data. Duplicate headers can make a row update target the wrong field. | `setupSheets()` now adds missing headers at the end, preserves existing column positions and values, applies text formatting to text fields, adds missing settings only, and errors on duplicate headers. | Back up the client's Sheet before the first migration. A manually damaged header row or duplicate Settings key still requires repair. |
| Admin authentication | A client-side-only password check exposes admin writes; old sessions may remain valid after a token change; repeated guesses can abuse a shared lockout. | Admin routes are checked server-side. Sessions are six-hour cache entries bound to the active token hash, so changing the hash revokes old sessions. Valid owner login is still allowed after wrong guesses have reached the throttle threshold. | Cache entries can be evicted early. The failed-login counter remains global because Apps Script does not provide a reliable client IP here; this is not per-IP rate limiting. |
| Public catalogue | Bad rows, malformed values or an unavailable API can make the entire store appear empty or broken. A corrupt product status can contradict stock. | The storefront validates the response shape, displays a retry state instead of fake products, escapes dynamic content and normalises product status. Zero stock is always returned as `Out of Stock`. | If the Sheet is unavailable, the catalogue cannot load; the page offers a retry rather than an offline catalogue. |
| Product create/edit/delete | A browser timeout after a successful save can create duplicate products; decimal or negative stock/prices can pollute the Sheet; deleting an item referenced by a pending order can break its payment. | Server-side validation enforces whole-naira prices and integer stock. New-product saves use an idempotency key that is retained in session storage across an uncertain response/reopen. Deletion is blocked while a Pending order refers to that product. | If browser storage is unavailable and the owner closes the form after an ambiguous timeout, the same save key may not survive reopening. The owner should refresh the product list before manually re-entering a product after a timeout. |
| Product images | A file that is too large or not an image can be uploaded; an unsigned preset can be abused by anyone who inspects the page source. | Dashboard checks JPG/PNG/WebP, a 5 MB per-image limit and maximum 8 images; backend accepts only HTTPS image URLs and rejects the pipe delimiter used by the Sheet. Preview uploads are local Blob previews and make no Cloudinary requests. | Client-side limits are not security controls. Restrict the unsigned preset in Cloudinary (allowed formats, file size, folder and transformations). The configured Cloudinary account/preset is shared in this build; client assets therefore live in that account unless a separate account is created. |
| Cart | Old local storage can contain deleted products, out-of-stock items, invalid quantities or duplicate lines. Stock can change after the customer loaded the page. | Cart parsing rejects non-array storage; initial load removes deleted/out-of-stock items, merges duplicate lines and clamps quantities. Every checkout is revalidated against the Sheet. | A customer can still see a stale price/stock figure until refresh; the server's checkout validation is authoritative and rejects stale availability. |
| Checkout | The browser could submit its own price; duplicate lines could bypass stock checks; network timeouts could create duplicate orders; bots could spam public orders. | Server recalculates prices, validates every product and quantity, aggregates duplicate product IDs, checks totals, assigns unique order IDs, stores a request ID and returns the same order for a matching retry. A key reused for different order details is rejected. A basic honeypot, time check and per-email/phone throttle were added. | The honeypot/time trap can be bypassed by a bot, and the email/phone throttle can be bypassed with many identities. A CAPTCHA/edge rate limiter is still advisable for a public high-traffic store. |
| WhatsApp handoff | Browser popup blockers can prevent the automatic WhatsApp tab; an invalid shop number can make the link unusable. | A tab is opened during the original click gesture and navigated after checkout; the confirmation page also contains a manual button. The backend validates/normalises the configured number and can return no link if it is invalid. | The customer must still actually press Send in WhatsApp. Saving the order does not prove that the message was sent or that payment was made. |
| Order lifecycle | Double-clicking Confirm payment can deduct stock twice; two pending orders can compete for the last units; cancelling and paying simultaneously can race. | Payment and cancellation share a script lock. A persisted `PREPARED` payment plan records exact post-payment stock values before writes; interrupted payment operations can be safely resumed without subtracting stock twice. Low-stock confirmation is checked before any change. | Two Pending orders for the last unit are still allowed by design. The second payment confirmation raises a shortage warning. “Confirm anyway” should only be used when the business is knowingly accepting a backorder/substitute or otherwise resolving the shortage. Payment is manually confirmed by the owner; no gateway verifies funds. |
| Inventory and manual status | A manually locked status could continue to say “In Stock” after the last unit is sold. A partial script failure could leave stock deducted but the order Pending. | A zero-stock item is forced to `Out of Stock` even when a manual status was locked. Payment recovery re-applies absolute stock targets and then completes the order/CRM update. Product writes, deletion and payment share the same lock. | If an operator manually deletes a product row directly in Sheets while a payment journal is PREPARED, recovery pauses until that product row is restored or the data is repaired. The client should never edit the Sheet. |
| Customer CRM | Repeated payment callbacks/retries could inflate order count or lifetime spend; a failed intermediate write could leave CRM totals inconsistent; consent could be lost. | Customer order count and spend are rebuilt from Orders rather than incremented blindly. Order snapshots retain newsletter consent and date. Unchecked later checkouts do not unsubscribe a customer. Customer notes/tags remain separate. | This is consent capture/export only. Newsletter sending and an unsubscribe workflow are not built; do not send campaigns from this dashboard until those are implemented or an external email provider handles unsubscribes. |
| Order emails and receipts | Mail quota exhaustion or temporary errors can leave a saved order without one or both notification emails; retrying can send duplicates; marking an order Paid can succeed even when the receipt fails. | Each order-notification email and receipt has a separate state. The dashboard exposes retry actions. Receipt failure is reported without rolling back a paid order or changing stock. An in-progress lease suppresses concurrent duplicate sends. | Exactly-once email delivery cannot be guaranteed: Apps Script can crash after MailApp accepts a message but before the Sheet records `yes`. After the lease expires, a retry may send a duplicate. Gmail quotas and spam filtering still apply. |
| Daily summary | Wrong project timezone can shift dates; duplicated triggers can send duplicate reports; the report can omit stock information. | Trigger installation removes old dailySummary triggers, uses `Africa/Lagos`, and the report includes paid sales, orders, pending count, new customers, new subscribers and every product's stock/status. | Google time triggers are approximate, not exact to the minute. The Apps Script project timezone must also be set to `Africa/Lagos`; verify the first actual email. |
| Settings | A dashboard user could overwrite the token hash or set malformed branding/WhatsApp/email settings; a zero stock threshold could accidentally be treated as a missing value. | Server-side allow-list and validation protect private keys and validate email, WhatsApp, hex colour, URLs, categories and threshold. Zero is accepted as a valid threshold. | A manual edit to the hidden Sheet bypasses dashboard validation. Protect Sheet access and avoid manual changes except builder support. |
| CSV export | Customer-controlled values beginning with spreadsheet formula characters can execute when opened in Excel/Sheets. | CSV cells are quoted and formula-like prefixes are neutralised. Backend writes also prefix formula-like user strings so Sheet cells do not interpret them as formulas. | Test a sample export in the spreadsheet software the client uses during rollout; CSV import behavior differs across applications. |
| Dashboard and analytics | One failed endpoint can produce partially loaded or misleading numbers; UTC dates can shift Lagos sales into the wrong chart day; large tabs slow down. | Dashboard shows errors instead of demo values, loads all required panels together, handles session expiry, retries email actions and groups its 7-day chart by Lagos date. | Orders/customers/products are still read from full Sheet ranges and loaded together. Performance will degrade as the Sheet grows to several thousand rows. Pagination, caching and archival are future scale work. |
| Preview dashboard | A demo page could accidentally write to the real Sheet or Cloudinary if its API replacement is incomplete. | Preview uses in-memory demo data, has a visible Preview mode banner, makes no API/Cloudinary fetches and uses temporary browser Blob URLs for image preview. | It has no real authentication and is not a production admin dashboard. Do not deploy it as the owner's live dashboard. |

---

## Important behavior that remains intentional

- Stock is deducted only when the owner confirms payment, not when a customer places a Pending order.
- Order statuses remain Pending, Paid and Cancelled; no shipping/processing states were added.
- Checkout remains WhatsApp-based. There is no Paystack/Flutterwave integration in this release.
- Delivery fees are not calculated or collected by checkout in this release.
- Newsletter subscriptions can be exported, but there is no in-dashboard campaign sender or unsubscribe link.
- Public product stock counts and the public Apps Script URL remain visible by design. The API URL is not an admin secret; staff actions still require a valid session.

## Local tests performed

### Backend simulation — 27/27 passed

The test harness runs the Apps Script source in Node with mock implementations of SpreadsheetApp, LockService, CacheService, Utilities, ContentService, ScriptApp and MailApp. It covers:

1. Four-tab creation and migration of legacy order columns without moving existing data.
2. Token login, session issue and immediate session invalidation after a token change.
3. Wrong-token throttling and successful owner login after the threshold.
4. Public settings allow-list; owner email and token hash are not exposed.
5. Product status calculation, invalid price/stock/image rejection and product-create idempotency.
6. Manual product status validation and forced Out of Stock at zero stock.
7. Phone validation, duplicate order-line aggregation and server-side price calculation.
8. Checkout idempotency, payload mismatch rejection, CRM consent and duplicate-email suppression.
9. Order notification retries after quota exhaustion; repeated retries do not send again after success.
10. Payment stock deduction once, oversubscribed pending orders, force behavior and cancellation rules.
11. Product deletion guard and old order snapshots after product deletion.
12. Recovery after an interrupted PREPARED payment and receipt-email retry without stock changes.
13. Settings restrictions, formula-like text handling, dashboard/customer endpoints and daily stock summary.

The lock mock is not a true concurrent execution environment; these tests verify the state transitions and recovery logic, not Google Apps Script's real concurrent scheduling behavior.

### Frontend/static checks — 7/7 passed

- JavaScript syntax for all three pages.
- Required hash routes and invalid-product routing.
- Checkout sends IDs and quantities, not browser prices, using `text/plain` POST.
- URL validation, escaping, cart normalisation and WhatsApp popup fallback.
- Dashboard session/API patterns, receipt and notification retry paths, CSV safety and product-save idempotency.
- Preview contains no live API or Cloudinary fetch.
- Static HTML IDs are unique.

All three HTML documents parsed successfully. These checks do not prove that CSS looks correct or that all interactions behave correctly on every device/browser.

---

## Live deployment checklist

Do these steps on a **backup copy** first, then move to the client's live Sheet.

1. **Back up the Sheet.** Make a copy before changing Apps Script or running migration.
2. **Replace the files as one matched release.** Use this folder's `Code.gs`, `index.html` and `admin.html` together. Do not mix the new backend with an old admin page; the new product creation flow uses an idempotency key and the backend adds new columns. `admin-preview.html` is demo-only.
3. **Migrate the Sheet.** Replace the bound Apps Script code with `Code.gs`, save, then run `setupSheets()` once. It appends missing columns; check the four tabs and confirm existing product/order/customer rows remain intact.
4. **Set timezone.** Apps Script Project Settings → Time zone → `Africa/Lagos`.
5. **Set the admin token.** In `setToken()`, replace the placeholder with a long random token of at least 24 characters, run the function once, then remove the plaintext token from the source and save. Do not send the token in a chat or commit it to Git.
6. **Install the daily trigger.** Run `installTriggers()` once and approve the requested permissions.
7. **Deploy the web app under the client's Google account.** Execute as Me; access Anyone. Emails are sent from the Google account that deploys the script. The `owner_email` setting is the alert recipient/reply-to, not the sending account. Keep the client's Sheet/script owned by the client's account.
8. **Update configuration.** If the deployment URL changes, update `API` in both `index.html` and `admin.html`. Confirm `CLOUD` and `PRESET` in `admin.html` match the intended Cloudinary account/preset. Never put a Cloudinary API secret in either HTML file.
9. **Restrict Cloudinary.** Configure upload preset allowed formats, size, folder and any upload restrictions. Decide whether each client should get a separate Cloudinary account; the current configuration points to the builder's account.
10. **Deploy Netlify.** Publish `index.html` as the storefront and `admin.html` at a separate, unlisted admin URL. Put that admin URL in `dashboard_url`. Do not publish `admin-preview.html` as the live dashboard.
11. **Run the live acceptance tests below.** Do not accept a client until all critical tests pass against the client's own Sheet and account.

### Live acceptance tests

- Open the Web App `/exec?action=products` in a browser and confirm valid JSON and the intended public settings only.
- Sign into the dashboard with the new token. Enter a wrong token, confirm the error, then confirm the right token still works.
- Create a product with stock 8, one with stock 3 (or at/below threshold), and one with stock 0. Check the labels on the dashboard and storefront.
- Edit name, description, price, category, status lock and images. Check that the storefront reflects the changes without redeploying Netlify.
- Add an item to cart, refresh, change stock from the dashboard, then attempt checkout. Confirm the backend rejects stale stock and does not create an invalid order.
- Place a real low-value test order using a controlled email and phone. Verify Pending status, customer record, consent state, customer email, owner email and the WhatsApp pre-filled message.
- Repeat the same checkout after simulating a slow/lost response (do not change details) and verify there is still only one order and one CRM increment.
- Place two pending orders that compete for the last item. Confirm the first; confirm the second raises the shortage warning. Use Confirm anyway only as a deliberate business decision.
- Cancel a Pending order. Confirm that a Paid order cannot be cancelled.
- Confirm the payment receipt arrives once. Test retry after a controlled temporary mail failure if possible.
- Run `dailySummary()` manually and confirm the owner receives the report with the complete stock table. Then check the scheduled trigger on a later day.
- Change the token and confirm the old dashboard session is rejected.
- Test the storefront and dashboard on a 360 px mobile viewport and desktop browser; include Android Chrome and the browser the owner normally uses.
- Confirm the sender address is the client's intended Google account and inspect spam/promotions folders.

---

## Residual risks to keep on the launch checklist

1. **Mail delivery is best-effort, not guaranteed.** Quotas, spam filtering and the external send/flag crash window can still cause missing or duplicate messages.
2. **The unsigned Cloudinary preset is public.** Restrict it at Cloudinary or move to per-client accounts/signed uploads.
3. **Public order spam is still possible.** The basic form traps and identity throttle are not a substitute for CAPTCHA or edge rate limiting.
4. **Sheets is not a high-volume transactional database.** Full-tab reads and a script-wide lock are appropriate only while the shop remains small/moderate.
5. **Payment is manually confirmed.** There is no gateway webhook or independent payment verification.
6. **Newsletter and delivery workflows are incomplete.** Consent export exists, but send/unsubscribe and delivery-fee calculation do not.
7. **No live integration/browser validation has yet been performed.** Complete the live acceptance checklist before onboarding a paying client.
