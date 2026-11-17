// Public catalogue loading. One GET at start-up; the result is shared by every page.
import { normaliseProducts } from './catalog.js';
import { waDigits, isHexColour } from './safe.js';

const PLACEHOLDER = /^__[A-Z_]+__$/;

/** Resolve the Apps Script URL from build-time env. Throws a readable error instead of calling nothing. */
export function resolveApiUrl(env = {}) {
  const url = String(env.VITE_API_URL || '').trim();
  if (!url || PLACEHOLDER.test(url)) throw new Error('VITE_API_URL is not set. Copy .env.example to .env and add this client\'s Apps Script URL.');
  if (!/^https:\/\//.test(url)) throw new Error('VITE_API_URL must be an https:// Apps Script web app URL.');
  return url;
}

async function getJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    return { response, data: await response.json() };
  } finally { clearTimeout(timer); }
}

export function normaliseSettings(raw = {}) {
  const s = { ...raw };
  s.store_name = String(s.store_name || 'Store');
  s.currency_symbol = String(s.currency_symbol || '₦');
  s.brand_color = isHexColour(s.brand_color) ? s.brand_color : '';
  s.whatsapp_number = waDigits(s.whatsapp_number);
  return s;
}

/**
 * Loads products, public settings and best-seller ranks.
 * Tries the v3 "storefront" bundle first and falls back to the original "products" action on an older backend.
 */
export async function fetchStorefront(apiUrl, { fetchImpl = globalThis.fetch, timeoutMs = 25000 } = {}) {
  const join = (action) => apiUrl + (apiUrl.includes('?') ? '&' : '?') + 'action=' + action;
  let { response, data } = await getJson(join('storefront'), { fetchImpl, timeoutMs });
  if (data && data.ok === false && /unknown request/i.test(String(data.error))) {
    ({ response, data } = await getJson(join('products'), { fetchImpl, timeoutMs }));
  }
  if (!response.ok || !data || data.ok !== true) throw new Error((data && data.error) || 'The store could not be loaded.');
  if (!Array.isArray(data.products) || !data.settings || typeof data.settings !== 'object') throw new Error('The store returned incomplete catalogue data.');
  return {
    products: normaliseProducts(data.products),
    settings: normaliseSettings(data.settings),
    bestSellers: Array.isArray(data.bestSellers) ? data.bestSellers : [],
  };
}
