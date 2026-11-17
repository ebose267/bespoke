# AI Studio prompt library (copy-paste)

Paste **one prompt at a time**, in order. After each: review the preview at desktop and 390px, sync to the branch, wait for CI.
Replace `<CLIENT>` / `<client-file>` (e.g. `Synthova Oil` / `synthova-oil`). Attach your reference screenshots to P2 and P3.

---

## P0. Project rules (paste first in EVERY new session)

```
You are working on an existing, tested e-commerce storefront called the Thimble storefront. It is React + Vite (plain JavaScript/JSX) with HashRouter. Do NOT migrate it to TypeScript, another bundler, Next.js, or any other framework.

ARCHITECTURE
- Data comes from one Google Apps Script web app (VITE_API_URL). The store loads it once at start-up through src/core/api.js and shares it via useStore() in src/context/StoreContext.jsx. Cart state comes from useCart().
- Business logic lives in src/core/ and src/context/. They are PROTECTED.

PROTECTED, DO NOT EDIT, DELETE OR RENAME:
src/core/**, src/context/**, backend/**, admin/**, scripts/**, legacy/**, tests/** (you may ADD new test files, never modify existing ones), public/_headers, .github/**, vite.config.js, netlify.toml, package.json (ask me before adding any dependency).

YOU MAY EDIT: src/pages/**, src/components/**, src/styles/**, src/config/clients/<client-file>.js, and add images under public/brand/.

NEVER ADD: Firebase, Supabase, any database or auth system, a payment gateway/SDK, a server or API route, a second checkout, analytics/tracking scripts, dangerouslySetInnerHTML, or any fetch() call inside pages/components.

BUSINESS RULES (tests enforce these)
1. The browser sends only product IDs and quantities at checkout. Never send, store or trust a price or total. The server decides prices, stock and totals.
2. Checkout must keep using validateCustomer, requestIdFor, buildOrderPayload and submitOrder from src/core/checkout.js, the hidden honeypot field, and the WhatsApp hand-off. Payment is NOT taken on the site; never add card fields or imply payment is complete.
3. Sold-out products can never be added to the cart. Unknown product IDs must show the not-found view.
4. Never display fake data: no ratings, review counts, testimonials, fake discounts, fake "best seller" numbers, fake stock, delivery fees, or return/shipping promises. A section whose data is missing must disappear or show an honest empty state.
5. All CMS text is rendered as normal React text. All image/link URLs go through httpsUrl()/imageUrl() from src/core/safe.js.
6. Keep accessible names that tests rely on (for example "Add to cart", "Place order", "Checkout", "Try again", field labels). Keep keyboard access, visible focus, labelled form fields, and respect prefers-reduced-motion.
7. Colours, fonts and radii come only from CSS variables (--bg, --accent, etc.) set from the client config. Do not hard-code client colours in components; the accent comes from the owner's brand colour in the CMS.

WORKFLOW
- One task per prompt. Before changing anything, tell me which files you will edit.
- After each task, give me a short summary: files changed, why, and which viewports you checked.
- If a request would require editing a protected file, STOP and tell me instead of doing it.
- Do not claim tests or browser checks passed unless you actually ran them.

Confirm you understand by listing the protected paths and the two things you must never send at checkout. Do not change any files yet.
```

---

## P1. Inspect (no code)

```
Read the whole project without changing anything. Report:
1. File map and which files are protected vs editable.
2. How data loads (src/core/api.js), what the product/settings/bestSellers shapes are, and what happens when the API fails.
3. The routes in src/App.jsx and which client-config module flags hide them.
4. How the cart works (src/core/cart.js) and how checkout builds and sends the order (src/core/checkout.js), including request_id reuse and the honeypot.
5. How theming works (src/core/theme.js, src/config/clients/*.js).
6. Which UI elements the tests in tests/app.test.jsx rely on.
7. Anything in src/pages or src/components that violates the rules in my project-rules prompt.
Do not write code. Say clearly if you cannot find something.
```

---

## P2. Design system and shell (attach reference screenshots)

```
Create the visual design system and the shared shell for <CLIENT>, using the attached screenshots for hierarchy and mood only. Do not copy logos, names, copy or photos.

DESIGN BRIEF
<paste the filled brief from the guide, section 6>

DO
- Edit src/config/clients/<client-file>.js: colours, fonts (Google Fonts URL on fonts.googleapis.com only), radii, shadow, page width, nav labels, trust items (true claims only), footer note.
- Edit src/styles/app.css and the shell components (Layout header/footer, announcement bar, mobile menu, buttons, inputs, product card, price, stock badge, section headings, toast).
- Define a spacing scale and a type scale with CSS variables, and use them consistently.
- Header: logo or name, primary nav, search, cart with live item count, accessible mobile menu with a visible Close action.
- Keep everything token-driven so another client can be themed by a new config file only.

DON'T edit src/core, src/context or tests. Don't hard-code colours in components.
Show the preview at desktop and 390px. List every file you changed.
```

---

## P3. Home page

