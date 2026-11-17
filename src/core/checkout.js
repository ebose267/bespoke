// Checkout contract, ported from the audited storefront. The browser sends IDs and quantities, NEVER prices.
import { whatsappUrl } from './safe.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_KEY = 'store_checkout_request_id', FP_KEY = 'store_checkout_payload', LAST_KEY = 'store_last_order';

/** Mirrors the server's checks so most mistakes are caught before a network call. Returns {field: message}. */
export function validateCustomer({ name = '', phone = '', email = '', address = '' }) {
  const errors = {};
  const digits = String(phone).replace(/\D/g, '');
  if (!name.trim()) errors.name = 'Enter your full name.';
  else if (name.trim().length > 120) errors.name = 'Name must be 120 characters or fewer.';
  if (!/^[+0-9()\-\s]{7,30}$/.test(phone.trim()) || digits.length < 7 || digits.length > 15) errors.phone = 'Enter a valid phone number (7–15 digits).';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address for your receipt.';
  if (!address.trim()) errors.address = 'Enter your delivery address.';
  else if (address.trim().length > 500) errors.address = 'Address must be 500 characters or fewer.';
  return errors;
}

export function newRequestId(cryptoImpl = globalThis.crypto) {
  return cryptoImpl && cryptoImpl.randomUUID ? cryptoImpl.randomUUID() : 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

/** The details that define "the same checkout". Any change here must produce a NEW request id. */
export function checkoutFingerprint({ customer, newsletter, lines }) {
  return JSON.stringify({
    name: customer.name.trim(), phone: customer.phone.trim(), email: customer.email.trim(), address: customer.address.trim(),
    newsletter: !!newsletter, items: lines.map((l) => ({ id: l.id, qty: l.qty })),
  });
}

/** Same details -> same id (safe retry after a timeout, no duplicate order). Different details -> fresh id. */
export function requestIdFor(details, session = globalThis.sessionStorage) {
  const fingerprint = checkoutFingerprint(details);
  let savedId = '', savedFp = '';
  try { savedId = session.getItem(ID_KEY) || ''; savedFp = session.getItem(FP_KEY) || ''; } catch { /* storage blocked */ }
  if (savedId && savedFp === fingerprint) return savedId;
  const id = newRequestId();
  try { session.setItem(ID_KEY, id); session.setItem(FP_KEY, fingerprint); } catch { /* storage blocked */ }
  return id;
}
export function clearRequestId(session = globalThis.sessionStorage) {
  try { session.removeItem(ID_KEY); session.removeItem(FP_KEY); } catch { /* ignore */ }
}

export function buildOrderPayload({ customer, newsletter, lines, requestId, startedAt, honeypot = '' }) {
  return {
    action: 'placeOrder',
    name: customer.name.trim(), phone: customer.phone.trim(), email: customer.email.trim(), address: customer.address.trim(),
    newsletter: !!newsletter,
    items: lines.map((l) => ({ id: l.id, qty: l.qty })),   // no price, no total: the server decides
    website: honeypot,
    started_at: startedAt,
    request_id: requestId,
  };
}

export class CheckoutError extends Error {
  constructor(message, { maybeSaved = false } = {}) { super(message); this.name = 'CheckoutError'; this.maybeSaved = maybeSaved; }
}

/** POST the order using Apps Script's CORS-safe text/plain transport. */
export async function submitOrder(apiUrl, payload, { fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result;
  try {
    const response = await fetchImpl(apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: controller.signal,
    });
    result = await response.json();
    if (!response.ok || !result.ok) throw new CheckoutError(result.error || 'Your order could not be saved.');
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(
      error && error.name === 'AbortError'
        ? 'The request timed out. Your order may still have been saved. Press the button again to safely check the same order.'
        : 'We could not reach the store. Check your connection and press the button again. It will not create a duplicate order.',
      { maybeSaved: true });
  } finally { clearTimeout(timer); }
  return { orderId: String(result.orderId), total: Number(result.total), whatsappUrl: whatsappUrl(result.whatsappUrl) };
}

export function saveLastOrder(order, session = globalThis.sessionStorage) { try { session.setItem(LAST_KEY, JSON.stringify(order)); } catch { /* ignore */ } }
export function loadLastOrder(session = globalThis.sessionStorage) {
  try { const o = JSON.parse(session.getItem(LAST_KEY) || 'null'); return o && o.orderId ? { ...o, whatsappUrl: whatsappUrl(o.whatsappUrl) } : null; } catch { return null; }
}
export function clearLastOrder(session = globalThis.sessionStorage) { try { session.removeItem(LAST_KEY); } catch { /* ignore */ } }
