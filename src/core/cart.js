// Cart rules, ported 1:1 from the audited storefront. Only product IDs and quantities are ever stored or sent.
import { isSoldOut } from './catalog.js';

const KEY = 'cart';

export function parseStoredCart(raw) {
  try {
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data.filter((l) => l && l.id != null).map((l) => ({ id: String(l.id), qty: Number(l.qty) })) : [];
  } catch { return []; }
}

/** Drop deleted/sold-out products and bad quantities, merge duplicate lines, clamp quantity to current stock. */
export function normaliseCart(lines, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const totals = new Map();
  (Array.isArray(lines) ? lines : []).forEach((l) => {
    const p = l && byId.get(String(l.id)); const qty = Number(l && l.qty);
    if (!p || isSoldOut(p) || !Number.isSafeInteger(qty) || qty < 1) return;
    totals.set(p.id, (totals.get(p.id) || 0) + qty);
  });
  const clean = [];
  totals.forEach((qty, id) => { const q = Math.min(qty, byId.get(id).stock); if (q > 0) clean.push({ id, qty: q }); });
  return clean;
}

/** Returns { lines, error? }. error is a customer-facing message; lines are unchanged when it is set. */
export function addToCart(lines, products, id, amount = 1) {
  const p = products.find((x) => x.id === String(id));
  if (!p) return { lines, error: 'This product is no longer available.' };
  if (isSoldOut(p)) return { lines, error: 'This product is out of stock.' };
  const current = lines.find((l) => l.id === p.id);
  const next = (current ? current.qty : 0) + amount;
  if (next > p.stock) return { lines, error: `Only ${p.stock} of ${p.name} available.` };
  const updated = current ? lines.map((l) => (l.id === p.id ? { ...l, qty: next } : l)) : [...lines, { id: p.id, qty: amount }];
  return { lines: updated };
}

export function setQuantity(lines, products, id, qty) {
  const p = products.find((x) => x.id === String(id));
  if (!p) return { lines: lines.filter((l) => l.id !== String(id)), error: 'This product is no longer available.' };
  if (qty < 1) return { lines: lines.filter((l) => l.id !== p.id) };
  if (qty > p.stock) return { lines, error: `Only ${p.stock} available.` };
  return { lines: lines.map((l) => (l.id === p.id ? { ...l, qty } : l)) };
}

export const removeLine = (lines, id) => lines.filter((l) => l.id !== String(id));
export const cartCount = (lines) => lines.reduce((n, l) => n + Number(l.qty || 0), 0);

/** Display lines. The subtotal is a convenience; the server recalculates the real total at checkout. */
export function detailedLines(lines, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return lines.map((l) => ({ ...l, product: byId.get(l.id) })).filter((l) => l.product)
    .map((l) => ({ ...l, lineTotal: l.product.price * l.qty }));
}
export const cartTotal = (lines, products) => detailedLines(lines, products).reduce((n, l) => n + l.lineTotal, 0);

/** localStorage with an in-memory fallback, so a blocked or private-mode browser still shops. */
export function createCartStorage(storage) {
  let memory = [];
  const ok = (() => { try { storage.setItem('__t', '1'); storage.removeItem('__t'); return true; } catch { return false; } })();
  return {
    load: () => (ok ? parseStoredCart(storage.getItem(KEY)) : memory),
    save: (lines) => { memory = lines; if (ok) try { storage.setItem(KEY, JSON.stringify(lines)); } catch { /* keep in memory */ } },
  };
}
