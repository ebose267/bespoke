/**
 * =====================================================================
 * STORE BACKEND — Google Apps Script, bound to the Google Sheet
 * =====================================================================
 * The Sheet is the stock room and order book. This script is the only
 * person allowed inside it; the storefront and dashboard speak to it.
 * Runtime: V8. Set the Apps Script project time zone to Africa/Lagos.
 *
 * IMPORTANT: This version adds safe schema migration, order idempotency,
 * recoverable payment transactions, stricter validation and honest email
 * delivery results. Existing four-tab sheets are upgraded in place.
 */

// Thimble Store Backend v3 (product-ready). Built on the audited "Store-System-Fixed" release.
// v3 changes: public cache + bundle endpoint, created_at/updated_at/featured/compare_at_price, best sellers,
// undo-payment journal, stale-stock guard, login slow-down, phone-safe formula escaping, WhatsApp number normalising.
const BACKEND_VERSION = '3.0.0';

// ---------- 1. CONFIGURATION ----------

// Keep all business dates on Nigerian time, regardless of Google's server clock.
const TZ = 'Africa/Lagos';

// These are the only product status labels the system accepts.
const STATUSES = ['In Stock', 'Few Left', 'Out of Stock'];

// Existing columns stay in their original order; new columns are appended for migration safety.
const TABS = {
  Products: ['id', 'name', 'price', 'description', 'category', 'images', 'stock', 'status', 'status_locked', 'create_request_id', 'create_fingerprint', 'created_at', 'updated_at', 'featured', 'compare_at_price'],
  Orders: [
    'order_id', 'created_at', 'customer_name', 'customer_email', 'customer_phone',
    'customer_address', 'items_json', 'total', 'status', 'paid_at', 'payment_email_sent',
    'request_id', 'payment_state', 'payment_plan_json',
    'order_customer_email_sent', 'order_owner_email_sent',
    'payment_email_started_at', 'order_customer_email_started_at', 'order_owner_email_started_at',
    'newsletter_opt_in', 'newsletter_date'
  ],
  Customers: [
    'email', 'name', 'phone', 'address', 'newsletter_opt_in', 'newsletter_date',
    'first_order_at', 'last_order_at', 'total_orders', 'total_spent', 'notes', 'tags'
  ],
  Settings: ['key', 'value']
};

// These columns must remain text so Sheets does not remove leading zeroes or reformat dates.
const TEXT_COLS = {
  Products: ['id', 'name', 'description', 'category', 'images', 'status', 'status_locked', 'create_request_id', 'create_fingerprint', 'created_at', 'updated_at', 'featured'],
  Orders: ['order_id', 'created_at', 'customer_name', 'customer_email', 'customer_phone', 'customer_address', 'items_json', 'status', 'paid_at', 'payment_email_sent', 'request_id', 'payment_state', 'payment_plan_json', 'order_customer_email_sent', 'order_owner_email_sent', 'payment_email_started_at', 'order_customer_email_started_at', 'order_owner_email_started_at', 'newsletter_opt_in', 'newsletter_date'],
  Customers: ['email', 'name', 'phone', 'address', 'newsletter_opt_in', 'newsletter_date', 'first_order_at', 'last_order_at', 'notes', 'tags'],
  Settings: ['value']
};

// Never return or accept these keys through the dashboard settings form.
const PROTECTED_KEYS = ['admin_token_hash'];

// Only these settings are safe to send to the public storefront.
const PUBLIC_KEYS = [
  'store_name', 'currency_symbol', 'brand_color', 'logo_url', 'banner_text', 'categories',
  'whatsapp_number', 'tagline', 'about_title', 'about_text', 'contact_phone',
  'contact_email', 'contact_address', 'opening_hours', 'instagram_url'
];

// The owner may edit these settings, but only after server-side validation.
const EDITABLE_KEYS = PUBLIC_KEYS.concat(['owner_email', 'low_stock_threshold', 'dashboard_url']);

// Limits protect the Sheet, mail quota and product catalogue from accidental oversized submissions.
// How long the public catalogue is cached (seconds). Writes clear the cache immediately.
const PUBLIC_CACHE_SECONDS = 60;

const LIMITS = {
  name: 120,
  email: 254,
  phone: 30,
  address: 500,
  description: 2000,
  notes: 1000,
  tags: 200,
  items: 50,
  images: 8,
  imageBytes: 5 * 1024 * 1024,
  stock: 1000000000,
  price: 1000000000000
};


// ---------- 2. ONE-TIME SETUP ----------

// Create missing tabs/columns without moving or overwriting existing client data.
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(TABS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const lastCol = Math.max(1, sh.getLastColumn());
    const existing = sh.getLastRow() > 0
      ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(Boolean)
      : [];

    // A blank tab gets the full header; an older tab only receives missing headers at the end.
    if (!existing.length) {
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
    } else {
      const missing = TABS[name].filter(h => existing.indexOf(h) < 0);
      if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    }

    // Keep the header visible and distinguish it from the data rows.
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    sh.setFrozenRows(1);

    // Enforce text format on phone numbers, timestamps, JSON and settings values.
    const headers = headersFor_(name);
    (TEXT_COLS[name] || []).forEach(col => {
      const idx = headers.indexOf(col) + 1;
      if (idx > 0 && sh.getMaxRows() > 1) {
        sh.getRange(2, idx, sh.getMaxRows() - 1, 1).setNumberFormat('@');
      }
    });
  });

  // Add default settings only when missing; re-running setup never resets client edits.
  const defaults = [
    ['store_name', 'My Store'],
    ['owner_email', 'owner@example.com'],
    ['whatsapp_number', '2348000000000'],
    ['currency_symbol', '₦'],
    ['brand_color', '#0b6e4f'],
    ['logo_url', ''],
    ['banner_text', 'Welcome!'],
    ['categories', 'General'],
    ['low_stock_threshold', '5'],
    ['dashboard_url', ''],
    ['tagline', ''],
    ['about_title', ''],
    ['about_text', ''],
    ['contact_phone', ''],
    ['contact_email', ''],
    ['contact_address', ''],
    ['opening_hours', ''],
    ['instagram_url', ''],
    ['admin_token_hash', '']
  ];
  const current = getSettings();
  defaults.forEach(pair => {
    if (!Object.prototype.hasOwnProperty.call(current, pair[0])) setSetting(pair[0], pair[1]);
  });

  // Migration: a WhatsApp number saved in local format (0801...) becomes country-code digits (234801...).
  const savedWa = String(getSettings().whatsapp_number || '');
  if (savedWa && waDigits_(savedWa) !== savedWa) setSetting('whatsapp_number', waDigits_(savedWa));

  // Remove Google's unused starter tab only when it is completely empty.
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  return { ok: true, message: 'Sheets created or upgraded without moving existing columns.' };
}

// Set a new owner token here, run once, then remove the real token from the source code.
function setToken() {
  const NEW_TOKEN = 'REPLACE_WITH_A_RANDOM_TOKEN_OF_24_OR_MORE_CHARACTERS';
  if (NEW_TOKEN.indexOf('REPLACE_WITH_') === 0 || NEW_TOKEN.length < 24) {
    throw new Error('Edit NEW_TOKEN to a random secret of at least 24 characters before running setToken().');
  }
  setSetting('admin_token_hash', sha256(NEW_TOKEN));
}

// Install one daily summary trigger and remove duplicate dailySummary triggers first.
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailySummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailySummary').timeBased().everyDays(1).atHour(18).nearMinute(30).inTimezone(TZ).create();
}


// ---------- 3. API ENTRY POINTS ----------

