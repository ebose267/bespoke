# Rebuilding the Thimble storefront front end in Google AI Studio

**Audience:** you (owner/operator). **Outcome:** a professionally art-directed storefront for a client (first client: Synthova Oil) that keeps every order, stock and security rule intact, built in small reviewable steps with an automatic safety net.

> The AI designs. The repo protects. Business-critical logic lives in `src/core/` and is covered by tests. AI Studio is only ever asked to change *presentation*, and a CI gate refuses any change that breaks the contract.

---

## 0. How the pieces fit

| Layer | Where | Who changes it |
|---|---|---|
| Backend (Apps Script + Sheets) | `backend/Code.gs` | You, deliberately. **Never AI Studio.** |
| Owner dashboard | `admin/admin.html` | You, deliberately. Never AI Studio. |
| **Protected core** (cart, checkout, API, catalogue rules, theming engine) | `src/core/`, `src/context/` | Nobody during design work. Tested. |
| **Design layer** (markup + CSS) | `src/pages/`, `src/components/`, `src/styles/` | AI Studio, one prompt at a time |
| **Client identity** (tokens, nav, hero copy, trust strip, modules) | `src/config/clients/<client>.js` | AI Studio or you |
| Safety net | `tests/`, `.github/workflows/ci.yml` | You. AI may *add* tests, never edit or delete. |

**Re-theming a new client** means one new file in `src/config/clients/` plus brand images. No forked components.

---

## 1. One-time preparation (do this outside AI Studio, ~30 minutes)

1. **Create a private GitHub repo** (e.g. `thimble-storefront-base`) and push this folder to `main`. Keep `package-lock.json`.
2. **Verify locally** (Node 20+):
   ```bash
   npm ci
   npm test          # backend simulation + core + app journey + admin checks
   npm run build     # must produce dist/store
   ```
   Everything must be green before AI Studio touches anything. Tag it: `git tag baseline-v3 && git push --tags`.
3. **Confirm no secrets/client values are in the repo:** `.env` is git-ignored; the admin file contains placeholders only; real values go in Netlify environment variables.
4. **Create the branch AI Studio will work on:** `redesign/synthova-oil-v1`.
5. **Collect the design brief** for the client (template in §6). Gather 3–6 reference screenshots *as image files you can attach in AI Studio*. They are not in the repo.
6. **Put brand images** (hero, logo, category art if any) in `public/brand/` on that branch. Reference them from the client config as `/brand/hero.jpg`.
7. **Have the backend ready:** the client's Sheet is running v3 `Code.gs` and you have its `/exec` URL. Create `.env` locally:
   ```
   VITE_API_URL=https://script.google.com/macros/s/<id>/exec
   VITE_CLIENT=synthova-oil
   ```
   Run `npm run dev` and confirm real products appear. A design built against real data catches problems early.

> The store works the moment the backend answers. If the page shows "Couldn't load the store", fix the URL/deployment first, never "fix" it in the UI.

---

## 2. Importing into AI Studio

AI Studio's **Build** mode can import an existing GitHub repository from the **Add files (+)** menu and can sync back to GitHub (menu names change; check the current docs if the UI differs). Build apps default to a React front end, which is why this repo is React + Vite with plain JavaScript.

1. Open AI Studio → **Build**.
2. **Add files (+) → Import from GitHub** → pick the repo and the `redesign/synthova-oil-v1` branch.
3. Wait for the import, then open the **Code** view and confirm these exist: `src/core/`, `src/pages/`, `src/config/clients/`, `backend/Code.gs`, `admin/admin.html`, `tests/`, `docs/PROMPTS.md`.
4. **Do not accept** any proposal to: convert to TypeScript, change the bundler, add Firebase/Supabase/a database, add a server or API route, add a payment SDK, or move checkout. Answer: *"Keep the existing stack and files. Only follow the rules in my Prompt 0."*
5. Set the environment values the preview needs (`VITE_API_URL`, `VITE_CLIENT`) in whatever environment/secrets panel your Build session offers. The API URL is not secret, but keep it out of committed files.

**Import sanity check (stop here if any fails):**
- The preview shows the store with real products (or the retry state if the URL is wrong).
- The file tree matches the repo (the import must not have reshaped it).
- `git diff` against `baseline-v3` (after the first sync) shows **only** changes you expect.

