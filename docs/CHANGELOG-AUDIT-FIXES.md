# v3.0.0: what changed from the audited "Store-System-Fixed" release

Every item below is covered by an automated test that was mutation-checked (the test fails when the fix is removed).

## Repo and process
| Problem found | Fix |
|---|---|
| Two generations of `Code.gs`/`admin.html`/`index.html` in one project (the later set uploaded as `*_1.*`); tests, preview and core files didn't match each other | One clean tree. v2 and the old Handoff are not shipped. Old storefront kept only in `legacy/` as read-only reference |
| `test_backend.js` read `/mnt/data/store-system-fixed/Code.gs` | Reads `Code.gs` next to itself |
| Frontend tests matched literal code strings, so any redesign would fail them | Replaced by behaviour tests: 28 core unit tests + 11 full-journey tests through the real React app + 10 admin/preview/build checks |
| Real API URL and Cloudinary cloud/preset hard-coded in three files | Placeholders; injected per client at build time (`VITE_API_URL`, `API_URL`, `CLOUDINARY_*`); build fails if missing |
| `admin-preview.html` drifted from `admin.html` | Generated from `admin.html` + `admin/preview-mock.js`; tests fail if a dashboard function or action is missing from the preview |
| No CI, no security headers | `.github/workflows/ci.yml`, `public/_headers` (CSP, frame/MIME/referrer policies), `netlify.toml` |
| Hash links break when moving to the new router | `legacyHash.js` redirects `#product/P1` → `#/product/P1` |

## Backend (`Code.gs`)
| Problem | Fix | Test |
|---|---|---|
| Public GET took the global lock and re-read Sheets on every page view | 60 s public cache, no lock on a hit, cleared on any Products/Settings write; `storefront` bundle action | v3: cached without a lock and cleared by writes |
| `login` took the global lock, and "throttle" never delayed anything | No lock; 1–3 s slow-down outside any lock; owner still never locked out | v3: slowed outside any lock |
| Stale edit form could overwrite live stock (regression from v2) | `stock_loaded` guard | v3: stale edit form |
| No way to undo a mistaken "Confirm payment" | `revertPaid` with a resumable journal, restoring what was actually deducted | v3: undo (x2, incl. interrupted + forced shortage) |
| `+234…` phones stored as `'+234…`; identical retries could be rejected as "different details" | Phone-safe escaping + symmetric un-escape on read | v3: +234 phone retry |
| Local WhatsApp numbers (`0801…`) produced dead links | Normalised on save, on read and in `setupSheets` migration | v3: WhatsApp normalised |
| A ₦0 product could be created | Price must be ≥ 1 | v3: price at least 1 |
| One damaged order row broke the dashboard | Tolerant parsing per row | v3: damaged order row |
| Daily summary ran empty if the trigger fired after midnight | 6-hour lookback | v3: daily summary |
| Settings re-read inside loops | Threshold computed once per recovery; settings once per receipt | n/a (performance) |
| Needed for the new storefront | `created_at`, `updated_at`, `featured`, `compare_at_price`; `bestSellers` (paid orders only, ids + ranks only); `backfillProductDates()` | v3: created_at, backfill, sale price, best sellers |

Tests: **40 backend simulation** (27 original, 2 updated for deliberate behaviour changes, 13 new).

## Owner dashboard (`admin.html`)
`stock_loaded` guard, price ≥ 1, original price + "Feature on homepage", **Undo payment** in the order dialog, Escape closes dialogs and focus moves into them, WhatsApp hint accepts local format, configuration placeholders with a loud "not configured" error.

## Storefront
New React + Vite app. Protected `src/core/` (cart normalisation, request-id idempotency, checkout payload with no prices, URL/phone safety, catalogue/category/sort rules, theming) ported 1:1 from the audited storefront and unit-tested. Added over the baseline: a real not-found view for unknown products, keyboard-operable gallery, labelled forms with associated errors, skip link, accessible mobile menu, module switches, per-client theming from one config file. Fixed during testing: the layout crashed while settings were still loading; checkout ignored the injected transport.

## Still true / not verified
- Not verified live: Google deployment, Gmail quota, Cloudinary, Netlify, WhatsApp, real mobile browsers, and Google AI Studio's current UI. Run `CLIENT-ONBOARDING.md` §6.
- The jsdom journey test proves behaviour, not visual quality; CI cannot judge the design.
- Known limits: manual payment, no delivery fees, newsletter capture only, best-effort email, Sheets scale, bot-resistant spam control needs CAPTCHA at higher traffic.
- Phase C (blog, category records, editable homepage sections) is specified in `BACKEND-CONTRACT.md` §7 and deliberately not faked.