// Public GET is read-only. "products" keeps the original response shape; "storefront" adds best sellers.
function doGet(e) {
  try {
    const action = (e && e.parameter) ? e.parameter.action : '';
    if (action === 'products') return json(publicPayload_(false));
    if (action === 'storefront') return json(publicPayload_(true));
    return json({ ok: false, error: 'Unknown request' });
  } catch (err) {
    return json({ ok: false, error: safeError_(err) });
  }
}

// Build (or reuse) the public payload. A cache hit takes no lock, so visitor traffic cannot starve checkout.
function publicPayload_(withBestSellers) {
  const cache = CacheService.getScriptCache();
  const key = withBestSellers ? 'pub_storefront' : 'pub_products';
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (err) { /* rebuild below */ } }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let payload;
  try {
    recoverPreparedPayments_();
    payload = { ok: true, products: publicProducts(), settings: publicSettings() };
    if (withBestSellers) payload.bestSellers = bestSellers_(12);
    payload.generatedAt = now();
  } finally { lock.releaseLock(); }

  // CacheService holds about 100 KB per key. Larger catalogues simply skip the cache (still correct, just slower).
  try { const text = JSON.stringify(payload); if (text.length < 90000) cache.put(key, text, PUBLIC_CACHE_SECONDS); } catch (err) { /* cache is optional */ }
  return payload;
}

// Any write to Products or Settings clears the cached public payloads.
function invalidatePublicCache_() {
  const cache = CacheService.getScriptCache();
  cache.remove('pub_products');
  cache.remove('pub_storefront');
}

// POST handles public checkout/login and authenticated owner operations.
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Request body is missing.');
    const body = JSON.parse(e.postData.contents);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request body.');

    const action = String(body.action || '');
    if (action === 'placeOrder') return json(placeOrder(body));
    if (action === 'login') return json(login(body));

    // Only an explicitly listed route can run; inherited object properties are not routes.
    const routes = {
      getDashboard, getOrders, markPaid, revertPaid, cancelOrder, getProducts, saveProduct,
      deleteProduct, getCustomers, updateCustomer, adminGetSettings, saveSettings, retryReceipt, retryOrderEmails
    };
    if (!Object.prototype.hasOwnProperty.call(routes, action)) throw new Error('Unknown action.');
    requireAuth(body.session);
    return json(routes[action](body));
  } catch (err) {
    return json({ ok: false, error: safeError_(err) });
  }
}


// ---------- 4. AUTHENTICATION ----------

// Compare the token fingerprint and create a six-hour session in script cache.
// Wrong guesses are SLOWED (not locked out) and the delay happens OUTSIDE any lock, so guessing cannot block checkout.
function login(b) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  const storedHash = String(getSettings().admin_token_hash || '');
  const candidate = String(b.token || '');
  if (!storedHash || !candidate || sha256(candidate) !== storedHash) {
    cache.put('login_fails', String(Math.min(fails + 1, 50)), 900);
    Utilities.sleep(Math.min(1000 + fails * 500, 3000));
    throw new Error(fails >= 5 ? 'Too many wrong attempts. Check your token and try again.' : 'Wrong token.');
  }

  cache.remove('login_fails');
  const session = Utilities.getUuid();
  // Store the current token hash as the session value, so changing the token revokes sessions immediately.
  cache.put('sess_' + session, storedHash, 21600);
  return { ok: true, session };
}

// A session is valid only while it exists and still matches the active token hash.
function requireAuth(session) {
  const key = String(session || '');
  if (!key) throw new Error('Please log in again.');
  const cachedHash = CacheService.getScriptCache().get('sess_' + key);
  const activeHash = String(getSettings().admin_token_hash || '');
  if (!cachedHash || !activeHash || cachedHash !== activeHash) throw new Error('Please log in again.');
}


// ---------- 5. PUBLIC CATALOGUE ----------

// Return only fields a customer needs; never expose private settings or admin flags.
function publicProducts() {
  const threshold = getThreshold_();
  return readRows('Products').map(p => ({
    id: String(p.id || ''),
    name: String(p.name || ''),
    price: finiteNumber_(p.price, 0),
    description: String(p.description || ''),
    category: String(p.category || ''),
    images: splitImages(p.images),
    stock: Math.max(0, finiteNumber_(p.stock, 0)),
    created_at: String(p.created_at || ''),
    featured: String(p.featured || 'no') === 'yes',
    compare_at_price: Math.max(0, finiteNumber_(p.compare_at_price, 0)),
    status: finiteNumber_(p.stock, 0) <= 0 ? 'Out of Stock' : (STATUSES.indexOf(String(p.status)) >= 0 ? String(p.status) : autoStatus(finiteNumber_(p.stock, 0), threshold))
  }));
}

// Allow-list makes it impossible to leak owner_email, dashboard_url or token hash to visitors.
function publicSettings() {
  const settings = getSettings();
  const out = {};
  PUBLIC_KEYS.forEach(k => out[k] = settings[k] || '');
  out.whatsapp_number = waDigits_(out.whatsapp_number);
  return out;
}

// Rank products by units in PAID orders only. Returns ids and ranks, never customer data or unit counts.
function bestSellers_(limit) {
  const units = Object.create(null);
  readRows('Orders').forEach(o => {
    if (o.status !== 'Paid') return;
    let items;
    try { items = aggregateSnapshotItems_(parseOrderItems_(o.items_json)); } catch (err) { return; }
    items.forEach(i => { units[i.id] = (units[i.id] || 0) + i.qty; });
  });
  const live = Object.create(null);
  readRows('Products').forEach(p => { live[String(p.id)] = true; });
  return Object.keys(units).filter(id => live[id])
    .sort((a, b) => units[b] - units[a] || a.localeCompare(b))
    .slice(0, limit)
    .map((id, index) => ({ id, rank: index + 1 }));
}

// Digits-only WhatsApp number with country code: "0801 234 5678" -> 2348012345678, "+234 801..." -> 234801...
function waDigits_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  if (/^0\d{10}$/.test(digits)) digits = '234' + digits.slice(1);
  return digits;
}

// One-time owner-run helper: stamp products that have no created_at, keeping their sheet order.
// The dates are the migration time, NOT true creation dates, so use it only if New Arrivals should start populated.
function backfillProductDates() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const blanks = readRows('Products').filter(p => !String(p.created_at || ''));
    blanks.forEach((p, index) => {
      const stamp = Utilities.formatDate(new Date(Date.now() - (blanks.length - index) * 1000), TZ, 'yyyy-MM-dd HH:mm:ss');
      updateRow('Products', p._row, { created_at: stamp, updated_at: stamp });
    });
    return { ok: true, stamped: blanks.length };
  } finally { lock.releaseLock(); }
}

// Split the legacy pipe-delimited image field into a safe list.
function splitImages(v) {
  return String(v || '').split('|').filter(Boolean);
}


// ---------- 6. PUBLIC CHECKOUT ----------

