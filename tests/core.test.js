import { describe, expect, it } from 'vitest';
import { httpsUrl, imageUrl, isValidWaNumber, slugify, waDigits, whatsappUrl, telHref } from '../src/core/safe.js';
import { money, percentOff } from '../src/core/format.js';
import { bestSellerProducts, buildCategories, filterProducts, hasCreatedAt, newArrivals, normaliseProducts, relatedProducts, sortProducts, stockLabel } from '../src/core/catalog.js';
import { addToCart, createCartStorage, normaliseCart, parseStoredCart, setQuantity, cartCount, cartTotal } from '../src/core/cart.js';
import { buildOrderPayload, checkoutFingerprint, clearRequestId, requestIdFor, submitOrder, validateCustomer, CheckoutError } from '../src/core/checkout.js';
import { fetchStorefront, normaliseSettings, resolveApiUrl } from '../src/core/api.js';
import { migrateLegacyHash } from '../src/core/legacyHash.js';
import { themeVariables } from '../src/core/theme.js';
import { pickClient, mergeConfig } from '../src/config/index.js';
import { makeFetch, rawProducts, storefrontResponse } from './fixtures.js';

const products = normaliseProducts(rawProducts);

describe('safe helpers', () => {
  it('accepts only absolute https URLs', () => {
    expect(httpsUrl('https://a.com/x.png')).toBe('https://a.com/x.png');
    for (const bad of ['javascript:alert(1)', 'http://a.com', '/relative.png', '', null, 'data:image/png;base64,AA']) expect(httpsUrl(bad)).toBe('');
  });
  it('optimises Cloudinary URLs only', () => {
    expect(imageUrl('https://res.cloudinary.com/x/image/upload/v1/a.jpg', 300)).toContain('/image/upload/f_auto,q_auto,w_300/v1/a.jpg');
    expect(imageUrl('https://other.com/image/upload/a.jpg')).toBe('https://other.com/image/upload/a.jpg');
  });
  it('normalises WhatsApp numbers like the backend', () => {
    expect(waDigits('0801 234 5678')).toBe('2348012345678');
    expect(waDigits('+234 801 234 5678')).toBe('2348012345678');
    expect(waDigits('00234801234567')).toBe('234801234567');
  });
  it('trusts only wa.me links and dial-safe tel hrefs', () => {
    expect(whatsappUrl('https://wa.me/234801?text=hi')).toContain('wa.me');
    expect(whatsappUrl('https://evil.com/wa.me')).toBe('');
    expect(telHref('+234 (801) <script>')).toBe('tel:+234801');
  });
  it('tolerates a missing WhatsApp number while settings are still loading', () => { expect(isValidWaNumber(undefined)).toBe(false); expect(isValidWaNumber('2348012345678')).toBe(true); });
  it('slugifies stably', () => { expect(slugify("Men's Wear & Co.")).toBe('mens-wear-and-co'); expect(slugify('Café')).toBe('cafe'); });
  it('formats money and discounts', () => { expect(money(15000)).toBe('₦15,000'); expect(money('x')).toBe('₦0'); expect(percentOff(15000, 18000)).toBe(17); expect(percentOff(100, 50)).toBe(0); });
});

describe('catalogue', () => {
  it('drops unsafe images, forces zero stock to Out of Stock and ignores a fake discount', () => {
    const [p1, , p3, p4] = products;
    expect(p1.images).toEqual(['https://res.cloudinary.com/demo/image/upload/v1/a.jpg']);
    expect(p1.compareAt).toBe(18000); expect(p1.percentOff).toBe(17);
    expect(p3.status).toBe('Out of Stock'); expect(stockLabel(p3)).toBe('Out of stock');
    expect(p4.compareAt).toBe(0); // compare price below price is never shown as a sale
  });
  it('builds unique stable categories in owner order and hides empty ones', () => {
    const cats = buildCategories(products, 'Shoes,Bags,Accessories,Ghost');
    expect(cats.map((c) => c.slug)).toEqual(['shoes', 'bags', 'accessories', 'mens-wear']);
    expect(cats[0].image).toContain('cloudinary');
    expect(buildCategories([], 'A,a', { includeEmpty: true }).map((c) => c.slug)).toEqual(['a', 'a-2']); // slug collision gets -2
  });
  it('filters, sorts and finds related products', () => {
    expect(filterProducts(products, { query: 'tote' }).map((p) => p.id)).toEqual(['P2']);
    expect(filterProducts(products, { availability: 'sold-out' }).map((p) => p.id)).toEqual(['P3']);
    expect(filterProducts(products, { category: 'Bags' })).toHaveLength(1);
    expect(sortProducts(products, 'price-asc')[0].id).toBe('P3');
    expect(relatedProducts(products, products[0])).toEqual([]);
  });
  it('never fakes "newest": only products with a real created_at count', () => {
    expect(newArrivals(products).map((p) => p.id)).toEqual(['P4', 'P2', 'P1']);
    expect(hasCreatedAt(normaliseProducts([{ id: 'x', name: 'n', price: 1, stock: 1 }]))).toBe(false);
  });
  it('shows best sellers only from the server ranking and drops deleted products', () => {
    expect(bestSellerProducts(products, storefrontResponse.bestSellers).map((p) => p.id)).toEqual(['P2', 'P1']);
    expect(bestSellerProducts(products, [])).toEqual([]);
  });
});