If the import rewrites the structure, restore from GitHub and start again with Prompt 0 pasted *before* anything else.

---

## 3. The working loop (repeat for every prompt)

```
Paste prompt  →  AI changes design files  →  you review preview (desktop + 390px)
     →  Sync to GitHub branch  →  CI runs  →  green? merge to branch main-line : paste the failure back as a fix prompt
```

Rules that keep this seamless:

1. **One prompt = one page or one component group.** Never "redesign everything".
2. **Start every new AI Studio session with Prompt 0** (it holds the rules). If your Build session has a system-instructions/project-rules field, put Prompt 0 there as well.
3. **Always ask for a change summary** (files touched + why). Reject anything touching protected paths.
4. **Review the diff before syncing.** Look at the file list first; a redesign should not touch `src/core/` at all.
5. **CI is the judge, not the AI's "done".** Pull the branch locally for visual QA, or read the CI result on GitHub. A red CI means the AI broke the contract; paste the failing test name back.
6. **Commit after every accepted step** (the sync does this). Milestone tags: `ds-done`, `home-done`, `shop-done`, `product-done`, `checkout-done`, `release-1`.
7. **Fix visual defects narrowly**: "On the 390px preview the product title wraps to four lines and pushes the price down. Reduce mobile title size slightly, keep desktop unchanged." Never "make it prettier".

---

## 4. The build sequence

Copy each prompt from `docs/PROMPTS.md`. Approve one step before starting the next.

| Step | Prompt | Output | You check |
|---|---|---|---|
| 0 | **P0 Rules** | Agent confirms rules, protected paths | It lists protected files back to you |
| 1 | **P1 Inspect** (no code) | Written report of the architecture | It identifies `src/core` as protected and the API contract correctly |
| 2 | **P2 Design system** | Tokens in client config + `app.css`, shell components (header, footer, buttons, cards, badges) | Contrast, spacing scale, mobile menu |
| 3 | **P3 Home** | Art-directed home page | No invented claims; empty sections vanish |
| 4 | **P4 Shop + discovery** | Shop, categories, new arrivals, best sellers | Filters, empty states, load more |
| 5 | **P5 Product page** | Gallery, price, stock, related | One image / many images / none |
| 6 | **P6 Cart, checkout, done** | Restyled, logic untouched | Full test order (see §7) |
| 7 | **P7 About, Contact, footer, 404** | Brand pages | Hide-when-empty behaviour |
| 8 | **P8 Responsive + accessibility** | Fixes at 360/390/768/1280 | Keyboard walk-through |
| 9 | **P9 Final regression report** | Honest report | Test counts match CI |

Backend-dependent sections are already supported by v3 (`created_at`, `featured`, `compare_at_price`, best sellers). Blog, structured category images and CMS-editable homepage sections are **Phase C** (see `docs/BACKEND-CONTRACT.md` §7); do not let the AI fake them.

---

## 5. What the AI may and may not do

**May:** restructure JSX inside `src/pages/*` and `src/components/*`; add new presentational components; edit `src/styles/*`; edit `src/config/clients/<client>.js`; add images to `public/brand/`; add **new** tests.

**May not:** edit anything in `src/core/`, `src/context/`, `backend/`, `admin/`, `scripts/`, `legacy/`, `public/_headers`, `.github/`, existing tests, `package.json` dependencies (ask first), or `vite.config.js`.

**Contract it must keep (tests enforce these):**
- Cart stores only `{id, qty}`; checkout sends only IDs and quantities, never a price or total.
- Product cards/pages read data through `useStore()`/`useCart()`; they never call `fetch` themselves.
- Checkout uses `validateCustomer`, `requestIdFor`, `buildOrderPayload`, `submitOrder` exactly as now; the honeypot field and WhatsApp hand-off stay.
- Sold-out products cannot be added to the cart. Unknown product IDs show the not-found view.
- No ratings, review counts, fake discounts, fake best-seller numbers, fake inventory or invented shipping/return promises. An empty state beats a fake one.
- All CMS text is rendered as React text (never `dangerouslySetInnerHTML`); URLs go through `httpsUrl`/`imageUrl`.