// Save an order exactly once per browser checkout attempt, using a client-generated idempotency key.
function placeOrder(b) {
  const name = text_(b.name, LIMITS.name, 'Name', true);
  const email = text_(b.email, LIMITS.email, 'Email', true).toLowerCase();
  const phone = text_(b.phone, LIMITS.phone, 'Phone', true);
  const address = text_(b.address, LIMITS.address, 'Delivery address', true);
  const requestId = text_(b.request_id || Utilities.getUuid(), 100, 'Request ID', true);

  if (!isEmail_(email)) throw new Error('Please enter a valid email address.');
  const phoneDigits = phone.replace(/\D/g, '');
  if (!/^[+0-9()\-\s]{7,30}$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) throw new Error('Please enter a valid phone number with 7–15 digits.')
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > LIMITS.items) throw new Error('Your cart is empty or contains too many different products.');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error('The checkout session is invalid. Please refresh the page and try again.');

  // A hidden field catches basic form bots; the time check catches instant form submissions.
  if (String(b.website || '').trim()) throw new Error('Unable to process this order.');
  const startedAt = Number(b.started_at || 0);
  if (startedAt) {
    const elapsed = Date.now() - startedAt;
    // Device clock drift can make elapsed negative; only enforce checks when clocks agree.
    if (elapsed >= 0 && (elapsed < 1200 || elapsed > 86400000)) {
      throw new Error('Please review your order and submit again.');
    }
  }
  const normalizedItems = normaliseOrderItems_(b.items);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let order;
  let existing = false;
  try {
    // Finish any interrupted payment before checking or changing stock.
    recoverPreparedPayments_();

    // A timeout can happen after the Sheet saved the order. Reuse that order rather than creating another.
    order = readRows('Orders').find(o => String(o.request_id || '') === requestId);
    if (order) {
      existing = true;
      assertSameCheckoutAttempt_(order, { name, email, phone, address, newsletter: b.newsletter === true, items: normalizedItems });
      rebuildCustomer_(order.customer_email, order, false);
    } else {
      enforceOrderRateLimit_(email, phone);
      const items = normalizedItems;
      const products = readRows('Products');
      const snapshots = items.map(line => {
        const p = products.find(x => String(x.id) === line.id);
        if (!p) throw new Error('A product in your cart is no longer available.');
        const stock = Number(p.stock);
        const price = Number(p.price);
        if (!Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(price) || price < 0) {
          throw new Error('A product has invalid price or stock data. Please contact the store.');
        }
        if (String(p.status) === 'Out of Stock' || stock <= 0 || line.qty > stock) {
          throw new Error('Sorry, only ' + stock + ' of "' + String(p.name) + '" left.');
        }
        return { id: String(p.id), name: String(p.name), price, qty: line.qty };
      });

      const total = snapshots.reduce((sum, item) => sum + item.price * item.qty, 0);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error('The order total is outside the supported range.');

      order = {
        order_id: makeOrderId_(),
        created_at: now(),
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        customer_address: address,
        items_json: JSON.stringify(snapshots),
        total,
        status: 'Pending',
        paid_at: '',
        payment_email_sent: 'no',
        request_id: requestId,
        payment_state: '',
        payment_plan_json: '',
        order_customer_email_sent: 'no',
        order_owner_email_sent: 'no',
        payment_email_started_at: '',
        order_customer_email_started_at: '',
        order_owner_email_started_at: '',
        newsletter_opt_in: b.newsletter === true ? 'yes' : 'no',
        newsletter_date: b.newsletter === true ? now() : ''
      };

      // The order is the source of truth. Customer totals are rebuilt from orders, so retries cannot double-count.
      appendObj('Orders', order);
      order = readRows('Orders').find(o => String(o.request_id || '') === requestId);
      if (!order) throw new Error('Order could not be saved. Please try again.');
      rebuildCustomer_(email, order, false);
    }
  } finally {
    lock.releaseLock();
  }

  // Mail runs outside the stock lock so a slow mail server cannot hold up checkout or payment confirmation.
  const settings = getSettings();
  sendOrderPlacedEmails_(order, settings);
  return {
    ok: true,
    orderId: order.order_id,
    total: Number(order.total),
    whatsappUrl: whatsappLink_(order, settings),
    repeatedRequest: existing
  };
}

// Combine duplicate product lines before checking stock; 2 + 2 is four, not two separate requests.
function normaliseOrderItems_(items) {
  const totals = Object.create(null);
  items.forEach(line => {
    if (!line || typeof line !== 'object') throw new Error('A product in your cart is invalid.');
    const id = String(line.id || '').trim();
    const qty = Number(line.qty);
    if (!id || !Number.isSafeInteger(qty) || qty < 1 || qty > 100000) throw new Error('A product quantity is invalid.');
    totals[id] = (totals[id] || 0) + qty;
    if (!Number.isSafeInteger(totals[id]) || totals[id] > 100000) throw new Error('A product quantity is too large.');
  });
  return Object.keys(totals).map(id => ({ id, qty: totals[id] }));
}

// Build an unambiguous, collision-resistant order ID using a UUID fragment.
// Refuse to reuse one idempotency key for a different basket or customer.
function assertSameCheckoutAttempt_(saved, incoming) {
  const savedItems = parseOrderItems_(saved.items_json).map(item => ({ id: String(item.id), qty: Number(item.qty) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const newItems = incoming.items.map(item => ({ id: String(item.id), qty: Number(item.qty) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const same = String(saved.customer_name) === incoming.name &&
    String(saved.customer_email).toLowerCase() === incoming.email &&
    String(saved.customer_phone) === incoming.phone &&
    String(saved.customer_address) === incoming.address &&
    String(saved.newsletter_opt_in || 'no') === (incoming.newsletter ? 'yes' : 'no') &&
    JSON.stringify(savedItems) === JSON.stringify(newItems);
  if (!same) throw new Error('This checkout key was already used for different details. Start a fresh checkout and submit again.');
}

function makeOrderId_() {
  const date = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  const used = readRows('Orders').map(o => String(o.order_id));
  for (let i = 0; i < 5; i++) {
    const id = 'ORD-' + date + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    if (used.indexOf(id) < 0) return id;
  }
  throw new Error('Could not generate a unique order number. Please try again.');
}

// Apply a small per-email/phone throttle; idempotent retries bypass it before this function is called.
function enforceOrderRateLimit_(email, phone) {
  const cache = CacheService.getScriptCache();
  const key = 'order_rate_' + sha256(email.toLowerCase() + '|' + phone.replace(/\D/g, '')).slice(0, 32);
  const count = Number(cache.get(key) || 0);
  if (count >= 5) throw new Error('Too many orders from these details in a short time. Please contact the store.');
  cache.put(key, String(count + 1), 600);
}

// Construct the WhatsApp message from server-calculated prices and saved order details.
function whatsappLink_(order, s) {
  const number = waDigits_(s.whatsapp_number);
  if (number.length < 10 || number.length > 15) return '';
  const items = parseOrderItems_(order.items_json);
  const lines = items.map(i => '• ' + i.qty + ' x ' + i.name + ' — ' + money(i.price * i.qty, s)).join('\n');
  const message = 'Hello ' + (s.store_name || 'Store') + '! I just placed order ' + order.order_id + '.\n\n' + lines +
    '\n\nTotal: ' + money(order.total, s) + '\nName: ' + order.customer_name +
    '\nPhone: ' + order.customer_phone + '\nAddress: ' + order.customer_address + '\n\nHow do I pay?';
  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
}

// Dashboard-safe version: one damaged row must not take down the whole orders list.
function safeOrderItems_(raw) {
  try { return parseOrderItems_(raw); } catch (err) { return []; }
}

// Parse saved order snapshots and fail clearly if old/corrupt Sheet data is encountered.
function parseOrderItems_(raw) {
  let items;
  try { items = JSON.parse(String(raw || '[]')); } catch (err) { throw new Error('This order has damaged item data. Please inspect the Orders sheet.'); }
  if (!Array.isArray(items)) throw new Error('This order has invalid item data.');
  return items;
}

// Rebuild CRM counts from the Orders tab. Repeating the same checkout request cannot increment totals twice.
function rebuildCustomer_(email, latestOrder, optIn) {
  const orders = readRows('Orders').filter(o => String(o.customer_email).toLowerCase() === String(email).toLowerCase());
  if (!orders.length) return;

  orders.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a._row - b._row);
  const first = orders[0];
  const last = orders[orders.length - 1];
  const paidTotal = orders.filter(o => o.status === 'Paid').reduce((sum, o) => sum + Number(o.total || 0), 0);
  const consentOrders = orders.filter(o => o.newsletter_opt_in === 'yes' && o.newsletter_date).sort((a, b) => String(a.newsletter_date).localeCompare(String(b.newsletter_date)));
  const customers = readRows('Customers');
  const current = customers.find(c => String(c.email).toLowerCase() === String(email).toLowerCase());
  const consentWasStored = current && current.newsletter_opt_in === 'yes';
  const consentFromOrder = consentOrders.length ? consentOrders[0].newsletter_date : '';
  const subscribed = consentWasStored || !!consentFromOrder || optIn === true;
  const record = {
    email: String(email).toLowerCase(),
    name: String(last.customer_name || latestOrder.customer_name || ''),
    phone: String(last.customer_phone || latestOrder.customer_phone || ''),
    address: String(last.customer_address || latestOrder.customer_address || ''),
    newsletter_opt_in: subscribed ? 'yes' : 'no',
    newsletter_date: consentWasStored ? current.newsletter_date : (consentFromOrder || (optIn === true ? now() : '')),
    first_order_at: String(first.created_at || ''),
    last_order_at: String(last.created_at || ''),
    total_orders: orders.length,
    total_spent: paidTotal
  };

  if (current) updateRow('Customers', current._row, record);
  else appendObj('Customers', Object.assign(record, { notes: '', tags: '' }));
}


// ---------- 7. OWNER DASHBOARD DATA ----------

// Dashboard KPIs use Lagos date strings rather than the browser's timezone.
function getDashboard() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const today = today_();
    const orders = readRows('Orders');
    const placedToday = orders.filter(o => String(o.created_at).indexOf(today) === 0);
    const paidToday = orders.filter(o => String(o.paid_at).indexOf(today) === 0);
    const products = readRows('Products');
    return {
      ok: true,
      ordersToday: placedToday.length,
      salesToday: paidToday.reduce((sum, o) => sum + Number(o.total || 0), 0),
      pendingCount: orders.filter(o => o.status === 'Pending').length,
      stockAlerts: products.filter(p => p.status !== 'In Stock' || Number(p.stock) <= 0).map(p => ({
        id: String(p.id), name: String(p.name), stock: Number(p.stock),
        status: Number(p.stock) <= 0 ? 'Out of Stock' : String(p.status)
      }))
    };
  } finally { lock.releaseLock(); }
}

// Return newest orders first and parse the saved item snapshots safely.
function getOrders() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const orders = readRows('Orders').reverse().map(o => ({
      order_id: String(o.order_id), created_at: String(o.created_at), customer_name: String(o.customer_name),
      customer_email: String(o.customer_email), customer_phone: String(o.customer_phone),
      customer_address: String(o.customer_address), items: safeOrderItems_(o.items_json),
      total: Number(o.total), status: String(o.status), paid_at: String(o.paid_at || ''),
      payment_email_sent: String(o.payment_email_sent || 'no'), payment_state: String(o.payment_state || ''),
      order_customer_email_sent: String(o.order_customer_email_sent || 'no'),
      order_owner_email_sent: String(o.order_owner_email_sent || 'no')
    }));
    return { ok: true, orders };
  } finally { lock.releaseLock(); }
}

// Return only the product fields the dashboard editor needs, not internal sheet row numbers.
function getProducts() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const products = readRows('Products').map(p => ({
      id: String(p.id), name: String(p.name), price: Number(p.price), description: String(p.description || ''),
      category: String(p.category || ''), images: splitImages(p.images), stock: Number(p.stock),
      status: Number(p.stock) <= 0 ? 'Out of Stock' : String(p.status), status_locked: String(p.status_locked || 'no'),
      featured: String(p.featured || 'no'), compare_at_price: Math.max(0, finiteNumber_(p.compare_at_price, 0)),
      created_at: String(p.created_at || ''), updated_at: String(p.updated_at || '')
    }));
    return { ok: true, products };
  } finally { lock.releaseLock(); }
}