```
Redesign src/pages/Home.jsx for <CLIENT>. Keep using the existing data and helpers (featured, best sellers, new arrivals, categories) and the config.homeSections order.

Art direction: <hero image /brand/hero.jpg; headline; mood>. The hero must be the strongest element but must not fill the whole first mobile screen. Use one clear primary CTA.

Sections, in order: hero, trust strip (config.trust), shop-by-category tiles, featured, best sellers, new arrivals, promo (config.promo).
RULES: every section must disappear when its data is empty (do not add placeholders that look real). Best sellers use only the server ranking. Use real products from the store only. Category tiles use the cover image derived from products.

Must work at 360px, 390px, 768px and 1280px with no horizontal scroll. Product cards: consistent image ratio, name, price (including a genuine compare-at price when present), stock state, Add to cart.
Tell me which files you will edit first; do not touch protected files.
```

---

## P4. Shop and discovery pages

```
Redesign these pages and keep their behaviour: src/pages/Shop.jsx (search, category filter, availability filter, sort, result count, reset, load more, empty states), src/pages/Discovery.jsx (New arrivals, Best sellers, Categories, Category detail).

- Keep the sort option "Newest" only when real created_at data exists (the code already handles this).
- Keep the empty states honest. Do not show a fake list.
- On mobile, put filters in a compact, accessible disclosure; keep every control labelled and keyboard operable.
- Product grid: 4 columns wide desktop, 3 at laptop, 2 at tablet/mobile, 1 only if cards would clip below 360px.
You may edit only src/pages/*, src/components/*, src/styles/*.
```

---

## P5. Product page

```
Redesign the product page in src/pages/Product.jsx.
- Large gallery with keyboard-operable thumbnails (keep the buttons and their aria labels). Handle 0, 1 and many images with a designed placeholder, never a broken image.
- Show category, name, price with the real compare-at price and percent off when present, a text stock state (never colour alone), the description with line breaks preserved, a quantity selector bounded by stock, Add to cart, View cart, related products.
- Sold-out products: disabled Add to cart with the text "Out of stock".
- Unknown product ID keeps the not-found view.
- Do not show reviews, stars, SKU, specs or delivery claims: no such data exists.
```

---

## P6. Cart, checkout and confirmation (restyle only)

```
Restyle src/pages/Cart.jsx, src/pages/Checkout.jsx and the Done page in src/pages/Info.jsx. This is a PRESENTATION change only.

KEEP EXACTLY: the handlers and the calls to validateCustomer, requestIdFor, buildOrderPayload, submitOrder, saveLastOrder, clearRequestId and cart.clear; the hidden honeypot field; the window.open('about:blank') inside the click handler and the later navigation to the WhatsApp URL; the disabled state while submitting; the error messages and field error associations (aria-describedby, role="alert").
KEEP COPY MEANING: the order is saved first; the customer then sends the prefilled WhatsApp message; no payment is taken on the site; delivery is arranged with the store.
DO NOT: add card or payment fields, delivery fees, discount codes, or "paid" language.
Make the cart quantity controls at least 44px touch targets, and make the order summary and primary action easy to find on a 360px screen.
After your change run the tests if you can; otherwise tell me you could not.
```

---

## P7. About, Contact, footer and 404

```
Redesign About, Contact, NotFound (src/pages/Info.jsx) and the footer in src/components/Layout.jsx.
- About uses settings.about_title and settings.about_text only. Do not invent history, mission statements or team members. Improve typography and layout; you may use a brand image from public/brand/.
- Contact shows ONLY the values that exist (WhatsApp, phone, email, address, opening hours, Instagram) and hides empty ones. Keep the "Send on WhatsApp" message form (it opens WhatsApp; it does not send anything by itself).
- Footer: navigation, contact links, Instagram if present, config.footer.note, copyright.
- 404: clear message and links back to Home and Shop.
```

---

## P8. Responsive and accessibility pass

```
Review the whole storefront at 360, 390, 768 and 1280px and fix only real defects:
- horizontal overflow, clipped prices/buttons, tap targets under 44px, tiny low-contrast text (target WCAG AA), missing focus outlines, images without stable aspect ratio, layout shift.
- keyboard: skip link, mobile menu, filters, gallery thumbnails, quantity buttons, checkout form errors, toast announcements.
- reduced motion respected.
Make narrow, targeted CSS/markup fixes. Do not redesign. For each fix, state the viewport and the element. Do not touch protected files.
```

---

## P9. Final regression report

```
Run a complete regression review and report honestly. Check: all routes and nav links; catalogue loading and the retry state; search/filter/sort; product gallery with 0/1/many images; cart persistence and stock clamping; checkout validation, duplicate-submit protection and the WhatsApp fallback link; About/Contact only show configured values; no fake ratings/discounts/best-seller numbers/blog; no tokens, private settings or customer data anywhere in client code; 360/390/768/1280px; keyboard navigation.
Run the automated tests if your environment can, and report exact counts. Do not say any browser or mobile check passed unless you actually performed it. List changed files and remaining blockers.
```

---

## T. Theme a NEW client later (re-theme only)

```
Create src/config/clients/<new-client-file>.js by copying default.js, then set theme colours, fonts, radii, hero content, trust items and module flags from this brief: <paste brief>. Change NO component files unless a client need cannot be expressed as tokens or content; if so, explain why first. Do not touch protected files.
```

---

## Narrow fix template

```
On the <viewport> preview of <page>, <exact visible defect>. Change only <element/CSS>. Keep desktop (or other viewports) unchanged. Do not change data, logic or protected files. Tell me which CSS/component you changed and what you checked.
```
