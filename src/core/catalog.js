// Pure catalogue functions: normalising API data, categories, search, sorting and merchandising.
import { imageUrl, httpsUrl, slugify } from './safe.js';
import { percentOff } from './format.js';

/** Turn one raw API product into the shape the UI uses. The server stays authoritative for price and stock. */
export function normaliseProduct(raw) {
  const stock = Math.max(0, Number(raw && raw.stock) || 0);
  const price = Number(raw && raw.price) || 0;
  const compareAt = Number(raw && raw.compare_at_price) || 0;
  const images = (Array.isArray(raw && raw.images) ? raw.images : []).map((u) => httpsUrl(u)).filter(Boolean);
  const status = stock <= 0 ? 'Out of Stock' : (raw.status === 'Few Left' ? 'Few Left' : 'In Stock');
  return {
    id: String(raw.id), name: String(raw.name || ''), price, description: String(raw.description || ''),
    category: String(raw.category || ''), images, stock, status,
    createdAt: String(raw.created_at || ''), featured: raw.featured === true,
    compareAt: compareAt > price ? compareAt : 0, percentOff: percentOff(price, compareAt),
  };
}
export const normaliseProducts = (list) => (Array.isArray(list) ? list : []).filter((p) => p && p.id != null).map(normaliseProduct);

export const isSoldOut = (p) => p.status === 'Out of Stock' || p.stock <= 0;
export const stockLabel = (p) => (isSoldOut(p) ? 'Out of stock' : p.status === 'Few Left' ? `Only ${p.stock} left` : 'In stock');
export const coverImage = (p, width = 600) => imageUrl(p.images[0], width);

/** Categories from Settings (owner's order) plus any category found on a product. Slugs are unique and stable. */
export function buildCategories(products, settingsCategories = '', { includeEmpty = false } = {}) {
  const names = [];
  String(settingsCategories).split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => names.push(c));
  products.forEach((p) => { if (p.category && !names.includes(p.category)) names.push(p.category); });
  const used = new Set();
  const list = names.map((name) => {
    let slug = slugify(name) || 'category', n = 2;
    while (used.has(slug)) slug = `${slugify(name) || 'category'}-${n++}`;
    used.add(slug);
    const inCat = products.filter((p) => p.category === name);
    const cover = inCat.find((p) => p.images.length && !isSoldOut(p)) || inCat.find((p) => p.images.length);
    return { name, slug, count: inCat.length, image: cover ? cover.images[0] : '' };
  });
  return includeEmpty ? list : list.filter((c) => c.count > 0);
}

export function searchMatches(p, query) {
  const q = String(query || '').trim().toLowerCase();
  return !q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q);
}

/** availability: 'all' | 'in-stock' | 'few-left' | 'sold-out' */
export function filterProducts(products, { query = '', category = 'All', availability = 'all' } = {}) {
  return products.filter((p) => {
    if (category !== 'All' && p.category !== category) return false;
    if (!searchMatches(p, query)) return false;
    if (availability === 'in-stock') return !isSoldOut(p);
    if (availability === 'few-left') return p.status === 'Few Left';
    if (availability === 'sold-out') return isSoldOut(p);
    return true;
  });
}

/** True only when the backend actually supplies dates, so "newest" is never faked from array order. */
export const hasCreatedAt = (products) => products.some((p) => p.createdAt);

export function sortProducts(products, key = 'default') {
  const list = [...products];
  if (key === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (key === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (key === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (key === 'newest') list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

export const newArrivals = (products, limit = 8) => sortProducts(products.filter((p) => p.createdAt), 'newest').slice(0, limit);
export const featuredProducts = (products, limit = 8) => products.filter((p) => p.featured).slice(0, limit);

/** Best sellers come ONLY from the server ranking (paid orders). Unknown/deleted ids are dropped. */
export function bestSellerProducts(products, ranks, limit = 8) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return (Array.isArray(ranks) ? ranks : []).slice().sort((a, b) => a.rank - b.rank)
    .map((r) => byId.get(String(r.id))).filter(Boolean).slice(0, limit);
}

export function relatedProducts(products, product, limit = 4) {
  return products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, limit);
}