// Return customer fields needed by the CRM while hiding internal sheet row numbers.
function getCustomers() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const customers = readRows('Customers').sort((a, b) => String(b.last_order_at).localeCompare(String(a.last_order_at))).map(c => ({
      email: String(c.email), name: String(c.name), phone: String(c.phone), address: String(c.address),
      newsletter_opt_in: String(c.newsletter_opt_in), newsletter_date: String(c.newsletter_date || ''),
      first_order_at: String(c.first_order_at || ''), last_order_at: String(c.last_order_at || ''),
      total_orders: Number(c.total_orders || 0), total_spent: Number(c.total_spent || 0),
      notes: String(c.notes || ''), tags: String(c.tags || '')
    }));
    return { ok: true, customers };
  } finally { lock.releaseLock(); }
}

// Return every setting to the authenticated dashboard, except the protected token hash.
function adminGetSettings() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const settings = getSettings();
    PROTECTED_KEYS.forEach(k => delete settings[k]);
    return { ok: true, settings };
  } finally { lock.releaseLock(); }
}


// ---------- 8. PAYMENT TRANSACTIONS ----------

// Mark a pending order paid; a saved payment plan makes interrupted runs safe to resume.
function markPaid(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let order;
  try {
    recoverPreparedPayments_();
    order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
    if (!order) throw new Error('Order not found.');

    // A repeated click or network retry must never deduct stock twice.
    if (order.status === 'Paid') {
      // No stock changes are needed; the receipt path below can retry a failed email.
    } else {
      if (order.status !== 'Pending') throw new Error('Only pending orders can be marked paid.');
      const items = aggregateSnapshotItems_(parseOrderItems_(order.items_json));
      const products = readRows('Products');
      const shortages = [];
      const plan = [];

      items.forEach(item => {
        const product = products.find(p => String(p.id) === item.id);
        const have = product ? Number(product.stock) : 0;
        if (!product || !Number.isSafeInteger(have) || have < item.qty) {
          shortages.push({ name: item.name, needed: item.qty, have: Number.isFinite(have) ? have : 0 });
        }
        if (product) {
          plan.push({
            id: String(product.id),
            qty: item.qty,
            deducted: Math.min(Number.isFinite(have) ? have : 0, item.qty),
            stock_after: Math.max(0, (Number.isFinite(have) ? have : 0) - item.qty)
          });
        }
      });

      if (shortages.length && b.force !== true) {
        return { ok: false, error: 'low_stock', shortages };
      }

      // Save the exact target stock values BEFORE touching product rows.
      // If Apps Script stops halfway through, the next write operation reapplies these values, not a second deduction.
      updateRow('Orders', order._row, {
        payment_state: 'PREPARED',
        payment_plan_json: JSON.stringify(plan)
      });
      order.payment_state = 'PREPARED';
      order.payment_plan_json = JSON.stringify(plan);
      completePreparedPayment_(order);
      order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
    }
  } finally {
    lock.releaseLock();
  }

  const receipt = sendReceiptIfNeeded_(order);
  return { ok: true, receiptSent: receipt.sent, receiptInProgress: receipt.inProgress === true };
}

// Combine duplicate item snapshots in old orders before computing a payment plan.
function aggregateSnapshotItems_(items) {
  const byId = Object.create(null);
  items.forEach(i => {
    const id = String(i.id || '');
    const qty = Number(i.qty);
    if (!id || !Number.isSafeInteger(qty) || qty < 1) throw new Error('This order has invalid item quantities.');
    if (!byId[id]) byId[id] = { id, name: String(i.name || 'Product'), qty: 0 };
    byId[id].qty += qty;
    if (!Number.isSafeInteger(byId[id].qty) || byId[id].qty > 100000) throw new Error('This order has an unsupported total quantity for one product.');
  });
  return Object.keys(byId).map(id => byId[id]);
}

// Finish every interrupted payment plan before another stock-changing action can run.
function recoverPreparedPayments_() {
  readRows('Orders').forEach(order => {
    if (order.payment_state === 'PREPARED') completePreparedPayment_(order);
    else if (order.payment_state === 'REVERTING') completePreparedRevert_(order);
  });
}

