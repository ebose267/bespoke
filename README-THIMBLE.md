# Thimble storefront base (v3)

Bespoke e-commerce storefronts for small businesses: a custom front end per client, a Google Sheets + Apps Script backend the client owns, and an owner dashboard. First client: **Synthova Oil**.

```
backend/   Code.gs (Apps Script) + simulation tests            ← protected
admin/     admin.html (owner dashboard) + generated preview     ← protected
src/core/  cart, checkout, API, catalogue, theming (tested)      ← protected
src/context/ data + cart state                                  ← protected
src/pages, src/components, src/styles   design layer            ← AI Studio edits these
src/config/clients/<client>.js          client identity/theme   ← one file per client
tests/     behaviour tests (core, full journey, admin)           ← the safety net
docs/      AI-STUDIO-GUIDE, PROMPTS, BACKEND-CONTRACT, CLIENT-ONBOARDING, CHANGELOG
legacy/    previous single-file storefront, reference only
```

## Commands
```bash
npm ci
cp .env.example .env        # set VITE_API_URL and VITE_CLIENT
npm run dev                 # storefront with live data
npm test                    # backend (40) + frontend (49)
npm run build               # dist/store
API_URL=… CLOUDINARY_CLOUD=… CLOUDINARY_PRESET=… npm run build:admin   # dist/admin
npm run build:preview       # regenerate admin/admin-preview.html
```

## Start here
1. `docs/AI-STUDIO-GUIDE.md`: the complete build process.
2. `docs/PROMPTS.md`: paste-ready prompts.
3. `docs/CLIENT-ONBOARDING.md`: backend + Netlify + acceptance for each client.

## Rules for any AI agent in this repo
See Prompt 0 in `docs/PROMPTS.md`. Short form: design files only; never edit `src/core`, `src/context`, `backend`, `admin`, `scripts`, existing tests or deployment config; never send prices at checkout; never fake ratings, discounts, best sellers, blog posts or delivery promises.