---

## 6. Design brief template (paste into P2/P3 with your screenshots)

```
CLIENT: Synthova Oil   INDUSTRY: <e.g. premium cooking & wellness oils>   AUDIENCE: <who, where>
BRAND WORDS: <3–5, e.g. warm, natural, premium, trustworthy>
COLOURS: background <hex>, surface <hex>, text <hex>, accent = owner's brand colour from the CMS (do not hard-code it)
TYPE: headings <font>, body <font> (Google Fonts URL allowed: fonts.googleapis.com only)
MOOD / REFERENCES: attached screenshots: <what to take from each: e.g. "hero layout", "product card density">
AVOID: <e.g. neon colours, carousels, stock-photo look>
HERO: image /brand/hero.jpg, headline "<text>", CTA "Shop now"
TRUST STRIP (true claims only): <3 items the client really honours>
MODULES ON: shop, categories, newArrivals, bestSellers   OFF: <anything not ready>
```

For a **new client later**: copy `src/config/clients/default.js`, fill the brief, run P2 with the new file name, set `VITE_CLIENT`. That is the whole re-theme.

---

## 7. Acceptance checklist before you call a build done

**Automated (CI must be green):** backend simulation, core unit tests, app journey, admin checks, `npm run build`.

**Manual, on the real backend, at 360px and desktop** (CI cannot see these):
- [ ] Home, Shop, each Category, New Arrivals, Best Sellers, Product, About, Contact, 404 all reachable from navigation.
- [ ] No horizontal scroll at 360/390/768/1280; hero crop and CTA correct on mobile.
- [ ] Product with 0, 1 and many images; sold-out product cannot be added.
- [ ] Cart survives refresh; lowering stock in the dashboard then reloading clamps/removes the line.
- [ ] **Real test order:** place an order with a controlled email/phone → order is Pending in the dashboard, two emails arrive, WhatsApp opens with the prefilled message, confirmation shows the real order ID and server total.
- [ ] Double-click "Place order" and a refresh mid-checkout create exactly one order.
- [ ] Keyboard only: skip link, menu, filters, gallery thumbnails, cart quantity, checkout form with errors.
- [ ] Old links `#product/<id>`, `#cart` still land on the right page.
- [ ] Lighthouse mobile ≥ 90 performance/accessibility (guide, not a gate).
- [ ] View-source/network: no token, no owner email, no customer data in any public response.

---

## 8. Shipping

1. Merge the redesign branch to `main` after CI is green and §7 is ticked.
2. **Netlify site A (storefront):** connect the repo; build `npm run build`, publish `dist/store`; environment `VITE_API_URL`, `VITE_CLIENT`. (Already in `netlify.toml`.)
3. **Netlify site B (admin, separate unlisted URL):** build `npm run build:admin`, publish `dist/admin`; environment `API_URL`, `CLOUDINARY_CLOUD`, `CLOUDINARY_PRESET`. Put that URL in the `dashboard_url` setting.
4. Do **not** use AI Studio's Cloud Run deploy for this project; hosting stays Netlify.
5. Full per-client checklist: `docs/CLIENT-ONBOARDING.md`.

---

## 9. When something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Preview says "Couldn't load the store" | Wrong/placeholder `VITE_API_URL`, or Apps Script not deployed to "Anyone" | Open `<url>?action=storefront` in a browser; fix deployment |
| CI fails in `core.test.js` | Agent edited `src/core` | Revert that file from `baseline-v3`; re-prompt with Prompt 0 |
| CI fails in `app.test.jsx` | Redesign removed a label/button the journey relies on | Keep accessible names (e.g. "Add to cart", "Place order"); paste the failure back |
| Agent adds Firebase/server/TypeScript | Default behaviour of generators | Decline; restate Prompt 0 |
| Agent output gets truncated or rewrites whole files | Prompt too broad | Narrow to one page; name the files |
| Fonts don't load on the live site | CSP blocks non-Google font hosts | Use `fonts.googleapis.com` only, or extend `public/_headers` deliberately |
| Orders show a leading apostrophe/odd phone | Old Sheet rows from before v3 | Safe to ignore; v3 reads them correctly |