// Complete or resume one prepared payment by setting exact stock targets (idempotent writes).
function completePreparedPayment_(order) {
  let plan;
  try { plan = JSON.parse(String(order.payment_plan_json || '[]')); }
  catch (err) { throw new Error('Payment recovery failed for ' + order.order_id + ': the payment plan is damaged.'); }
  if (!Array.isArray(plan)) throw new Error('Payment recovery failed for ' + order.order_id + ': the payment plan is invalid.');

  const products = readRows('Products');
  const threshold = getThreshold_();
  plan.forEach(item => {
    const product = products.find(p => String(p.id) === String(item.id));
    if (!product) throw new Error('Payment recovery is paused: product ' + item.id + ' was deleted from the Products sheet. Restore it before continuing.');
    const left = Number(item.stock_after);
    if (!Number.isSafeInteger(left) || left < 0) throw new Error('Payment recovery is paused: invalid stock target for ' + item.id + '.');
    const update = { stock: left };
    // Zero stock is a physical fact, so it must always display Out of Stock even when a manual label was locked.
    // A manual label remains in force again after the owner replenishes stock and chooses a new status.
    if (left <= 0) update.status = 'Out of Stock';
    else if (product.status_locked !== 'yes') update.status = autoStatus(left, threshold);
    updateRow('Products', product._row, update);
  });

  // Mark the order paid only after all exact stock targets have been applied.
  const paidAt = String(order.paid_at || now());
  updateRow('Orders', order._row, { status: 'Paid', paid_at: paidAt });

  // Recompute lifetime spend from paid orders so a restart cannot add the same order twice.
  rebuildCustomer_(order.customer_email, order, false);

  // Mark complete last. Re-running the plan before this point is harmless because stock targets are absolute.
  updateRow('Orders', order._row, { payment_state: 'COMPLETE' });
  order.status = 'Paid';
  order.paid_at = paidAt;
  order.payment_state = 'COMPLETE';
}

// Owner pressed "Confirm payment" by mistake? Put the order back to Pending and return the stock.
// Uses the same journal pattern as payment: exact stock targets are saved first, so an interruption cannot double-restore.
function revertPaid(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
    if (!order) throw new Error('Order not found.');
    if (order.status !== 'Paid') throw new Error('Only paid orders can be undone.');
    if (order.payment_state && order.payment_state !== 'COMPLETE') throw new Error('This order is still being processed. Refresh and try again.');

    // Prefer what the payment really deducted (it can be less than ordered after a forced shortage).
    let paidPlan = [];
    try { paidPlan = JSON.parse(String(order.payment_plan_json || '[]')); } catch (err) { paidPlan = []; }
    const deductedById = Object.create(null);
    if (Array.isArray(paidPlan)) paidPlan.forEach(item => { if (Number.isSafeInteger(Number(item.deducted))) deductedById[String(item.id)] = Number(item.deducted); });

    const products = readRows('Products');
    const plan = [];
    aggregateSnapshotItems_(parseOrderItems_(order.items_json)).forEach(item => {
      const product = products.find(p => String(p.id) === item.id);
      if (!product) return; // product deleted since: nothing to restore
      const back = Object.prototype.hasOwnProperty.call(deductedById, item.id) ? deductedById[item.id] : item.qty;
      plan.push({ id: item.id, restore: back, stock_after: Number(product.stock) + back });
    });

    updateRow('Orders', order._row, { payment_state: 'REVERTING', payment_plan_json: JSON.stringify(plan) });
    order.payment_state = 'REVERTING';
    order.payment_plan_json = JSON.stringify(plan);
    completePreparedRevert_(order);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// Apply (or resume) an undo-payment plan using absolute stock targets.
function completePreparedRevert_(order) {
  let plan;
  try { plan = JSON.parse(String(order.payment_plan_json || '[]')); }
  catch (err) { throw new Error('Undo recovery failed for ' + order.order_id + ': the plan is damaged.'); }
  if (!Array.isArray(plan)) throw new Error('Undo recovery failed for ' + order.order_id + ': the plan is invalid.');

  const products = readRows('Products');
  const threshold = getThreshold_();
  plan.forEach(item => {
    const product = products.find(p => String(p.id) === String(item.id));
    if (!product) return;
    const stock = Number(item.stock_after);
    if (!Number.isSafeInteger(stock) || stock < 0) throw new Error('Undo recovery is paused: invalid stock target for ' + item.id + '.');
    const update = { stock };
    if (product.status_locked !== 'yes') update.status = autoStatus(stock, threshold);
    updateRow('Products', product._row, update);
  });

  // Back to Pending. The receipt flag resets so a later re-confirmation can send a fresh receipt.
  updateRow('Orders', order._row, {
    status: 'Pending', paid_at: '', payment_email_sent: 'no', payment_email_started_at: '',
    payment_plan_json: '', payment_state: ''
  });
  rebuildCustomer_(order.customer_email, order, false);
  invalidatePublicCache_();
}

// Claim a receipt email before sending it, so two simultaneous dashboard requests cannot send duplicates.
function sendReceiptIfNeeded_(order) {
  if (!order || order.status !== 'Paid') return { sent: false, inProgress: false };
  const receiptSettings = getSettings();
  const result = sendEmailOnce_(order.order_id, 'payment_email_sent', 'payment_email_started_at',
    order.customer_email, 'Receipt for order ' + order.order_id,
    emailShell(receiptSettings, 'Payment confirmed',
      '<p>Hi ' + esc(order.customer_name) + ', we have received your payment. Here is your receipt.</p>' +
      '<p><b>Order:</b> ' + esc(order.order_id) + '<br><b>Paid on:</b> ' + esc(order.paid_at) + '<br><b>Delivery to:</b> ' + esc(order.customer_address) + '</p>' +
      itemsTable(parseOrderItems_(order.items_json), order.total, receiptSettings) +
      '<p>Thank you for shopping with ' + esc(receiptSettings.store_name) + '!</p>'));
  return result;
}

// Claim/send/finalise one order email with a short lease that can recover after an interrupted execution.
function sendEmailOnce_(orderId, stateField, startedField, recipient, subject, html) {
  const lock = LockService.getScriptLock();
  let order;
  lock.waitLock(20000);
  try {
    order = readRows('Orders').find(row => String(row.order_id) === String(orderId));
    if (!order) throw new Error('Order not found while preparing email.');
    if (order[stateField] === 'yes') return { sent: true, inProgress: false };

    const started = Number(order[startedField] || 0);
    if (order[stateField] === 'SENDING' && started && Date.now() - started < 15 * 60 * 1000) {
      return { sent: false, inProgress: true };
    }

    // Mark the message as in-flight before the external mail service is called.
    const claim = {};
    claim[stateField] = 'SENDING';
    claim[startedField] = String(Date.now());
    updateRow('Orders', order._row, claim);
  } finally {
    lock.releaseLock();
  }

  const sent = sendMail(recipient, subject, html, getSettings());

  // Finish the lease. A crash after MailApp accepts but before this write can still require manual review.
  lock.waitLock(20000);
  try {
    order = readRows('Orders').find(row => String(row.order_id) === String(orderId));
    if (order && order[stateField] === 'SENDING') {
      const finalState = {};
      finalState[stateField] = sent ? 'yes' : 'no';
      finalState[startedField] = '';
      updateRow('Orders', order._row, finalState);
    }
  } finally {
    lock.releaseLock();
  }
  return { sent, inProgress: false };
}

// Owner-only retry path for a receipt that previously failed because of quota or a transient mail error.
function retryReceipt(b) {
  const order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
  if (!order) throw new Error('Order not found.');
  if (order.status !== 'Paid' || (order.payment_state && order.payment_state !== 'COMPLETE')) throw new Error('Only fully paid orders can receive a payment receipt.');
  const result = sendReceiptIfNeeded_(order);
  return { ok: true, receiptSent: result.sent, receiptInProgress: result.inProgress === true };
}

// Cancel under the same lock as payment confirmation so the two actions cannot race.
function cancelOrder(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
    if (!order) throw new Error('Order not found.');
    if (order.status !== 'Pending') throw new Error('Only pending orders can be cancelled.');
    updateRow('Orders', order._row, { status: 'Cancelled' });
    rebuildCustomer_(order.customer_email, order, false);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}


// ---------- 9. PRODUCT AND CUSTOMER MANAGEMENT ----------

// Save a product with strict number, status and image URL validation.
function saveProduct(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const p = b.product || {};
    const name = text_(p.name, LIMITS.name, 'Product name', true);
    const price = wholeNumber_(p.price, 1, LIMITS.price, 'Price');
    let stock = wholeNumber_(p.stock, 0, LIMITS.stock, 'Stock');
    const description = text_(p.description, LIMITS.description, 'Description', false);
    const category = text_(p.category, 80, 'Category', false);
    const images = validateImages_(p.images);
    const locked = p.status_locked === true || p.status_locked === 'yes';
    const selectedStatus = String(p.status || 'In Stock');
    if (locked && STATUSES.indexOf(selectedStatus) < 0) throw new Error('Choose a valid manual product status.');
    const featured = p.featured === true || p.featured === 'yes';
    // Optional "was" price: blank/0 means no sale; otherwise it must be higher than the selling price.
    const compareRaw = (p.compare_at_price === '' || p.compare_at_price == null) ? 0 : wholeNumber_(p.compare_at_price, 0, LIMITS.price, 'Original price');
    if (compareRaw > 0 && compareRaw <= price) throw new Error('Original price must be higher than the selling price, or left blank.');
    const threshold = getThreshold_();

    // Stale-form protection: the editor sends the stock it was opened with. If the stock box is untouched the LIVE
    // number is kept; if it was changed while a sale moved the stock, the save is refused rather than overwriting.
    let existing = null;
    if (p.id) {
      const matches = readRows('Products').filter(row => String(row.id) === String(p.id));
      if (matches.length !== 1) throw new Error(matches.length ? 'This product ID is duplicated in the Products sheet.' : 'Product not found.');
      existing = matches[0];
      if (p.stock_loaded !== undefined && p.stock_loaded !== null && p.stock_loaded !== '') {
        const loaded = Number(p.stock_loaded), live = Number(existing.stock);
        if (stock === loaded) stock = live;
        else if (live !== loaded) throw new Error('Stock changed while you were editing (it is now ' + live + '). Please reopen the product and try again.');
      }
    }
    if (locked && stock === 0 && selectedStatus !== 'Out of Stock') throw new Error('A product with zero stock must be marked Out of Stock.');

    const record = {
      name, price, stock, description, category,
      images: images.join('|'),
      status: locked ? selectedStatus : autoStatus(stock, threshold),
      status_locked: locked ? 'yes' : 'no',
      featured: featured ? 'yes' : 'no',
      compare_at_price: compareRaw
    };

    if (existing) {
      record.updated_at = now();
      updateRow('Products', existing._row, record);
      return { ok: true, id: String(p.id) };
    }

    const requestId = text_(p.request_id, 100, 'Product request ID', true);
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error('The product save session is invalid. Please reopen the form and try again.');
    // The fingerprint covers the owner's inputs only, never timestamps, so a retry of the same save matches.
    const fingerprint = sha256(JSON.stringify(record));
    const prior = readRows('Products').find(row => String(row.create_request_id || '') === requestId);
    if (prior) {
      if (String(prior.create_fingerprint || '') !== fingerprint) throw new Error('This product save key was already used for different details. Reopen the product form and try again.');
      return { ok: true, id: String(prior.id), repeatedRequest: true };
    }
    record.id = makeProductId_();
    record.create_request_id = requestId;
    record.create_fingerprint = fingerprint;
    record.created_at = now();
    record.updated_at = record.created_at;
    appendObj('Products', record);
    return { ok: true, id: record.id, repeatedRequest: false };
  } finally {
    lock.releaseLock();
  }
}

