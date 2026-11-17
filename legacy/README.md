# legacy/

`index.html` is the previous single-file storefront (the audited "Store-System-Fixed" release), kept **for reference only**:
it documents the exact checkout, cart and hash-link behaviour that `src/core/` re-implements and tests.

- Do not edit it, deploy it, or let an AI agent "improve" it.
- Its API URL is the placeholder `__API_URL__`. It will not run as-is.
- Old shared links such as `#product/P123` are redirected to `#/product/P123` by `src/core/legacyHash.js`.
