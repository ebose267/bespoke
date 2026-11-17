# Client onboarding and deployment (repeatable)

One client = one Google account + Sheet + Apps Script deployment + Cloudinary preset + **two** Netlify sites (storefront and unlisted admin). No client ever shares data with another.

## 0. Intake
Collect: business name, logo, brand colours/fonts, product list and photos, WhatsApp number, owner email, contact details, policies they actually have, hero image/headline, the 3 trust claims they truly honour, which modules to enable. (Full list: Thimble spec §18.)

## 1. Backend (signed in as the CLIENT's Google account)
1. Create a Sheet. **Extensions → Apps Script**, replace the contents with `backend/Code.gs`.
2. Project Settings → time zone **Africa/Lagos**.
3. Run `setupSheets()` once. Check the four tabs. (Existing client? **Back up the Sheet first**; this only appends the four new Products columns.)
4. In `setToken()` put a random secret of 24+ characters, run it once, then **delete the plaintext from the source and save**. Never put the token in Git, chat or AI Studio.
5. Run `installTriggers()` and approve permissions.
6. Optional: run `backfillProductDates()` if New Arrivals should start populated.
7. **Deploy → New deployment → Web app**: Execute as *Me*, access *Anyone*. Copy the `/exec` URL. (Updating an existing client: *Manage deployments → pencil → New version*, still signed in as the client, so the URL stays the same.)
8. Check `<url>?action=storefront` in a browser: valid JSON, no `owner_email`.

## 2. Images (Cloudinary)
Create an unsigned upload preset restricted to JPG/PNG/WebP, a size limit and a folder. Decide per client whether to use their own Cloudinary account (recommended). Never place an API secret in any file.

## 3. Storefront site (Netlify A)
Repo connected; build `npm run build`; publish `dist/store`; env `VITE_API_URL=<exec url>`, `VITE_CLIENT=<client-file>`. Add the client's domain. Security headers come from `public/_headers`.

## 4. Admin site (Netlify B, unlisted)
Separate site; build `npm run build:admin`; publish `dist/admin`; env `API_URL`, `CLOUDINARY_CLOUD`, `CLOUDINARY_PRESET`. The build fails loudly if any value is missing or a placeholder. Put the admin URL in the dashboard setting `dashboard_url`. **Never deploy `admin-preview.html` as the live dashboard** (demo only; regenerate with `npm run build:preview`).

## 5. Content
In the dashboard: Settings (name, brand colour, logo, banner, categories, About, contact, hours, Instagram), then products (price ≥ 1, stock, category, images, optional original price, "Feature on homepage").

## 6. Live acceptance (all must pass on the client's own accounts)
1. `?action=storefront` valid JSON, no private fields.
2. Wrong token → error; correct token still signs in (note the slow-down).
3. Create products at stock above threshold, at threshold, and 0; labels right on dashboard and storefront.
4. Edit price/description/images; storefront updates within ~1 minute (cache) with no redeploy.
5. Add to cart, lower stock in the dashboard, reload: line clamped/removed; checkout with stale stock is rejected and no order is created.
6. Place a low-value test order (controlled email/phone, including a `+234…` phone): Pending in dashboard, customer + owner emails, WhatsApp prefilled, confirmation shows the real ID and server total.
7. Retry/double-submit: exactly one order and one customer count.
8. Two pending orders for the last unit → first confirms; second shows the shortage warning; "Confirm anyway" only as a business decision.
9. **Undo payment** on a test order: stock returns, order is Pending, customer spend reverses; re-confirm deducts once.
10. Cancel Pending; Paid cannot be cancelled (use Undo first).
11. Receipt email arrives once; test retry after a temporary mail failure if possible.
12. `dailySummary()` manually: email with the stock table; check the trigger the next day.
13. Change the token: old sessions rejected.
14. Android Chrome at 360px and the owner's normal device; check spam folders and the sending address.

## 7. Migrating an existing store (e.g. Synthova Oil on the Fixed or v2 backend)
1. Copy the Sheet. 2. Paste v3 `Code.gs`, run `setupSheets()` (adds columns; saved WhatsApp numbers are normalised). 3. Redeploy as a **new version** (same URL). 4. Deploy the new admin (build from `admin/admin.html`) and storefront together; do not mix old and new admin/backend. 5. Old customer links like `#product/P1` redirect automatically. 6. Run §6.

## 8. Handover
Public URL + domain ownership, unlisted admin URL, token via a secure channel, owner guide (products, stock, orders, confirm payment, undo, settings), Sheet/Apps Script/Cloudinary ownership, support scope, known limits (manual payment confirmation, no delivery fees, no newsletter sending).