describe('cart rules', () => {
  it('parses damaged storage safely', () => { expect(parseStoredCart('{bad')).toEqual([]); expect(parseStoredCart('{"a":1}')).toEqual([]); expect(parseStoredCart('[{"id":1,"qty":2}]')).toEqual([{ id: '1', qty: 2 }]); });
  it('merges duplicates, removes sold-out/deleted lines and clamps to stock', () => {
    const lines = [{ id: 'P1', qty: 5 }, { id: 'P1', qty: 9 }, { id: 'P3', qty: 1 }, { id: 'GONE', qty: 1 }, { id: 'P2', qty: 99 }, { id: 'P4', qty: 0 }, { id: 'P4', qty: 1.5 }];
    expect(normaliseCart(lines, products)).toEqual([{ id: 'P1', qty: 12 }, { id: 'P2', qty: 4 }]);
  });
  it('refuses to add beyond stock, sold-out or missing products', () => {
    expect(addToCart([], products, 'P3').error).toMatch(/out of stock/);
    expect(addToCart([{ id: 'P2', qty: 4 }], products, 'P2').error).toMatch(/Only 4/);
    expect(addToCart([], products, 'NOPE').error).toMatch(/no longer available/);
    expect(addToCart([{ id: 'P1', qty: 1 }], products, 'P1').lines).toEqual([{ id: 'P1', qty: 2 }]);
  });
  it('updates quantities within stock and totals them', () => {
    expect(setQuantity([{ id: 'P2', qty: 2 }], products, 'P2', 0).lines).toEqual([]);
    expect(setQuantity([{ id: 'P2', qty: 2 }], products, 'P2', 5).error).toBeTruthy();
    const lines = [{ id: 'P1', qty: 2 }, { id: 'P2', qty: 1 }];
    expect(cartCount(lines)).toBe(3); expect(cartTotal(lines, products)).toBe(58000);
  });
  it('falls back to memory when browser storage is blocked', () => {
    const blocked = { setItem() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, removeItem() {} };
    const store = createCartStorage(blocked); store.save([{ id: 'P1', qty: 1 }]);
    expect(store.load()).toEqual([{ id: 'P1', qty: 1 }]);
  });
});

