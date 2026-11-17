# Backend contract (Code.gs v3.0.0)

Google Apps Script web app bound to the client's Sheet. Deploy: **Execute as: Me**, **Who has access: Anyone**. Every response is HTTP 200 JSON: `{ ok: true, ... }` or `{ ok: false, error: "message" }`. POST bodies are JSON strings sent as `Content-Type: text/plain;charset=utf-8` (anything else triggers a CORS preflight Apps Script cannot answer).

## 1. Public GET (anonymous, read-only)

| Request | Returns |
|---|---|
| `?action=storefront` | `{ ok, products[], settings{}, bestSellers[{id,rank}], generatedAt }` (what the storefront uses) |
| `?action=products` | same as above without `bestSellers` (original shape, still supported) |

**Product (public):** `id, name, price, description, category, images[], stock, status, created_at, featured(bool), compare_at_price`.
- `status` is derived server-side; zero stock is always `Out of Stock`.
- `created_at` is set once by the backend (`yyyy-MM-dd HH:mm:ss`, Africa/Lagos). Empty for rows created before v3 (the UI never fakes a date).
- `compare_at_price` is `0` unless the owner entered a genuine original price **higher** than `price`.
- `bestSellers`: ranked product IDs from **Paid** orders only, existing products only. No unit counts, no customer data.

**Public settings (allow-list):** `store_name, currency_symbol, brand_color, logo_url, banner_text, categories, whatsapp_number (digits, country code), tagline, about_title, about_text, contact_phone, contact_email, contact_address, opening_hours, instagram_url`. Never `owner_email`, `dashboard_url`, `admin_token_hash`.

**Caching:** responses are cached 60 s in `CacheService` and cleared immediately by any write to Products or Settings, so dashboard edits appear on the next load. A cache hit takes no lock, so visitor traffic cannot starve checkout. Catalogues over ~90 KB skip the cache (still correct, slower).

## 2. Public POST

### `placeOrder`
```json
{ "action":"placeOrder", "name":"", "email":"", "phone":"", "address":"", "newsletter":false,
  "items":[{"id":"P…","qty":2}], "request_id":"16-100 chars [A-Za-z0-9_-]", "started_at":1731600000000, "website":"" }
```
Returns `{ ok, orderId, total, whatsappUrl, repeatedRequest }`.
- Prices and totals are **always** recomputed from the Sheet; the browser never supplies them.
- `request_id` makes retries idempotent. Reusing a key with different details is rejected. Duplicate lines are merged before the stock check.
- Honeypot (`website` must be empty), time-trap (`started_at`), per-email/phone throttle (5 / 10 min).
- Order is saved **Pending**; stock is deducted only when the owner confirms payment.
- Typical errors: `Sorry, only N of "X" left.`, `A product in your cart is no longer available.`, `Please enter a valid phone number with 7–15 digits.`

### `login` `{ token }` → `{ ok, session }`
Six-hour session in script cache bound to the token hash (changing the token revokes sessions). Wrong guesses are **slowed** (1 s → 3 s, outside any lock) rather than locked out, so the owner can always sign in. Use a token of 24+ random characters.

## 3. Protected POST (`session` required in the body)

`getDashboard, getOrders, getProducts, getCustomers, adminGetSettings, saveSettings, saveProduct, deleteProduct, updateCustomer, markPaid, revertPaid, cancelOrder, retryReceipt, retryOrderEmails`.

- **saveProduct** `{ product:{ id?, name, price(≥1), stock, category, description, images[], status_locked, status, featured, compare_at_price, stock_loaded?, request_id (new products) } }`. Edits send `stock_loaded` (stock when the form opened): if the stock box is untouched the live value is kept; if it was changed while a sale moved stock, the save is refused.
- **markPaid** `{ orderId, force? }` → `{ ok, receiptSent, receiptInProgress }` or `{ ok:false, error:"low_stock", shortages[] }`. Uses a journaled, resumable plan; never deducts twice.
- **revertPaid** `{ orderId }` returns stock using the **actually deducted** quantities (recorded at payment time), resets the order to Pending, rebuilds customer spend, and resets the receipt flag. Journaled (`REVERTING`) so an interruption cannot double-restore.
- **cancelOrder**: Pending orders only.
- **saveSettings**: allow-listed keys only; `whatsapp_number` is normalised (`0801…` → `234801…`).

## 4. Schema (setupSheets is append-only)

Products: `id, name, price, description, category, images, stock, status, status_locked, create_request_id, create_fingerprint, created_at, updated_at, featured, compare_at_price`. Orders and Customers unchanged from the audited release. Re-running `setupSheets()` appends missing columns, never moves data. **Back up the Sheet before the first v3 run.**

Optional one-time helper `backfillProductDates()` stamps products that have no `created_at` (using the migration time, in sheet order). Run it only if New Arrivals should start populated; the dates are *not* true creation dates.

## 5. Data-safety notes

- Formula-injection protection escapes only dangerous strings (`=`, `@`, leading `-`, `+` not followed by a phone-like number). `readRows` un-escapes symmetrically, so values and idempotent retries round-trip exactly, whether or not Sheets hides the apostrophe.
- Phone numbers like `+234 801 234 5678` are stored untouched.
- One damaged order row cannot break the dashboard order list.
- Daily summary looks back 6 hours so a late trigger reports the day that just ended.

## 6. Limits (unchanged from the audit)

Manual payment confirmation (no gateway), no delivery-fee calculation, newsletter consent capture only (no sending/unsubscribe), best-effort email, Sheets suited to small/moderate stores (full-tab reads), public order spam only partly mitigated (add Turnstile/CAPTCHA for high traffic). **Not verified live in this delivery:** real Google deployment, Gmail quota, Cloudinary upload, real mobile browsers. Use `docs/CLIENT-ONBOARDING.md` §6.

## 7. Phase C: not built, contracts proposed (do not fake in the UI)

| Feature | Minimum backend | Notes |
|---|---|---|
| Blog | `Posts` tab (`id, slug, title, excerpt, cover_image_url, body_json, category, author_name, status, published_at, …`), public `?action=posts` / `?action=post&slug=` (published only), protected `savePost/getPosts/deletePost` + admin editor | A Sheets cell holds ~50,000 characters: cap body size; use a block schema, never raw HTML |
| Category art/description | `Categories` tab (`id, name, slug, description, image_url, sort_order, is_active`) + `saveCategory` | Today tiles use the first product image of each category |
| Editable homepage sections | `HomepageSections` records with fixed section types | Today hero/trust/promo live in `src/config/clients/*.js` (designer-owned) |
| Delivery fees | zones/rules + server-side fee in `placeOrder` | Never calculate in the browser |
| Payment gateway | provider integration, server verification/webhooks, payment-state model | Separate project |
| Newsletter sending | external provider + signed unsubscribe | Consent is captured today |
