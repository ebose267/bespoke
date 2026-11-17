// Old storefront links look like #product/P123 or #cart. The new router uses #/product/P123.
// Rewriting them once keeps every link customers already have working.
const LEGACY = /^#(home|product|about|contact|cart|checkout|done)(\/.*)?$/;
export function migrateLegacyHash(hash) {
  const m = LEGACY.exec(hash || '');
  if (!m) return null;
  return m[1] === 'home' ? '#/' : '#/' + m[1] + (m[2] || '');
}