// Create an ID that does not collide with any existing product row.
function makeProductId_() {
  const used = readRows('Products').map(p => String(p.id));
  for (let i = 0; i < 5; i++) {
    const id = 'P' + Date.now() + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
    if (used.indexOf(id) < 0) return id;
  }
  throw new Error('Could not generate a unique product ID. Please try again.');
}

// Only HTTPS image links are stored, and a pipe is forbidden because it separates image URLs in the Sheet.
function validateImages_(images) {
  if (images == null) return [];
  if (!Array.isArray(images) || images.length > LIMITS.images) throw new Error('Upload no more than ' + LIMITS.images + ' product images.');
  return images.map(url => {
    const value = text_(url, 1000, 'Image URL', true);
    if (value.indexOf('|') >= 0 || !isHttpsUrl_(value)) throw new Error('Every product image must be a valid HTTPS URL.');
    return value;
  });
}

// Refuse product deletion when an unpaid order still depends on its inventory record.
function deleteProduct(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const id = String(b.id || '');
    const matches = readRows('Products').filter(p => String(p.id) === id);
    if (matches.length !== 1) throw new Error(matches.length ? 'This product ID is duplicated.' : 'Product not found.');
    const pendingUse = readRows('Orders').some(o => {
      if (o.status !== 'Pending') return false;
      return parseOrderItems_(o.items_json).some(i => String(i.id) === id);
    });
    if (pendingUse) throw new Error('This product is in a pending order. Cancel or complete that order before deleting the product.');
    sheet('Products').deleteRow(matches[0]._row);
    invalidatePublicCache_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// Save only private customer notes and tags; CRM totals are derived from Orders.
function updateCustomer(b) {
  const email = text_(b.email, LIMITS.email, 'Email', true).toLowerCase();
  if (!isEmail_(email)) throw new Error('Customer email is invalid.');
  const matches = readRows('Customers').filter(r => String(r.email).toLowerCase() === email);
  if (matches.length !== 1) throw new Error(matches.length ? 'This customer email is duplicated.' : 'Customer not found.');
  updateRow('Customers', matches[0]._row, {
    notes: text_(b.notes, LIMITS.notes, 'Notes', false),
    tags: text_(b.tags, LIMITS.tags, 'Tags', false)
  });
  return { ok: true };
}


// ---------- 10. SETTINGS ----------

// Validate the complete settings set before writing any of the submitted values.
function saveSettings(b) {
  const incoming = b.settings || {};
  if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Settings payload is invalid.');
  const keys = Object.keys(incoming);
  keys.forEach(k => {
    if (EDITABLE_KEYS.indexOf(k) < 0 || PROTECTED_KEYS.indexOf(k) >= 0) throw new Error('This setting cannot be changed from the dashboard: ' + k);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const candidate = Object.assign({}, getSettings());
    keys.forEach(k => candidate[k] = String(incoming[k] == null ? '' : incoming[k]).trim());
    validateSettings_(candidate);
    keys.forEach(k => setSetting(k, candidate[k]));
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// Keep the settings form from breaking URLs, links, email delivery or page branding.
function validateSettings_(s) {
  if (!String(s.store_name || '').trim() || String(s.store_name).length > 100) throw new Error('Store name is required and must be under 100 characters.');
  if (!isEmail_(String(s.owner_email || ''))) throw new Error('Enter a valid owner email address.');
  const whatsapp = waDigits_(s.whatsapp_number);
  if (whatsapp.length < 10 || whatsapp.length > 15 || whatsapp.charAt(0) === '0') throw new Error('WhatsApp number must include the country code, have 10–15 digits and not start with 0.');
  s.whatsapp_number = whatsapp;
  s.owner_email = String(s.owner_email || '').trim().toLowerCase();
  if (s.contact_email) s.contact_email = String(s.contact_email).trim().toLowerCase();
  if (!/^#[0-9a-fA-F]{6}$/.test(String(s.brand_color || ''))) throw new Error('Brand colour must be a six-digit hex colour, e.g. #0b6e4f.');
  if (String(s.currency_symbol || '').length > 8) throw new Error('Currency symbol is too long.');
  const threshold = Number(s.low_stock_threshold);
  if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 1000000) throw new Error('Low-stock threshold must be a whole number from 0 to 1,000,000.');
  if (s.contact_email && !isEmail_(String(s.contact_email))) throw new Error('Public contact email is invalid.');
  ['logo_url', 'dashboard_url', 'instagram_url'].forEach(k => {
    if (s[k] && !isHttpsUrl_(String(s[k]))) throw new Error(k + ' must be a valid HTTPS URL.');
  });
  if (String(s.categories || '').length > 500) throw new Error('Categories must be 500 characters or fewer.');
  if (String(s.banner_text || '').length > 300) throw new Error('Banner text must be 300 characters or fewer.');
  if (String(s.about_text || '').length > 5000) throw new Error('About text must be 5,000 characters or fewer.');
  if (String(s.about_title || '').length > 120 || String(s.tagline || '').length > 250) throw new Error('About title or tagline is too long.');
  if (String(s.contact_phone || '').length > 50 || String(s.contact_address || '').length > 500 || String(s.opening_hours || '').length > 200) throw new Error('Contact phone, address or opening hours is too long.');
}

// Use the configured whole-number threshold; zero is a valid setting, not a signal to use the default.
function getThreshold_() {
  const value = Number(getSettings().low_stock_threshold);
  return Number.isSafeInteger(value) && value >= 0 ? value : 5;
}


// ---------- 11. EMAILS ----------

// Send customer and owner order notifications with separate idempotency flags.
function sendOrderPlacedEmails_(order, settings) {
  const table = itemsTable(parseOrderItems_(order.items_json), order.total, settings);
  const customerHtml = emailShell(settings, 'We got your order!',
    '<p>Hi ' + esc(order.customer_name) + ',</p><p>Your order <b>' + esc(order.order_id) + '</b> is saved. Please complete payment on WhatsApp. We will email your receipt after payment is confirmed.</p>' + table);
  const customerResult = sendEmailOnce_(order.order_id, 'order_customer_email_sent', 'order_customer_email_started_at',
    order.customer_email, 'Order ' + order.order_id + ' received', customerHtml);

  const ownerHtml = emailShell(settings, 'New order',
    '<p><b>' + esc(order.customer_name) + '</b><br>' + esc(order.customer_phone) + ' · ' + esc(order.customer_email) + '<br>' + esc(order.customer_address) + '</p>' + table +
    (settings.dashboard_url ? '<p><a href="' + esc(settings.dashboard_url) + '">Open dashboard</a></p>' : ''));
  const ownerResult = sendEmailOnce_(order.order_id, 'order_owner_email_sent', 'order_owner_email_started_at',
    settings.owner_email, 'New order ' + order.order_id + ' — ' + money(order.total, settings), ownerHtml);
  return { customer: customerResult, owner: ownerResult };
}

// Let the owner retry either order notification after a quota or temporary mail failure.
function retryOrderEmails(b) {
  const order = readRows('Orders').find(row => String(row.order_id) === String(b.orderId));
  if (!order) throw new Error('Order not found.');
  const result = sendOrderPlacedEmails_(order, getSettings());
  return {
    ok: true,
    customerEmailSent: result.customer.sent,
    ownerEmailSent: result.owner.sent,
    customerEmailInProgress: result.customer.inProgress === true,
    ownerEmailInProgress: result.owner.inProgress === true
  };
}

// Send a paid receipt and return true only when MailApp accepted it.
function mailReceipt(order, settings) {
  const items = parseOrderItems_(order.items_json);
  const html = emailShell(settings, 'Payment confirmed',
    '<p>Hi ' + esc(order.customer_name) + ', we have received your payment. Here is your receipt.</p>' +
    '<p><b>Order:</b> ' + esc(order.order_id) + '<br><b>Paid on:</b> ' + esc(order.paid_at) + '<br><b>Delivery to:</b> ' + esc(order.customer_address) + '</p>' +
    itemsTable(items, order.total, settings) + '<p>Thank you for shopping with ' + esc(settings.store_name) + '!</p>');
  return sendMail(order.customer_email, 'Receipt for order ' + order.order_id, html, settings);
}

// Looking 6 hours back means a report that fires late (after midnight) still covers the day that just ended.
function summaryDay_() {
  return Utilities.formatDate(new Date(Date.now() - 6 * 3600 * 1000), TZ, 'yyyy-MM-dd');
}

// Send the scheduled daily report, even on quiet days, and include every product's stock status.
function dailySummary() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let settings, today, orders, customers, products;
  try {
    recoverPreparedPayments_();
    settings = getSettings();
    today = summaryDay_();
    orders = readRows('Orders');
    customers = readRows('Customers');
    products = readRows('Products');
  } finally {
    lock.releaseLock();
  }

  const isToday = value => String(value || '').indexOf(today) === 0;
  const todays = orders.filter(o => isToday(o.created_at) || isToday(o.paid_at));
  const sales = orders.filter(o => isToday(o.paid_at)).reduce((sum, o) => sum + Number(o.total || 0), 0);
  const pending = orders.filter(o => o.status === 'Pending');
  const newCustomers = customers.filter(c => isToday(c.first_order_at)).length;
  const newSubscribers = customers.filter(c => isToday(c.newsletter_date)).length;
  const orderRows = todays.map(o => '<tr><td>' + esc(o.order_id) + '</td><td>' + esc(o.customer_name) + '</td><td>' + money(o.total, settings) + '</td><td>' + badge(o.status) + '</td></tr>').join('');
  const stockRows = products.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + Number(p.stock) + '</td><td>' + badge(p.status) + '</td></tr>').join('');
  const html = emailShell(settings, 'Daily summary — ' + today,
    '<p><b>Sales today:</b> ' + money(sales, settings) + '<br><b>Orders today:</b> ' + todays.length +
    '<br><b>Awaiting payment (all days):</b> ' + pending.length + '<br><b>New customers:</b> ' + newCustomers +
    '<br><b>New newsletter subscribers:</b> ' + newSubscribers + '</p>' +
    '<h3>Today\'s orders</h3>' + (orderRows ? '<table width="100%" cellpadding="6">' + orderRows + '</table>' : '<p>No orders today.</p>') +
    '<h3>Stock status</h3><table width="100%" cellpadding="6"><tr><th align="left">Product</th><th align="left">Left</th><th align="left">Status</th></tr>' + stockRows + '</table>');
  return sendMail(settings.owner_email, 'Daily summary — ' + today, html, settings);
}

// Wrap an email in the store's brand frame; unsafe colour/image values fall back to safe defaults.
function emailShell(s, heading, inner) {
  const colour = /^#[0-9a-fA-F]{6}$/.test(String(s.brand_color || '')) ? s.brand_color : '#0b6e4f';
  const logo = isHttpsUrl_(String(s.logo_url || '')) ? '<img src="' + esc(s.logo_url) + '" height="32" style="vertical-align:middle;margin-right:8px">' : '';
  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee">' +
    '<div style="background:' + colour + ';color:#fff;padding:16px;font-size:18px">' + logo + esc(s.store_name || 'Store') + '</div>' +
    '<div style="padding:20px"><h2 style="margin-top:0">' + esc(heading) + '</h2>' + inner + '</div></div>';
}

// Render the order's saved price snapshots, not today's product prices.
function itemsTable(items, total, s) {
  const rows = items.map(i => '<tr><td>' + esc(i.name) + ' × ' + Number(i.qty) + '</td><td align="right">' + money(Number(i.price) * Number(i.qty), s) + '</td></tr>').join('');
  return '<table width="100%" cellpadding="6" style="border-top:1px solid #eee">' + rows +
    '<tr><td><b>Total</b></td><td align="right"><b>' + money(total, s) + '</b></td></tr></table>';
}

// Render a small status badge in the daily email.
function badge(status) {
  const colours = {
    Paid: '#1a7f37', 'In Stock': '#1a7f37', Pending: '#b7791f',
    'Few Left': '#b7791f', 'Out of Stock': '#c53030', Cancelled: '#c53030'
  };
  const colour = colours[status] || '#555';
  return '<span style="background:' + colour + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">' + esc(status) + '</span>';
}

// Mail errors never undo orders, but callers can now see whether delivery succeeded.
function sendMail(to, subject, html, settings) {
  try {
    const recipient = String(to || '').trim();
    if (!isEmail_(recipient)) throw new Error('Recipient email is missing or invalid.');
    if (MailApp.getRemainingDailyQuota && MailApp.getRemainingDailyQuota() < 1) throw new Error('Daily email quota is exhausted.');
    MailApp.sendEmail({
      to: recipient,
      subject: String(subject || '').slice(0, 250),
      htmlBody: html,
      name: String(settings.store_name || 'Store').slice(0, 100),
      replyTo: isEmail_(String(settings.owner_email || '')) ? settings.owner_email : undefined
    });
    return true;
  } catch (err) {
    console.error('Email failed: ' + safeError_(err));
    return false;
  }
}


// ---------- 12. SMALL HELPERS ----------

// Calculate the correct product label from stock and the configured threshold.
function autoStatus(stock, threshold) {
  if (stock <= 0) return 'Out of Stock';
  if (stock <= threshold) return 'Few Left';
  return 'In Stock';
}

// Convert a Sheet cell to a finite number, using a safe fallback for blank/corrupt cells.
function finiteNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Format whole-naira money with thousands separators.
function money(value, settings) {
  const n = Number(value);
  return (settings.currency_symbol || '') + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-NG');
}

// Escape all customer- or owner-supplied text before embedding it in email HTML.
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// Keep a single, predictable HTML-safe text value and enforce its field length.
function text_(value, maxLength, label, required) {
  const result = String(value == null ? '' : value).trim();
  if (required && !result) throw new Error(label + ' is required.');
  if (result.length > maxLength) throw new Error(label + ' must be ' + maxLength + ' characters or fewer.');
  return result;
}

// Validate a whole number without silently flooring decimals or accepting Infinity.
function wholeNumber_(value, minimum, maximum, label) {
  if (value === '' || value === null || value === undefined) throw new Error(label + ' is required.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(label + ' must be a whole number from ' + minimum + ' to ' + maximum + '.');
  }
  return number;
}

// Basic email shape/length validation; MailApp remains the final delivery authority.
function isEmail_(email) {
  return String(email || '').length <= LIMITS.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(email || ''));
}

// Allow only valid HTTPS URLs for external images and links.
function isHttpsUrl_(value) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(String(value || ''));
}