describe('checkout contract', () => {
  const customer = { name: ' Ada ', phone: '0801 234 5678', email: 'ada@example.com', address: 'Benin City' };
  const lines = [{ id: 'P1', qty: 2, price: 1, name: 'ignored' }];
  it('validates like the server', () => {
    expect(validateCustomer(customer)).toEqual({});
    expect(Object.keys(validateCustomer({ name: '', phone: '-------', email: 'bad', address: '' })).sort()).toEqual(['address', 'email', 'name', 'phone']);
  });
  it('sends only IDs and quantities, never a price or total', () => {
    const payload = buildOrderPayload({ customer, newsletter: false, lines, requestId: 'req-abc-1234567890', startedAt: 123, honeypot: '' });
    expect(payload.items).toEqual([{ id: 'P1', qty: 2 }]);
    expect(Object.keys(payload).sort()).toEqual(['action', 'address', 'email', 'items', 'name', 'newsletter', 'phone', 'request_id', 'started_at', 'website'].sort());
    expect(JSON.stringify(payload)).not.toMatch(/price|total/);
    expect(payload.name).toBe('Ada');
  });
  it('reuses the request id for identical details and issues a new one when anything changes', () => {
    const a = requestIdFor({ customer, newsletter: false, lines });
    expect(requestIdFor({ customer, newsletter: false, lines })).toBe(a);
    expect(requestIdFor({ customer, newsletter: true, lines })).not.toBe(a);
    const b = requestIdFor({ customer: { ...customer, address: 'Lagos' }, newsletter: true, lines }); expect(b).not.toBe(a);
    clearRequestId(); expect(requestIdFor({ customer, newsletter: false, lines })).not.toBe(a);
    expect(checkoutFingerprint({ customer, newsletter: false, lines })).not.toContain('ignored');
  });
  it('uses the Apps Script-safe text/plain transport and returns a validated result', async () => {
    const f = makeFetch();
    const order = await submitOrder('https://script.google.com/x/exec', { action: 'placeOrder' }, { fetchImpl: f });
    expect(f.calls[0].init.headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(order).toEqual({ orderId: 'ORD-261114-ABCD1234', total: 15000, whatsappUrl: expect.stringContaining('wa.me') });
  });
  it('turns server errors and network failures into customer messages, flagging maybe-saved', async () => {
    await expect(submitOrder('u', {}, { fetchImpl: makeFetch({ post: () => ({ ok: false, error: 'Sorry, only 1 of "X" left.' }) }) })).rejects.toThrow('Sorry, only 1');
    const err = await submitOrder('u', {}, { fetchImpl: async () => { throw new TypeError('offline'); } }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckoutError); expect(err.maybeSaved).toBe(true); expect(err.message).toMatch(/duplicate/);
  });
});

describe('API loading', () => {
  it('requires a real https API url', () => {
    expect(() => resolveApiUrl({})).toThrow(/VITE_API_URL/);
    expect(() => resolveApiUrl({ VITE_API_URL: '__API_URL__' })).toThrow();
    expect(() => resolveApiUrl({ VITE_API_URL: 'http://x' })).toThrow(/https/);
    expect(resolveApiUrl({ VITE_API_URL: 'https://script.google.com/m/x/exec' })).toContain('https://');
  });
  it('loads the storefront bundle and normalises settings', async () => {
    const f = makeFetch(); const data = await fetchStorefront('https://script.google.com/m/x/exec', { fetchImpl: f });
    expect(f.calls[0].url).toContain('action=storefront');
    expect(data.products).toHaveLength(4); expect(data.settings.whatsapp_number).toBe('2348012345678'); expect(data.bestSellers).toHaveLength(3);
  });
  it('falls back to the original products action on an older backend', async () => {
    const f = makeFetch({ get: (url) => (url.includes('action=storefront') ? { ok: false, error: 'Unknown request' } : { ok: true, products: [], settings: {} }) });
    const data = await fetchStorefront('https://x/exec', { fetchImpl: f });
    expect(f.calls.map((c) => c.url.split('action=')[1])).toEqual(['storefront', 'products']); expect(data.bestSellers).toEqual([]);
  });
  it('rejects incomplete responses instead of inventing data', async () => {
    await expect(fetchStorefront('https://x/exec', { fetchImpl: makeFetch({ get: { ok: true, products: 'nope' } }) })).rejects.toThrow(/incomplete/);
    expect(normaliseSettings({ brand_color: 'red' }).brand_color).toBe('');
  });
});

describe('routing + theming + client config', () => {
  it('migrates legacy hash links', () => {
    expect(migrateLegacyHash('#product/P1')).toBe('#/product/P1'); expect(migrateLegacyHash('#cart')).toBe('#/cart');
    expect(migrateLegacyHash('#home')).toBe('#/'); expect(migrateLegacyHash('#/shop')).toBeNull(); expect(migrateLegacyHash('')).toBeNull();
  });
  it('re-themes from tokens and lets the CMS brand colour win unless locked', () => {
    const t = pickClient('synthova-oil').theme;
    expect(themeVariables(t, '#123456')['--accent']).toBe('#123456');
    expect(themeVariables({ ...t, lockAccent: true }, '#123456')['--accent']).toBe(t.colors.accent);
    expect(themeVariables(t, 'red')['--accent']).toBe(t.colors.accent);
    expect(themeVariables(t, '')['--bg']).toBe('#080c08');
  });
  it('fills any gaps in a partial client config from the default', () => {
    const c = mergeConfig({ id: 'tiny', theme: { colors: { accent: '#ff0000' } }, modules: { blog: true } });
    expect(c.theme.colors.bg).toBe('#ffffff'); expect(c.theme.colors.accent).toBe('#ff0000'); expect(c.modules.shop).toBe(true); expect(c.nav.length).toBeGreaterThan(3);
    expect(pickClient('does-not-exist').id).toBe('default');
  });
});