// Work out auto-status even when an older Sheet has a missing or malformed threshold.
function safeError_(err) {
  return String(err && err.message ? err.message : err || 'Unknown error').slice(0, 500);
}

// Current time and date in Lagos, stored as text so Sheets never changes the format.
function now() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}
function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

// SHA-256 is used only with a high-entropy owner token, never with a short PIN.
function sha256(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// Send a JSON response using Apps Script ContentService.
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Retrieve one of the expected database tabs or explain how to create it.
function sheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setupSheets() first.');
  return sh;
}

// Read the current column order from the Sheet, allowing old clients to keep existing column positions.
function headersFor_(name) {
  const sh = sheet(name);
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) throw new Error('Tab "' + name + '" has no header. Run setupSheets() first.');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const used = headers.filter(Boolean);
  if (new Set(used).size !== used.length) throw new Error('Tab "' + name + '" has duplicate column headers. Fix row 1 before continuing.');
  return headers;
}

// Turn rows into objects and remember each actual sheet row for later updates.
function readRows(name) {
  const values = sheet(name).getDataRange().getValues();
  if (!values || values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((row, index) => {
    const record = { _row: index + 2 };
    headers.forEach((header, col) => { if (header) record[header] = unescapeSheetValue_(row[col]); });
    return record;
  }).filter(record => headers.some(header => header && record[header] !== '' && record[header] !== null));
}

// Append values using the Sheet's real header positions, not assumed column positions.
function appendObj(name, obj) {
  const sh = sheet(name);
  const headers = headersFor_(name);
  // Append at the next data row, making sure text columns are plain-text BEFORE values are written.
  const nextRow = sh.getLastRow() + 1;
  (TEXT_COLS[name] || []).forEach(column => {
    const index = headers.indexOf(column) + 1;
    if (index > 0) sh.getRange(nextRow, index).setNumberFormat('@');
  });
  // Sheets can interpret text beginning with =, +, - or @ as a formula. Store it literally.
  sh.getRange(nextRow, 1, 1, headers.length).setValues([headers.map(header => sheetSafeValue_(obj[header] === undefined ? '' : obj[header]))]);
  if (name === 'Products' || name === 'Settings') invalidatePublicCache_();
}

// Update selected cells using the actual header row; unknown keys are rejected rather than ignored silently.
function updateRow(name, rowNumber, obj) {
  const sh = sheet(name);
  const headers = headersFor_(name);
  Object.keys(obj).forEach(key => {
    const col = headers.indexOf(key) + 1;
    if (col < 1) throw new Error('Column "' + key + '" is missing from ' + name + '. Run setupSheets() first.');
    sh.getRange(rowNumber, col).setValue(sheetSafeValue_(obj[key]));
  });
  if (name === 'Products' || name === 'Settings') invalidatePublicCache_();
}

// Neutralise spreadsheet formula injection in user-controlled strings before they reach a cell.
// Phone-style values such as "+234 801 234 5678" are safe and are left alone; anything else starting with = + - @ is escaped.
function sheetSafeValue_(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.replace(/^[\u0000-\u0020\uFEFF\u200B]+/, '');
  if (/^[=@]/.test(trimmed)) return "'" + value;
  if (/^[+\-]/.test(trimmed) && !/^\+[0-9][0-9\s().\-]*$/.test(trimmed)) return "'" + value;
  return value;
}

// Reverse of sheetSafeValue_ when reading, so retries and re-saves round-trip exactly whether or not Sheets hides the apostrophe.
function unescapeSheetValue_(value) {
  if (typeof value !== 'string') return value;
  return /^'[\u0000-\u0020\uFEFF\u200B]*[=+\-@]/.test(value) ? value.slice(1) : value;
}

// Read key/value settings, converting values to strings for consistent API responses.
function getSettings() {
  const result = {};
  readRows('Settings').forEach(row => {
    if (row.key !== '' && row.key != null) result[String(row.key)] = String(row.value == null ? '' : row.value);
  });
  return result;
}

// Add or update one settings key; a missing key is appended rather than ignored.
function setSetting(key, value) {
  const matches = readRows('Settings').filter(row => String(row.key) === String(key));
  if (matches.length > 1) throw new Error('Duplicate Settings key: ' + key + '. Remove duplicates in the Sheet.');
  if (matches.length) updateRow('Settings', matches[0]._row, { value: String(value) });
  else appendObj('Settings', { key: String(key), value: String(value) });
}
