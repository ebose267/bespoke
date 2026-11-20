/**
 * =====================================================================
 * thecode.gs — Google Apps Script Backend (Sheets + Drive + Web App)
 * =====================================================================
 * Connects index.html (storefront) and admin.html (owner dashboard) to
 * Google Sheets (central content & store database) and Google Drive
 * (uploaded custom HTML pages).
 *
 * Runtime: V8. Set Apps Script timezone to Africa/Lagos (or your store TZ).
 * Deploy as Web App: Execute as "Me", Who has access "Anyone".
 * Safe for existing spreadsheets: setupSheets() appends missing tabs and
 * missing columns without overwriting or duplicating existing records.
 */

const BACKEND_VERSION = '4.0.0';

// ---------- 1. CONFIGURATION ----------

// Optional explicit IDs. Leave '' when bound directly to the target Google Sheet.
const SPREADSHEET_ID = '';
const DRIVE_FOLDER_ID = '';
const CUSTOM_PAGES_FOLDER_NAME = 'Store Custom Pages';

const TZ = 'Africa/Lagos';
const STATUSES = ['In Stock', 'Few Left', 'Out of Stock'];
const PUBLIC_CACHE_SECONDS = 60;

// Reserved slugs that custom pages cannot hijack.
const RESERVED_PAGE_SLUGS = [
  'shop', 'cart', 'checkout', 'done', 'product', 'products', 'category',
  'categories', 'new-arrivals', 'best-sellers', 'about', 'contact', 'page', 'admin', 'home'
];

// Existing columns stay in exact original order; new fields append cleanly at the end.
const TABS = {
  Products: [
    'id', 'name', 'price', 'description', 'category', 'images', 'stock',
    'status', 'status_locked', 'create_request_id', 'create_fingerprint',
    'created_at', 'updated_at', 'featured', 'compare_at_price', 'sku'
  ],
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
  Settings: ['key', 'value'],
  Categories: ['id', 'name', 'slug', 'description', 'image_url', 'sort_order', 'is_active', 'updated_at'],
  HeroSettings: ['key', 'value'],
  CustomPages: [
    'page_id', 'slug', 'title', 'drive_file_id', 'file_name', 'file_size',
    'is_active', 'show_in_nav', 'nav_label', 'nav_order', 'meta_description',
    'created_at', 'updated_at'
  ],
  Navigation: ['nav_id', 'label', 'target', 'type', 'is_visible', 'sort_order'],
  MediaAssets: ['asset_id', 'public_id', 'url', 'label', 'tags', 'width', 'height', 'format', 'created_at']
};

const TEXT_COLS = {
  Products: ['id', 'name', 'description', 'category', 'images', 'status', 'status_locked', 'create_request_id', 'create_fingerprint', 'created_at', 'updated_at', 'featured', 'sku'],
  Orders: ['order_id', 'created_at', 'customer_name', 'customer_email', 'customer_phone', 'customer_address', 'items_json', 'status', 'paid_at', 'payment_email_sent', 'request_id', 'payment_state', 'payment_plan_json', 'order_customer_email_sent', 'order_owner_email_sent', 'payment_email_started_at', 'order_customer_email_started_at', 'order_owner_email_started_at', 'newsletter_opt_in', 'newsletter_date'],
  Customers: ['email', 'name', 'phone', 'address', 'newsletter_opt_in', 'newsletter_date', 'first_order_at', 'last_order_at', 'notes', 'tags'],
  Settings: ['value'],
  Categories: ['id', 'name', 'slug', 'description', 'image_url', 'is_active', 'updated_at'],
  HeroSettings: ['key', 'value'],
  CustomPages: ['page_id', 'slug', 'title', 'drive_file_id', 'file_name', 'is_active', 'show_in_nav', 'nav_label', 'meta_description', 'created_at', 'updated_at'],
  Navigation: ['nav_id', 'label', 'target', 'type', 'is_visible'],
  MediaAssets: ['asset_id', 'public_id', 'url', 'label', 'tags', 'format', 'created_at']
};

const PROTECTED_KEYS = ['admin_token_hash'];

const PUBLIC_KEYS = [
  'store_name', 'currency_symbol', 'brand_color', 'logo_url', 'banner_text', 'categories',
  'whatsapp_number', 'tagline', 'about_title', 'about_text', 'contact_phone',
  'contact_email', 'contact_address', 'opening_hours', 'instagram_url'
];

const EDITABLE_KEYS = PUBLIC_KEYS.concat([
  'owner_email', 'low_stock_threshold', 'dashboard_url', 'cloudinary_api_key', 'custom_pages_folder_id'
]);

const HERO_DEFAULTS = {
  image_url: '',
  public_id: '',
  alt_text: '',
  eyebrow: '',
  title: '',
  subtitle: '',
  cta_label: 'Shop now',
  cta_to: '/shop',
  secondary_label: '',
  secondary_to: '',
  crop_mode: 'fill',
  focal_point: 'center',
  focal_x: '50',
  focal_y: '50',
  zoom: '1',
  crop_x: '',
  crop_y: '',
  crop_w: '',
  crop_h: '',
  fit_desktop: 'cover',
  fit_tablet: 'cover',
  fit_mobile: 'cover',
  height_desktop: 'standard',
  height_tablet: 'standard',
  height_mobile: 'standard',
  overlay_opacity: '45',
  updated_at: ''
};

const DEFAULT_NAV_ITEMS = [
  { nav_id: 'home', label: 'Home', target: '/', type: 'builtin', is_visible: 'yes', sort_order: 10 },
  { nav_id: 'shop', label: 'Shop', target: '/shop', type: 'module:shop', is_visible: 'yes', sort_order: 20 },
  { nav_id: 'new-arrivals', label: 'New arrivals', target: '/new-arrivals', type: 'module:newArrivals', is_visible: 'yes', sort_order: 30 },
  { nav_id: 'categories', label: 'Categories', target: '/categories', type: 'module:categories', is_visible: 'yes', sort_order: 40 },
  { nav_id: 'best-sellers', label: 'Best sellers', target: '/best-sellers', type: 'module:bestSellers', is_visible: 'yes', sort_order: 50 },
  { nav_id: 'about', label: 'About', target: '/about', type: 'builtin', is_visible: 'yes', sort_order: 60 },
  { nav_id: 'contact', label: 'Contact', target: '/contact', type: 'builtin', is_visible: 'yes', sort_order: 70 }
];

const LIMITS = {
  name: 120,
  sku: 64,
  email: 254,
  phone: 30,
  address: 500,
  description: 2000,
  notes: 1000,
  tags: 200,
  items: 50,
  images: 8,
  stock: 1000000000,
  price: 1000000000000,
  csvRows: 500,
  htmlBytes: 1024 * 1024,
  slug: 100
};


// ---------- 2. SPREADSHEET & DRIVE HELPERS + ONE-TIME SETUP ----------

function getSpreadsheet_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getPagesFolder_() {
  const settings = getSettings();
  const configured = String(DRIVE_FOLDER_ID || settings.custom_pages_folder_id || '').trim();
  if (configured) {
    try {
      return DriveApp.getFolderById(configured);
    } catch (err) {
      throw new Error('Could not open Google Drive folder "' + configured + '". Check Drive permissions and folder ID.');
    }
  }
  const iter = DriveApp.getFoldersByName(CUSTOM_PAGES_FOLDER_NAME);
  if (iter.hasNext()) {
    const folder = iter.next();
    try { setSetting('custom_pages_folder_id', folder.getId()); } catch (e) {}
    return folder;
  }
  const created = DriveApp.createFolder(CUSTOM_PAGES_FOLDER_NAME);
  try { setSetting('custom_pages_folder_id', created.getId()); } catch (e) {}
  return created;
}

// Create missing tabs/columns without moving or overwriting existing client data.
function setupSheets() {
  const ss = getSpreadsheet_();

  Object.keys(TABS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const lastCol = Math.max(1, sh.getLastColumn());
    const existing = sh.getLastRow() > 0
      ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(Boolean)
      : [];

    if (!existing.length) {
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
    } else {
      const missing = TABS[name].filter(h => existing.indexOf(h) < 0);
      if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    }

    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    sh.setFrozenRows(1);

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
    ['cloudinary_api_key', ''],
    ['custom_pages_folder_id', ''],
    ['admin_token_hash', '']
  ];
  const current = getSettings();
  defaults.forEach(pair => {
    if (!Object.prototype.hasOwnProperty.call(current, pair[0])) setSetting(pair[0], pair[1]);
  });

  // Migration: normalise legacy local WhatsApp numbers.
  const savedWa = String(getSettings().whatsapp_number || '');
  if (savedWa && waDigits_(savedWa) !== savedWa) setSetting('whatsapp_number', waDigits_(savedWa));

  // Seed HeroSettings keys only when missing.
  const currentHero = getKvMap_('HeroSettings');
  Object.keys(HERO_DEFAULTS).forEach(k => {
    if (!Object.prototype.hasOwnProperty.call(currentHero, k)) setKv_('HeroSettings', k, HERO_DEFAULTS[k]);
  });

  // Seed Navigation items only when Navigation tab has no rows.
  if (readRows('Navigation').length === 0) {
    DEFAULT_NAV_ITEMS.forEach(item => appendObj('Navigation', item));
  }

  // Seed Categories tab from Settings.categories / existing products only when Categories tab is empty.
  if (readRows('Categories').length === 0) {
    const names = [];
    String(getSettings().categories || '').split(',').map(c => c.trim()).filter(Boolean).forEach(c => {
      if (names.indexOf(c) < 0) names.push(c);
    });
    readRows('Products').forEach(p => {
      const cat = String(p.category || '').trim();
      if (cat && names.indexOf(cat) < 0) names.push(cat);
    });
    const usedSlugs = Object.create(null);
    names.forEach((name, idx) => {
      let slug = slugify_(name) || 'category';
      let n = 2;
      while (usedSlugs[slug]) slug = (slugify_(name) || 'category') + '-' + (n++);
      usedSlugs[slug] = true;
      appendObj('Categories', {
        id: 'CAT-' + (idx + 1),
        name,
        slug,
        description: '',
        image_url: '',
        sort_order: (idx + 1) * 10,
        is_active: 'yes',
        updated_at: now()
      });
    });
  }

  // Remove Google's default empty Sheet1 only when empty.
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  invalidatePublicCache_();
  return { ok: true, version: BACKEND_VERSION, message: 'All 9 database tabs created or upgraded safely.' };
}

// Automatically clear public cache when the store owner edits Google Sheets directly (e.g. toggling page activation).
function onEdit(e) {
  try {
    const sh = e && e.range && e.range.getSheet ? e.range.getSheet() : null;
    const tab = sh ? sh.getName() : '';
    if (['Products', 'Settings', 'Categories', 'HeroSettings', 'CustomPages', 'Navigation'].indexOf(tab) >= 0) {
      invalidatePublicCache_();
    }
  } catch (err) { /* ignore non-critical onEdit cache flush */ }
}

// Set a new owner token here, run once, then remove the real token from the source code.
function setToken() {
  const NEW_TOKEN = 'REPLACE_WITH_A_RANDOM_TOKEN_OF_24_OR_MORE_CHARACTERS';
  if (NEW_TOKEN.indexOf('REPLACE_WITH_') === 0 || NEW_TOKEN.length < 24) {
    throw new Error('Edit NEW_TOKEN to a random secret of at least 24 characters before running setToken().');
  }
  setSetting('admin_token_hash', sha256(NEW_TOKEN));
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailySummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailySummary').timeBased().everyDays(1).atHour(18).nearMinute(30).inTimezone(TZ).create();
}


// ---------- 3. API ENTRY POINTS ----------

function doGet(e) {
  try {
    const param = (e && e.parameter) ? e.parameter : {};
    const action = String(param.action || '');
    if (action === 'products') return json(publicPayload_(false));
    if (action === 'storefront') return json(publicPayload_(true));
    if (action === 'page') return json(publicCustomPage_(param.slug));
    if (action === 'health') return json({ ok: true, version: BACKEND_VERSION, time: now() });
    return json({ ok: false, error: 'Unknown request' });
  } catch (err) {
    return json({ ok: false, error: safeError_(err) });
  }
}

function publicPayload_(withBestSellers) {
  const cache = CacheService.getScriptCache();
  const key = withBestSellers ? 'pub_storefront' : 'pub_products';
  const hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (err) { /* rebuild below */ }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let payload;
  try {
    recoverPreparedPayments_();
    const rawProducts = readRows('Products');
    const settings = publicSettings();
    const products = formatPublicProducts_(rawProducts);
    payload = {
      ok: true,
      products,
      settings
    };
    if (withBestSellers) {
      payload.bestSellers = bestSellers_(12, rawProducts);
      payload.hero = publicHeroSettings_();
      payload.categories = publicCategories_(rawProducts, settings);
      payload.customPages = publicCustomPagesList_();
      payload.navigation = publicNavigation_();
    }
    payload.generatedAt = now();
  } finally {
    lock.releaseLock();
  }

  try {
    const text = JSON.stringify(payload);
    if (text.length < 90000) cache.put(key, text, PUBLIC_CACHE_SECONDS);
  } catch (err) { /* cache is optional */ }
  return payload;
}

function invalidatePublicCache_() {
  const cache = CacheService.getScriptCache();
  cache.remove('pub_products');
  cache.remove('pub_storefront');
  try {
    readRows('CustomPages').forEach(p => {
      if (p.slug) cache.remove('pub_page_' + String(p.slug).toLowerCase());
    });
  } catch (err) { /* CustomPages tab may not exist on first setup */ }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Request body is missing.');
    const body = JSON.parse(e.postData.contents);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request body.');

    const action = String(body.action || '');
    if (action === 'placeOrder') return json(placeOrder(body));
    if (action === 'login') return json(login(body));

    const routes = {
      getDashboard, getOrders, markPaid, revertPaid, cancelOrder,
      getProducts, saveProduct, deleteProduct, importProductsCsv, assignProductImages,
      getCustomers, updateCustomer, adminGetSettings, saveSettings,
      retryReceipt, retryOrderEmails,
      getAdminWorkspace, getHeroSettings, saveHeroSettings,
      getCategories, saveCategory, deleteCategory,
      getCustomPages, saveCustomPage, toggleCustomPage, deleteCustomPage, getAdminPageContent,
      getNavigation, saveNavigation,
      getMediaAssets, registerMediaAsset, deleteMediaAsset,
      clearPublicCache
    };
    if (!Object.prototype.hasOwnProperty.call(routes, action)) throw new Error('Unknown action.');
    requireAuth(body.session);
    return json(routes[action](body));
  } catch (err) {
    return json({ ok: false, error: safeError_(err) });
  }
}


// ---------- 4. AUTHENTICATION ----------

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
  cache.put('sess_' + session, storedHash, 21600);
  return { ok: true, session };
}

function requireAuth(session) {
  const key = String(session || '');
  if (!key) throw new Error('Please log in again.');
  const cachedHash = CacheService.getScriptCache().get('sess_' + key);
  const activeHash = String(getSettings().admin_token_hash || '');
  if (!cachedHash || !activeHash || cachedHash !== activeHash) throw new Error('Please log in again.');
}


// ---------- 5. PUBLIC CATALOGUE, HERO, CATEGORIES & CUSTOM PAGES ----------

function formatPublicProducts_(rawRows) {
  const threshold = getThreshold_();
  return rawRows.map(p => ({
    id: String(p.id || ''),
    sku: String(p.sku || ''),
    name: String(p.name || ''),
    price: finiteNumber_(p.price, 0),
    description: String(p.description || ''),
    category: String(p.category || ''),
    images: splitImages(p.images),
    stock: Math.max(0, finiteNumber_(p.stock, 0)),
    created_at: String(p.created_at || ''),
    featured: String(p.featured || 'no') === 'yes',
    compare_at_price: Math.max(0, finiteNumber_(p.compare_at_price, 0)),
    status: finiteNumber_(p.stock, 0) <= 0
      ? 'Out of Stock'
      : (STATUSES.indexOf(String(p.status)) >= 0 ? String(p.status) : autoStatus(finiteNumber_(p.stock, 0), threshold))
  }));
}

function publicProducts() {
  return formatPublicProducts_(readRows('Products'));
}

function publicSettings() {
  const settings = getSettings();
  const out = {};
  PUBLIC_KEYS.forEach(k => out[k] = settings[k] || '');
  out.whatsapp_number = waDigits_(out.whatsapp_number);
  return out;
}

function bestSellers_(limit, rawProducts) {
  const units = Object.create(null);
  readRows('Orders').forEach(o => {
    if (o.status !== 'Paid') return;
    let items;
    try { items = aggregateSnapshotItems_(parseOrderItems_(o.items_json)); } catch (err) { return; }
    items.forEach(i => { units[i.id] = (units[i.id] || 0) + i.qty; });
  });
  const live = Object.create(null);
  (rawProducts || readRows('Products')).forEach(p => { live[String(p.id)] = true; });
  return Object.keys(units).filter(id => live[id])
    .sort((a, b) => units[b] - units[a] || a.localeCompare(b))
    .slice(0, limit)
    .map((id, index) => ({ id, rank: index + 1 }));
}

function publicHeroSettings_() {
  let raw = {};
  try { raw = getKvMap_('HeroSettings'); } catch (err) { raw = {}; }
  const out = Object.assign({}, HERO_DEFAULTS, raw);
  out.image_url = isHttpsUrl_(out.image_url) ? out.image_url : '';
  out.focal_x = clampNum_(out.focal_x, 0, 100, 50);
  out.focal_y = clampNum_(out.focal_y, 0, 100, 50);
  out.zoom = clampFloat_(out.zoom, 1, 2.5, 1);
  out.overlay_opacity = clampNum_(out.overlay_opacity, 0, 85, 45);
  return out;
}

function publicCategories_(rawProducts, settings) {
  let tabRows = [];
  try { tabRows = readRows('Categories'); } catch (err) { tabRows = []; }

  const activeMap = Object.create(null);
  const out = [];
  tabRows
    .slice()
    .sort((a, b) => finiteNumber_(a.sort_order, 999) - finiteNumber_(b.sort_order, 999) || String(a.name || '').localeCompare(String(b.name || '')))
    .forEach(c => {
      const name = String(c.name || '').trim();
      if (!name) return;
      activeMap[name.toLowerCase()] = c;
      if (!isTruthy_(c.is_active == null || c.is_active === '' ? 'yes' : c.is_active)) return;
      out.push({
        id: String(c.id || ''),
        name,
        slug: String(c.slug || slugify_(name) || 'category'),
        description: String(c.description || ''),
        image_url: isHttpsUrl_(c.image_url) ? String(c.image_url) : '',
        sort_order: finiteNumber_(c.sort_order, 100)
      });
    });

  // Also include Settings.categories or Product categories not yet added to Categories sheet.
  const extras = [];
  String((settings && settings.categories) || '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => extras.push(s));
  (rawProducts || []).forEach(p => {
    const c = String(p.category || '').trim();
    if (c) extras.push(c);
  });
  extras.forEach(name => {
    if (!activeMap[name.toLowerCase()]) {
      activeMap[name.toLowerCase()] = true;
      out.push({
        id: '',
        name,
        slug: slugify_(name) || 'category',
        description: '',
        image_url: '',
        sort_order: 999
      });
    }
  });
  return out;
}

function publicCustomPagesList_() {
  let rows = [];
  try { rows = readRows('CustomPages'); } catch (err) { return []; }
  return rows
    .filter(p => isTruthy_(p.is_active))
    .map(p => ({
      page_id: String(p.page_id || ''),
      slug: String(p.slug || ''),
      title: String(p.title || ''),
      show_in_nav: isTruthy_(p.show_in_nav),
      nav_label: String(p.nav_label || p.title || ''),
      nav_order: finiteNumber_(p.nav_order, 100),
      meta_description: String(p.meta_description || '')
    }))
    .sort((a, b) => a.nav_order - b.nav_order || a.title.localeCompare(b.title));
}

function publicCustomPage_(rawSlug) {
  const slug = normaliseSlug_(rawSlug);
  if (!slug) throw new Error('Page not found.');

  const cache = CacheService.getScriptCache();
  const cacheKey = 'pub_page_' + slug;
  const hit = cache.get(cacheKey);
  if (hit) {
    try { return JSON.parse(hit); } catch (err) { /* read fresh below */ }
  }

  let rows = [];
  try { rows = readRows('CustomPages'); } catch (err) { rows = []; }
  const row = rows.find(p => String(p.slug || '').toLowerCase() === slug);
  if (!row || !isTruthy_(row.is_active) || !row.drive_file_id) {
    return { ok: false, error: 'Page not found.' };
  }

  let html = '';
  try {
    const file = DriveApp.getFileById(String(row.drive_file_id));
    if (file.isTrashed && file.isTrashed()) throw new Error('File trashed');
    html = file.getBlob().getDataAsString('UTF-8');
  } catch (err) {
    return { ok: false, error: 'Custom page content is currently unavailable.' };
  }

  const payload = {
    ok: true,
    page: {
      page_id: String(row.page_id || ''),
      slug: String(row.slug || ''),
      title: String(row.title || ''),
      nav_label: String(row.nav_label || row.title || ''),
      meta_description: String(row.meta_description || ''),
      html,
      updated_at: String(row.updated_at || '')
    }
  };
  try {
    const serialized = JSON.stringify(payload);
    if (serialized.length < 90000) cache.put(cacheKey, serialized, PUBLIC_CACHE_SECONDS);
  } catch (err) { /* ignore oversized cache */ }
  return payload;
}

function publicNavigation_() {
  let rows = [];
  try { rows = readRows('Navigation'); } catch (err) { rows = []; }
  if (!rows.length) return DEFAULT_NAV_ITEMS.filter(n => isTruthy_(n.is_visible));
  return rows
    .filter(n => isTruthy_(n.is_visible))
    .map(n => ({
      nav_id: String(n.nav_id || ''),
      label: String(n.label || ''),
      target: String(n.target || '/'),
      type: String(n.type || 'builtin'),
      is_visible: 'yes',
      sort_order: finiteNumber_(n.sort_order, 100)
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

function waDigits_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  if (/^0\d{10}$/.test(digits)) digits = '234' + digits.slice(1);
  return digits;
}

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

function splitImages(v) {
  return String(v || '').split('|').filter(Boolean);
}


// ---------- 6. PUBLIC CHECKOUT ----------

function placeOrder(b) {
  const name = text_(b.name, LIMITS.name, 'Name', true);
  const email = text_(b.email, LIMITS.email, 'Email', true).toLowerCase();
  const phone = text_(b.phone, LIMITS.phone, 'Phone', true);
  const address = text_(b.address, LIMITS.address, 'Delivery address', true);
  const requestId = text_(b.request_id || Utilities.getUuid(), 100, 'Request ID', true);

  if (!isEmail_(email)) throw new Error('Please enter a valid email address.');
  const phoneDigits = phone.replace(/\D/g, '');
  if (!/^[+0-9()\-\s]{7,30}$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    throw new Error('Please enter a valid phone number with 7–15 digits.');
  }
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > LIMITS.items) {
    throw new Error('Your cart is empty or contains too many different products.');
  }
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) {
    throw new Error('The checkout session is invalid. Please refresh the page and try again.');
  }

  if (String(b.website || '').trim()) throw new Error('Unable to process this order.');
  const startedAt = Number(b.started_at || 0);
  if (startedAt) {
    const elapsed = Date.now() - startedAt;
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
    recoverPreparedPayments_();

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

      appendObj('Orders', order);
      order = readRows('Orders').find(o => String(o.request_id || '') === requestId);
      if (!order) throw new Error('Order could not be saved. Please try again.');
      rebuildCustomer_(email, order, false);
    }
  } finally {
    lock.releaseLock();
  }

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

function enforceOrderRateLimit_(email, phone) {
  const cache = CacheService.getScriptCache();
  const key = 'order_rate_' + sha256(email.toLowerCase() + '|' + phone.replace(/\D/g, '')).slice(0, 32);
  const count = Number(cache.get(key) || 0);
  if (count >= 5) throw new Error('Too many orders from these details in a short time. Please contact the store.');
  cache.put(key, String(count + 1), 600);
}

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

function safeOrderItems_(raw) {
  try { return parseOrderItems_(raw); } catch (err) { return []; }
}

function parseOrderItems_(raw) {
  let items;
  try { items = JSON.parse(String(raw || '[]')); } catch (err) { throw new Error('This order has damaged item data. Please inspect the Orders sheet.'); }
  if (!Array.isArray(items)) throw new Error('This order has invalid item data.');
  return items;
}

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


// ---------- 7. OWNER DASHBOARD READS ----------

function getDashboard() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    return buildDashboardSummary_(readRows('Orders'), readRows('Products'));
  } finally { lock.releaseLock(); }
}

function buildDashboardSummary_(orders, products) {
  const today = today_();
  const placedToday = orders.filter(o => String(o.created_at).indexOf(today) === 0);
  const paidToday = orders.filter(o => String(o.paid_at).indexOf(today) === 0);
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
}

function getOrders() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    return { ok: true, orders: formatAdminOrders_(readRows('Orders')) };
  } finally { lock.releaseLock(); }
}

function formatAdminOrders_(rows) {
  return rows.slice().reverse().map(o => ({
    order_id: String(o.order_id), created_at: String(o.created_at), customer_name: String(o.customer_name),
    customer_email: String(o.customer_email), customer_phone: String(o.customer_phone),
    customer_address: String(o.customer_address), items: safeOrderItems_(o.items_json),
    total: Number(o.total), status: String(o.status), paid_at: String(o.paid_at || ''),
    payment_email_sent: String(o.payment_email_sent || 'no'), payment_state: String(o.payment_state || ''),
    order_customer_email_sent: String(o.order_customer_email_sent || 'no'),
    order_owner_email_sent: String(o.order_owner_email_sent || 'no')
  }));
}

function getProducts() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    return { ok: true, products: formatAdminProducts_(readRows('Products')) };
  } finally { lock.releaseLock(); }
}

function formatAdminProducts_(rows) {
  return rows.map(p => ({
    id: String(p.id), sku: String(p.sku || ''), name: String(p.name), price: Number(p.price),
    description: String(p.description || ''), category: String(p.category || ''),
    images: splitImages(p.images), stock: Number(p.stock),
    status: Number(p.stock) <= 0 ? 'Out of Stock' : String(p.status),
    status_locked: String(p.status_locked || 'no'),
    featured: String(p.featured || 'no'),
    compare_at_price: Math.max(0, finiteNumber_(p.compare_at_price, 0)),
    created_at: String(p.created_at || ''), updated_at: String(p.updated_at || '')
  }));
}

function getCustomers() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    return { ok: true, customers: formatAdminCustomers_(readRows('Customers')) };
  } finally { lock.releaseLock(); }
}

function formatAdminCustomers_(rows) {
  return rows.slice().sort((a, b) => String(b.last_order_at).localeCompare(String(a.last_order_at))).map(c => ({
    email: String(c.email), name: String(c.name), phone: String(c.phone), address: String(c.address),
    newsletter_opt_in: String(c.newsletter_opt_in), newsletter_date: String(c.newsletter_date || ''),
    first_order_at: String(c.first_order_at || ''), last_order_at: String(c.last_order_at || ''),
    total_orders: Number(c.total_orders || 0), total_spent: Number(c.total_spent || 0),
    notes: String(c.notes || ''), tags: String(c.tags || '')
  }));
}

function adminGetSettings() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const settings = getSettings();
    PROTECTED_KEYS.forEach(k => delete settings[k]);
    return { ok: true, settings };
  } finally { lock.releaseLock(); }
}

// Single-roundtrip loader for admin.html to avoid redundant spreadsheet reads.
function getAdminWorkspace() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const rawOrders = readRows('Orders');
    const rawProducts = readRows('Products');
    const rawCustomers = readRows('Customers');
    const settings = getSettings();
    PROTECTED_KEYS.forEach(k => delete settings[k]);
    return {
      ok: true,
      version: BACKEND_VERSION,
      dashboard: buildDashboardSummary_(rawOrders, rawProducts),
      orders: formatAdminOrders_(rawOrders),
      products: formatAdminProducts_(rawProducts),
      customers: formatAdminCustomers_(rawCustomers),
      settings,
      hero: publicHeroSettings_(),
      categories: safeReadTabRows_('Categories').map(c => ({
        id: String(c.id || ''), name: String(c.name || ''), slug: String(c.slug || ''),
        description: String(c.description || ''), image_url: String(c.image_url || ''),
        sort_order: finiteNumber_(c.sort_order, 100),
        is_active: isTruthy_(c.is_active == null || c.is_active === '' ? 'yes' : c.is_active) ? 'yes' : 'no',
        updated_at: String(c.updated_at || '')
      })),
      customPages: safeReadTabRows_('CustomPages').map(p => ({
        page_id: String(p.page_id || ''), slug: String(p.slug || ''), title: String(p.title || ''),
        drive_file_id: String(p.drive_file_id || ''), file_name: String(p.file_name || ''),
        file_size: Number(p.file_size || 0),
        is_active: isTruthy_(p.is_active) ? 'yes' : 'no',
        show_in_nav: isTruthy_(p.show_in_nav) ? 'yes' : 'no',
        nav_label: String(p.nav_label || p.title || ''),
        nav_order: finiteNumber_(p.nav_order, 100),
        meta_description: String(p.meta_description || ''),
        created_at: String(p.created_at || ''), updated_at: String(p.updated_at || '')
      })),
      navigation: getAdminNavigationList_(),
      mediaAssets: buildMediaLibraryList_(rawProducts, settings)
    };
  } finally { lock.releaseLock(); }
}

function safeReadTabRows_(name) {
  try { return readRows(name); } catch (err) { return []; }
}

function clearPublicCache() {
  invalidatePublicCache_();
  return { ok: true };
}


// ---------- 8. PAYMENT TRANSACTIONS ----------

function markPaid(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let order;
  try {
    recoverPreparedPayments_();
    order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
    if (!order) throw new Error('Order not found.');

    if (order.status !== 'Paid') {
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

function recoverPreparedPayments_() {
  readRows('Orders').forEach(order => {
    if (order.payment_state === 'PREPARED') completePreparedPayment_(order);
    else if (order.payment_state === 'REVERTING') completePreparedRevert_(order);
  });
}

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
    if (left <= 0) update.status = 'Out of Stock';
    else if (product.status_locked !== 'yes') update.status = autoStatus(left, threshold);
    updateRow('Products', product._row, update);
  });

  const paidAt = String(order.paid_at || now());
  updateRow('Orders', order._row, { status: 'Paid', paid_at: paidAt });
  rebuildCustomer_(order.customer_email, order, false);
  updateRow('Orders', order._row, { payment_state: 'COMPLETE' });
  order.status = 'Paid';
  order.paid_at = paidAt;
  order.payment_state = 'COMPLETE';
}

function revertPaid(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
    if (!order) throw new Error('Order not found.');
    if (order.status !== 'Paid') throw new Error('Only paid orders can be undone.');
    if (order.payment_state && order.payment_state !== 'COMPLETE') throw new Error('This order is still being processed. Refresh and try again.');

    let paidPlan = [];
    try { paidPlan = JSON.parse(String(order.payment_plan_json || '[]')); } catch (err) { paidPlan = []; }
    const deductedById = Object.create(null);
    if (Array.isArray(paidPlan)) paidPlan.forEach(item => { if (Number.isSafeInteger(Number(item.deducted))) deductedById[String(item.id)] = Number(item.deducted); });

    const products = readRows('Products');
    const plan = [];
    aggregateSnapshotItems_(parseOrderItems_(order.items_json)).forEach(item => {
      const product = products.find(p => String(p.id) === item.id);
      if (!product) return;
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

  updateRow('Orders', order._row, {
    status: 'Pending', paid_at: '', payment_email_sent: 'no', payment_email_started_at: '',
    payment_plan_json: '', payment_state: ''
  });
  rebuildCustomer_(order.customer_email, order, false);
  invalidatePublicCache_();
}

function sendReceiptIfNeeded_(order) {
  if (!order || order.status !== 'Paid') return { sent: false, inProgress: false };
  const receiptSettings = getSettings();
  return sendEmailOnce_(order.order_id, 'payment_email_sent', 'payment_email_started_at',
    order.customer_email, 'Receipt for order ' + order.order_id,
    emailShell(receiptSettings, 'Payment confirmed',
      '<p>Hi ' + esc(order.customer_name) + ', we have received your payment. Here is your receipt.</p>' +
      '<p><b>Order:</b> ' + esc(order.order_id) + '<br><b>Paid on:</b> ' + esc(order.paid_at) + '<br><b>Delivery to:</b> ' + esc(order.customer_address) + '</p>' +
      itemsTable(parseOrderItems_(order.items_json), order.total, receiptSettings) +
      '<p>Thank you for shopping with ' + esc(receiptSettings.store_name) + '!</p>'));
}

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

    const claim = {};
    claim[stateField] = 'SENDING';
    claim[startedField] = String(Date.now());
    updateRow('Orders', order._row, claim);
  } finally {
    lock.releaseLock();
  }

  const sent = sendMail(recipient, subject, html, getSettings());

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

function retryReceipt(b) {
  const order = readRows('Orders').find(o => String(o.order_id) === String(b.orderId));
  if (!order) throw new Error('Order not found.');
  if (order.status !== 'Paid' || (order.payment_state && order.payment_state !== 'COMPLETE')) throw new Error('Only fully paid orders can receive a payment receipt.');
  const result = sendReceiptIfNeeded_(order);
  return { ok: true, receiptSent: result.sent, receiptInProgress: result.inProgress === true };
}

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


// ---------- 9. PRODUCT MANAGEMENT, CSV BULK IMPORT & IMAGE ASSIGNMENT ----------

function saveProduct(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const p = b.product || {};
    const name = text_(p.name, LIMITS.name, 'Product name', true);
    const sku = text_(p.sku, LIMITS.sku, 'SKU', false);
    const price = wholeNumber_(p.price, 1, LIMITS.price, 'Price');
    let stock = wholeNumber_(p.stock, 0, LIMITS.stock, 'Stock');
    const description = text_(p.description, LIMITS.description, 'Description', false);
    const category = text_(p.category, 80, 'Category', false);
    const images = validateImages_(p.images);
    const locked = p.status_locked === true || p.status_locked === 'yes';
    const selectedStatus = String(p.status || 'In Stock');
    if (locked && STATUSES.indexOf(selectedStatus) < 0) throw new Error('Choose a valid manual status.');
    if (locked && stock === 0 && selectedStatus !== 'Out of Stock') throw new Error('A product with zero stock must be marked Out of Stock.');

    const compareRaw = p.compare_at_price === '' || p.compare_at_price == null ? 0 : wholeNumber_(p.compare_at_price, 0, LIMITS.price, 'Original price');
    if (compareRaw > 0 && compareRaw <= price) throw new Error('Original price must be higher than the selling price, or left blank.');
    const featured = (p.featured === true || p.featured === 'yes') ? 'yes' : 'no';

    const existingRows = readRows('Products');
    if (sku) {
      const skuCollision = existingRows.find(row => String(row.sku || '').toLowerCase() === sku.toLowerCase() && String(row.id) !== String(p.id || ''));
      if (skuCollision) throw new Error('SKU "' + sku + '" is already assigned to another product (' + skuCollision.name + ').');
    }

    const record = {
      name,
      sku,
      price,
      description,
      category,
      images: images.join('|'),
      stock,
      status_locked: locked ? 'yes' : 'no',
      featured,
      compare_at_price: compareRaw
    };

    if (p.id) {
      const matches = existingRows.filter(row => String(row.id) === String(p.id));
      if (matches.length !== 1) throw new Error(matches.length ? 'This product ID is duplicated.' : 'Product not found.');
      const current = matches[0];

      if (p.stock_loaded !== undefined && p.stock_loaded !== '') {
        const loadedStock = wholeNumber_(p.stock_loaded, 0, LIMITS.stock, 'Loaded stock');
        if (stock === loadedStock) stock = Number(current.stock);
        else if (Number(current.stock) !== loadedStock) {
          throw new Error('Stock changed while you were editing (it is now ' + Number(current.stock) + '). Please reopen the product and try again.');
        }
      }

      record.stock = stock;
      record.status = stock <= 0 ? 'Out of Stock' : (locked ? selectedStatus : autoStatus(stock, getThreshold_()));
      record.updated_at = now();
      updateRow('Products', current._row, record);
      registerImageUrlsQuietly_(images);
      return { ok: true, id: String(p.id) };
    }

    record.status = stock <= 0 ? 'Out of Stock' : (locked ? selectedStatus : autoStatus(stock, getThreshold_()));
    const requestId = text_(p.request_id, 100, 'Product request ID', true);
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error('The product save session is invalid. Please reopen the form and try again.');
    const fingerprint = sha256(JSON.stringify(record));
    const prior = existingRows.find(row => String(row.create_request_id || '') === requestId);
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
    registerImageUrlsQuietly_(images);
    return { ok: true, id: record.id, repeatedRequest: false };
  } finally {
    lock.releaseLock();
  }
}

// Bulk CSV import: creates new products and updates existing ones by id or sku without duplicates.
function importProductsCsv(b) {
  const rows = b && Array.isArray(b.rows) ? b.rows : null;
  if (!rows || !rows.length) throw new Error('No product rows to import.');
  if (rows.length > LIMITS.csvRows) throw new Error('Import at most ' + LIMITS.csvRows + ' products per upload.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const existing = readRows('Products');
    const byId = Object.create(null);
    const bySku = Object.create(null);
    existing.forEach(p => {
      if (p.id) byId[String(p.id).trim()] = p;
      if (p.sku) bySku[String(p.sku).trim().toLowerCase()] = p;
    });

    // Validate full batch before writing any rows to prevent partial corrupt imports.
    const seenIds = Object.create(null);
    const seenSkus = Object.create(null);
    const threshold = getThreshold_();
    const prepared = [];

    rows.forEach((raw, idx) => {
      const rowNum = idx + 1;
      if (!raw || typeof raw !== 'object') throw new Error('CSV row ' + rowNum + ' is invalid.');
      const incomingId = text_(raw.id, 80, 'Row ' + rowNum + ' ID', false);
      const sku = text_(raw.sku, LIMITS.sku, 'Row ' + rowNum + ' SKU', false);
      if (incomingId) {
        if (seenIds[incomingId]) throw new Error('Duplicate Product ID "' + incomingId + '" in CSV row ' + rowNum + '.');
        seenIds[incomingId] = true;
      }
      if (sku) {
        const skuKey = sku.toLowerCase();
        if (seenSkus[skuKey]) throw new Error('Duplicate SKU "' + sku + '" in CSV row ' + rowNum + '.');
        seenSkus[skuKey] = true;
      }

      const name = text_(raw.name, LIMITS.name, 'Row ' + rowNum + ' Product name', true);
      const price = wholeNumber_(raw.price, 1, LIMITS.price, 'Row ' + rowNum + ' Price');
      const stock = wholeNumber_(raw.stock, 0, LIMITS.stock, 'Row ' + rowNum + ' Stock');
      const description = text_(raw.description, LIMITS.description, 'Row ' + rowNum + ' Description', false);
      const category = text_(raw.category, 80, 'Row ' + rowNum + ' Category', false);
      const compareRaw = raw.compare_at_price === '' || raw.compare_at_price == null
        ? 0
        : wholeNumber_(raw.compare_at_price, 0, LIMITS.price, 'Row ' + rowNum + ' Original price');
      if (compareRaw > 0 && compareRaw <= price) {
        throw new Error('Row ' + rowNum + ': Original / compare-at price (' + compareRaw + ') must be higher than selling price (' + price + ').');
      }

      const locked = raw.status_locked === true || raw.status_locked === 'yes';
      let selectedStatus = String(raw.status || '').trim();
      if (selectedStatus) {
        const matchedStatus = STATUSES.find(s => s.toLowerCase() === selectedStatus.toLowerCase());
        if (!matchedStatus) throw new Error('Row ' + rowNum + ': Invalid status "' + selectedStatus + '". Use In Stock, Few Left, or Out of Stock.');
        selectedStatus = matchedStatus;
      }
      if (locked && stock === 0 && selectedStatus !== 'Out of Stock') {
        throw new Error('Row ' + rowNum + ': Zero-stock product cannot be locked as "' + selectedStatus + '".');
      }

      const featured = (raw.featured === true || String(raw.featured || '').toLowerCase() === 'yes' || String(raw.featured || '').toLowerCase() === 'true') ? 'yes' : 'no';
      const images = raw.images !== undefined ? validateImages_(Array.isArray(raw.images) ? raw.images : splitImages(raw.images)) : null;

      let match = incomingId && byId[incomingId] ? byId[incomingId] : null;
      if (!match && sku && bySku[sku.toLowerCase()]) match = bySku[sku.toLowerCase()];

      // Prevent SKU clash with a different existing product if updating by ID.
      if (match && sku && bySku[sku.toLowerCase()] && bySku[sku.toLowerCase()].id !== match.id) {
        throw new Error('Row ' + rowNum + ': SKU "' + sku + '" belongs to another product.');
      }

      const status = stock <= 0
        ? 'Out of Stock'
        : (locked && selectedStatus ? selectedStatus : (selectedStatus || autoStatus(stock, threshold)));

      prepared.push({
        match,
        incomingId,
        record: {
          name,
          sku,
          price,
          description,
          category,
          stock,
          status,
          status_locked: locked ? 'yes' : (selectedStatus && selectedStatus !== autoStatus(stock, threshold) ? 'yes' : 'no'),
          featured,
          compare_at_price: compareRaw
        },
        images
      });
    });

    let created = 0;
    let updated = 0;
    const ids = [];
    const stamp = now();

    prepared.forEach(item => {
      if (item.match) {
        const patch = Object.assign({}, item.record, { updated_at: stamp });
        if (item.images !== null) patch.images = item.images.join('|');
        updateRow('Products', item.match._row, patch);
        updated += 1;
        ids.push(String(item.match.id));
      } else {
        const newId = (item.incomingId && /^[A-Za-z0-9_-]{2,64}$/.test(item.incomingId) && !byId[item.incomingId])
          ? item.incomingId
          : makeProductId_(byId);
        const rec = Object.assign({}, item.record, {
          id: newId,
          images: (item.images || []).join('|'),
          create_request_id: '',
          create_fingerprint: '',
          created_at: stamp,
          updated_at: stamp
        });
        appendObj('Products', rec);
        byId[newId] = Object.assign({ _row: -1 }, rec);
        if (rec.sku) bySku[rec.sku.toLowerCase()] = byId[newId];
        created += 1;
        ids.push(newId);
      }
    });

    invalidatePublicCache_();
    return { ok: true, created, updated, ids };
  } finally {
    lock.releaseLock();
  }
}

// Batch-assign uploaded Cloudinary images to products (by productId or sku).
function assignProductImages(b) {
  const assignments = b && Array.isArray(b.assignments) ? b.assignments : null;
  if (!assignments || !assignments.length) throw new Error('No product image assignments supplied.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recoverPreparedPayments_();
    const products = readRows('Products');
    let updated = 0;

    assignments.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object') throw new Error('Invalid assignment at position ' + (idx + 1) + '.');
      const pid = String(entry.productId || '').trim();
      const sku = String(entry.sku || '').trim().toLowerCase();
      const target = products.find(p => (pid && String(p.id) === pid) || (sku && String(p.sku || '').toLowerCase() === sku));
      if (!target) throw new Error('Could not find target product for assignment #' + (idx + 1) + '.');

      const incoming = validateImages_(entry.images);
      const mode = entry.mode === 'replace' ? 'replace' : 'append';
      const currentImgs = mode === 'replace' ? [] : splitImages(target.images);
      const merged = currentImgs.slice();
      incoming.forEach(url => {
        if (merged.indexOf(url) < 0 && merged.length < LIMITS.images) merged.push(url);
      });
      if (merged.length > LIMITS.images) throw new Error('A product cannot have more than ' + LIMITS.images + ' images.');

      updateRow('Products', target._row, { images: merged.join('|'), updated_at: now() });
      target.images = merged.join('|');
      registerImageUrlsQuietly_(incoming);
      updated += 1;
    });

    invalidatePublicCache_();
    return { ok: true, updated };
  } finally {
    lock.releaseLock();
  }
}

function makeProductId_(usedMap) {
  const used = usedMap || readRows('Products').reduce((acc, p) => { acc[String(p.id)] = true; return acc; }, Object.create(null));
  for (let i = 0; i < 8; i++) {
    const id = 'P' + Date.now() + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
    if (!used[id]) return id;
  }
  throw new Error('Could not generate a unique product ID. Please try again.');
}

function validateImages_(images) {
  if (images == null) return [];
  if (!Array.isArray(images) || images.length > LIMITS.images) throw new Error('Upload no more than ' + LIMITS.images + ' product images.');
  return images.map(url => {
    const value = text_(url, 1000, 'Image URL', true);
    if (value.indexOf('|') >= 0 || !isHttpsUrl_(value)) throw new Error('Every product image must be a valid HTTPS URL.');
    return value;
  });
}

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


// ---------- 10. HERO, CATEGORIES, CUSTOM PAGES, NAVIGATION & MEDIA ----------

function getHeroSettings() {
  return { ok: true, hero: publicHeroSettings_() };
}

function saveHeroSettings(b) {
  const h = b && b.hero && typeof b.hero === 'object' ? b.hero : null;
  if (!h) throw new Error('Hero settings payload is missing.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cleanUrl = String(h.image_url || '').trim();
    if (cleanUrl && !isHttpsUrl_(cleanUrl)) throw new Error('Hero image URL must be a valid HTTPS URL.');
    const cropMode = ['fill', 'crop', 'fit', 'pad'].indexOf(String(h.crop_mode || 'fill')) >= 0 ? String(h.crop_mode || 'fill') : 'fill';
    const focalPoint = ['auto', 'center', 'faces', 'north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west', 'custom'].indexOf(String(h.focal_point || 'center')) >= 0 ? String(h.focal_point || 'center') : 'center';
    const validFit = v => ['cover', 'contain'].indexOf(String(v || 'cover')) >= 0 ? String(v || 'cover') : 'cover';
    const validHeight = v => ['compact', 'standard', 'tall'].indexOf(String(v || 'standard')) >= 0 ? String(v || 'standard') : 'standard';

    const next = {
      image_url: cleanUrl,
      public_id: text_(h.public_id, 300, 'Public ID', false),
      alt_text: text_(h.alt_text, 200, 'Alt text', false),
      eyebrow: text_(h.eyebrow, 80, 'Hero eyebrow', false),
      title: text_(h.title, 120, 'Hero title', false),
      subtitle: text_(h.subtitle, 300, 'Hero subtitle', false),
      cta_label: text_(h.cta_label, 60, 'Primary button label', false),
      cta_to: text_(h.cta_to, 200, 'Primary button link', false) || '/shop',
      secondary_label: text_(h.secondary_label, 60, 'Secondary button label', false),
      secondary_to: text_(h.secondary_to, 200, 'Secondary button link', false),
      crop_mode: cropMode,
      focal_point: focalPoint,
      focal_x: String(clampNum_(h.focal_x, 0, 100, 50)),
      focal_y: String(clampNum_(h.focal_y, 0, 100, 50)),
      zoom: String(clampFloat_(h.zoom, 1, 2.5, 1)),
      crop_x: h.crop_x === '' || h.crop_x == null ? '' : String(clampNum_(h.crop_x, 0, 100, 0)),
      crop_y: h.crop_y === '' || h.crop_y == null ? '' : String(clampNum_(h.crop_y, 0, 100, 0)),
      crop_w: h.crop_w === '' || h.crop_w == null ? '' : String(clampNum_(h.crop_w, 1, 100, 100)),
      crop_h: h.crop_h === '' || h.crop_h == null ? '' : String(clampNum_(h.crop_h, 1, 100, 100)),
      fit_desktop: validFit(h.fit_desktop),
      fit_tablet: validFit(h.fit_tablet),
      fit_mobile: validFit(h.fit_mobile),
      height_desktop: validHeight(h.height_desktop),
      height_tablet: validHeight(h.height_tablet),
      height_mobile: validHeight(h.height_mobile),
      overlay_opacity: String(clampNum_(h.overlay_opacity, 0, 85, 45)),
      updated_at: now()
    };

    Object.keys(next).forEach(k => setKv_('HeroSettings', k, next[k]));
    if (cleanUrl) registerImageUrlsQuietly_([cleanUrl], next.public_id, 'Hero banner');
    invalidatePublicCache_();
    return { ok: true, hero: publicHeroSettings_() };
  } finally {
    lock.releaseLock();
  }
}

function getCategories() {
  const rows = safeReadTabRows_('Categories').map(c => ({
    id: String(c.id || ''), name: String(c.name || ''), slug: String(c.slug || ''),
    description: String(c.description || ''), image_url: String(c.image_url || ''),
    sort_order: finiteNumber_(c.sort_order, 100),
    is_active: isTruthy_(c.is_active == null || c.is_active === '' ? 'yes' : c.is_active) ? 'yes' : 'no',
    updated_at: String(c.updated_at || '')
  }));
  return { ok: true, categories: rows };
}

function saveCategory(b) {
  const c = b && b.category && typeof b.category === 'object' ? b.category : null;
  if (!c) throw new Error('Category payload is missing.');
  const name = text_(c.name, 80, 'Category name', true);
  const slug = normaliseSlug_(c.slug || name);
  if (!slug) throw new Error('Category slug is invalid.');
  const img = String(c.image_url || '').trim();
  if (img && !isHttpsUrl_(img)) throw new Error('Category image must be a valid HTTPS URL.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureTab_('Categories');
    const rows = readRows('Categories');
    const collision = rows.find(r => (String(r.slug).toLowerCase() === slug || String(r.name).toLowerCase() === name.toLowerCase()) && String(r.id) !== String(c.id || ''));
    if (collision) throw new Error('Another category already uses this name or slug.');

    const rec = {
      name,
      slug,
      description: text_(c.description, 400, 'Description', false),
      image_url: img,
      sort_order: wholeNumber_(c.sort_order == null || c.sort_order === '' ? 100 : c.sort_order, 0, 100000, 'Sort order'),
      is_active: isTruthy_(c.is_active == null ? 'yes' : c.is_active) ? 'yes' : 'no',
      updated_at: now()
    };

    if (c.id) {
      const target = rows.find(r => String(r.id) === String(c.id));
      if (!target) throw new Error('Category not found.');
      updateRow('Categories', target._row, rec);
      if (img) registerImageUrlsQuietly_([img], '', 'Category: ' + name);
      invalidatePublicCache_();
      return { ok: true, id: String(target.id) };
    }

    const newId = 'CAT-' + Date.now() + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    appendObj('Categories', Object.assign({ id: newId }, rec));
    if (img) registerImageUrlsQuietly_([img], '', 'Category: ' + name);
    invalidatePublicCache_();
    return { ok: true, id: newId };
  } finally {
    lock.releaseLock();
  }
}

function deleteCategory(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = String((b && b.id) || '');
    const row = readRows('Categories').find(c => String(c.id) === id);
    if (!row) throw new Error('Category not found.');
    sheet('Categories').deleteRow(row._row);
    invalidatePublicCache_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getCustomPages() {
  return {
    ok: true,
    pages: safeReadTabRows_('CustomPages').map(p => ({
      page_id: String(p.page_id || ''), slug: String(p.slug || ''), title: String(p.title || ''),
      drive_file_id: String(p.drive_file_id || ''), file_name: String(p.file_name || ''),
      file_size: Number(p.file_size || 0),
      is_active: isTruthy_(p.is_active) ? 'yes' : 'no',
      show_in_nav: isTruthy_(p.show_in_nav) ? 'yes' : 'no',
      nav_label: String(p.nav_label || p.title || ''),
      nav_order: finiteNumber_(p.nav_order, 100),
      meta_description: String(p.meta_description || ''),
      created_at: String(p.created_at || ''), updated_at: String(p.updated_at || '')
    }))
  };
}

function saveCustomPage(b) {
  const p = b && b.page && typeof b.page === 'object' ? b.page : null;
  if (!p) throw new Error('Custom page payload is missing.');

  const title = text_(p.title, 120, 'Page title', true);
  const slug = normaliseSlug_(p.slug || title);
  if (!slug || !/^[a-z0-9-]{1,100}$/.test(slug)) throw new Error('URL slug must contain letters, numbers, or hyphens.');
  if (RESERVED_PAGE_SLUGS.indexOf(slug) >= 0) throw new Error('Slug "' + slug + '" is reserved for a built-in storefront route.');

  const hasHtml = typeof p.html_content === 'string' && p.html_content.trim().length > 0;
  if (hasHtml) {
    if (p.html_content.length > LIMITS.htmlBytes) throw new Error('HTML file exceeds the 1 MB size limit.');
    if (!/[<>]/.test(p.html_content)) throw new Error('Uploaded file does not appear to contain valid HTML markup.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureTab_('CustomPages');
    const rows = readRows('CustomPages');
    const slugMatch = rows.find(r => String(r.slug || '').toLowerCase() === slug && String(r.page_id) !== String(p.page_id || ''));
    if (slugMatch) throw new Error('Another custom page already uses the slug "' + slug + '".');

    const isActive = isTruthy_(p.is_active) ? 'yes' : 'no';
    const showInNav = isTruthy_(p.show_in_nav) ? 'yes' : 'no';
    const navLabel = text_(p.nav_label || title, 60, 'Navigation label', true);
    const navOrder = wholeNumber_(p.nav_order == null || p.nav_order === '' ? 100 : p.nav_order, 0, 10000, 'Navigation order');
    const metaDesc = text_(p.meta_description, 300, 'Meta description', false);
    const fileName = sanitizeHtmlFilename_(p.file_name || (slug + '.html'));
    const stamp = now();

    if (p.page_id) {
      const target = rows.find(r => String(r.page_id) === String(p.page_id));
      if (!target) throw new Error('Custom page not found.');
      let driveFileId = String(target.drive_file_id || '');
      let storedFileName = String(target.file_name || fileName);
      let fileSize = Number(target.file_size || 0);

      if (hasHtml) {
        if (driveFileId) {
          try {
            const file = DriveApp.getFileById(driveFileId);
            file.setContent(p.html_content);
            file.setName(fileName);
            storedFileName = fileName;
            fileSize = p.html_content.length;
          } catch (err) {
            const created = getPagesFolder_().createFile(fileName, p.html_content, MimeType.HTML);
            driveFileId = created.getId();
            storedFileName = fileName;
            fileSize = p.html_content.length;
          }
        } else {
          const created = getPagesFolder_().createFile(fileName, p.html_content, MimeType.HTML);
          driveFileId = created.getId();
          storedFileName = fileName;
          fileSize = p.html_content.length;
        }
      } else if (!driveFileId) {
        throw new Error('Upload an HTML file for this custom page.');
      }

      updateRow('CustomPages', target._row, {
        slug,
        title,
        drive_file_id: driveFileId,
        file_name: storedFileName,
        file_size: fileSize,
        is_active: isActive,
        show_in_nav: showInNav,
        nav_label: navLabel,
        nav_order: navOrder,
        meta_description: metaDesc,
        updated_at: stamp
      });
      invalidatePublicCache_();
      return { ok: true, page_id: String(target.page_id), slug, drive_file_id: driveFileId };
    }

    if (!hasHtml) throw new Error('Please upload an HTML file before creating a custom page.');
    const folder = getPagesFolder_();
    const createdFile = folder.createFile(fileName, p.html_content, MimeType.HTML);
    const pageId = 'PAGE-' + Date.now() + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    appendObj('CustomPages', {
      page_id: pageId,
      slug,
      title,
      drive_file_id: createdFile.getId(),
      file_name: fileName,
      file_size: p.html_content.length,
      is_active: isActive,
      show_in_nav: showInNav,
      nav_label: navLabel,
      nav_order: navOrder,
      meta_description: metaDesc,
      created_at: stamp,
      updated_at: stamp
    });
    invalidatePublicCache_();
    return { ok: true, page_id: pageId, slug, drive_file_id: createdFile.getId() };
  } finally {
    lock.releaseLock();
  }
}

function toggleCustomPage(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = String((b && b.page_id) || '');
    const row = readRows('CustomPages').find(r => String(r.page_id) === id);
    if (!row) throw new Error('Custom page not found.');
    const patch = { updated_at: now() };
    if (b.is_active !== undefined) patch.is_active = isTruthy_(b.is_active) ? 'yes' : 'no';
    if (b.show_in_nav !== undefined) patch.show_in_nav = isTruthy_(b.show_in_nav) ? 'yes' : 'no';
    updateRow('CustomPages', row._row, patch);
    invalidatePublicCache_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deleteCustomPage(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = String((b && b.page_id) || '');
    const row = readRows('CustomPages').find(r => String(r.page_id) === id);
    if (!row) throw new Error('Custom page not found.');
    if (row.drive_file_id) {
      try { DriveApp.getFileById(String(row.drive_file_id)).setTrashed(true); } catch (err) { /* file may already be gone */ }
    }
    sheet('CustomPages').deleteRow(row._row);
    invalidatePublicCache_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getAdminPageContent(b) {
  const id = String((b && b.page_id) || '');
  const row = readRows('CustomPages').find(r => String(r.page_id) === id);
  if (!row || !row.drive_file_id) throw new Error('Custom page or Drive file not found.');
  const html = DriveApp.getFileById(String(row.drive_file_id)).getBlob().getDataAsString('UTF-8');
  return { ok: true, slug: String(row.slug), title: String(row.title), html };
}

function getAdminNavigationList_() {
  const rows = safeReadTabRows_('Navigation');
  if (!rows.length) return DEFAULT_NAV_ITEMS.slice();
  return rows.map(n => ({
    nav_id: String(n.nav_id || ''), label: String(n.label || ''),
    target: String(n.target || '/'), type: String(n.type || 'builtin'),
    is_visible: isTruthy_(n.is_visible) ? 'yes' : 'no',
    sort_order: finiteNumber_(n.sort_order, 100)
  })).sort((a, b) => a.sort_order - b.sort_order);
}

function getNavigation() {
  return { ok: true, navigation: getAdminNavigationList_() };
}

function saveNavigation(b) {
  const items = b && Array.isArray(b.navigation) ? b.navigation : null;
  if (!items || !items.length) throw new Error('Navigation items missing.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureTab_('Navigation');
    const existing = readRows('Navigation');
    items.forEach(item => {
      const navId = text_(item.nav_id, 60, 'Nav ID', true);
      const label = text_(item.label, 60, 'Nav label', true);
      const target = text_(item.target, 200, 'Nav target', true);
      const type = text_(item.type || 'builtin', 60, 'Nav type', false);
      const visible = isTruthy_(item.is_visible) ? 'yes' : 'no';
      const order = wholeNumber_(item.sort_order == null ? 100 : item.sort_order, 0, 10000, 'Sort order');

      const row = existing.find(r => String(r.nav_id) === navId);
      if (row) {
        updateRow('Navigation', row._row, { label, target, type, is_visible: visible, sort_order: order });
      } else {
        appendObj('Navigation', { nav_id: navId, label, target, type, is_visible: visible, sort_order: order });
      }
    });
    invalidatePublicCache_();
    return { ok: true, navigation: getAdminNavigationList_() };
  } finally {
    lock.releaseLock();
  }
}

function buildMediaLibraryList_(rawProducts, settings) {
  const byUrl = Object.create(null);
  const out = [];
  const pushAsset = (a) => {
    const url = String(a.url || '').trim();
    if (!isHttpsUrl_(url) || byUrl[url]) return;
    byUrl[url] = true;
    out.push({
      asset_id: String(a.asset_id || ''),
      public_id: String(a.public_id || extractPublicId_(url)),
      url,
      label: String(a.label || extractPublicId_(url) || 'Cloudinary asset'),
      tags: String(a.tags || ''),
      width: Number(a.width || 0),
      height: Number(a.height || 0),
      format: String(a.format || ''),
      created_at: String(a.created_at || '')
    });
  };

  safeReadTabRows_('MediaAssets').slice().reverse().forEach(pushAsset);
  const hero = publicHeroSettings_();
  if (hero.image_url) pushAsset({ url: hero.image_url, public_id: hero.public_id, label: 'Current hero image', tags: 'hero' });
  safeReadTabRows_('Categories').forEach(c => {
    if (c.image_url) pushAsset({ url: c.image_url, label: 'Category: ' + c.name, tags: 'category' });
  });
  (rawProducts || safeReadTabRows_('Products')).forEach(p => {
    splitImages(p.images).forEach((u, idx) => pushAsset({ url: u, label: String(p.name || 'Product') + (idx ? ' #' + (idx + 1) : ''), tags: 'product' }));
  });
  if (settings && settings.logo_url) pushAsset({ url: settings.logo_url, label: 'Store logo', tags: 'logo' });
  return out;
}

function getMediaAssets() {
  return { ok: true, assets: buildMediaLibraryList_(safeReadTabRows_('Products'), getSettings()) };
}

function registerMediaAsset(b) {
  const a = b && b.asset && typeof b.asset === 'object' ? b.asset : null;
  if (!a || !isHttpsUrl_(String(a.url || '').trim())) throw new Error('Valid HTTPS image URL is required.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureTab_('MediaAssets');
    const url = String(a.url).trim();
    const existing = readRows('MediaAssets').find(r => String(r.url) === url);
    if (existing) return { ok: true, asset_id: String(existing.asset_id), duplicate: true };
    const assetId = 'AST-' + Date.now() + Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
    appendObj('MediaAssets', {
      asset_id: assetId,
      public_id: text_(a.public_id || extractPublicId_(url), 300, 'Public ID', false),
      url,
      label: text_(a.label || 'Uploaded asset', 120, 'Label', false),
      tags: text_(a.tags || '', 200, 'Tags', false),
      width: Number(a.width || 0) || 0,
      height: Number(a.height || 0) || 0,
      format: text_(a.format || '', 20, 'Format', false),
      created_at: now()
    });
    return { ok: true, asset_id: assetId };
  } finally {
    lock.releaseLock();
  }
}

function deleteMediaAsset(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = String((b && b.asset_id) || '');
    const row = readRows('MediaAssets').find(r => String(r.asset_id) === id);
    if (!row) throw new Error('Media record not found.');
    sheet('MediaAssets').deleteRow(row._row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function registerImageUrlsQuietly_(urls, publicId, label) {
  try {
    ensureTab_('MediaAssets');
    const existing = readRows('MediaAssets');
    (urls || []).forEach(url => {
      if (!isHttpsUrl_(url)) return;
      if (existing.some(r => String(r.url) === url)) return;
      appendObj('MediaAssets', {
        asset_id: 'AST-' + Date.now() + Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase(),
        public_id: publicId || extractPublicId_(url),
        url,
        label: label || extractPublicId_(url) || 'Image',
        tags: '',
        width: 0,
        height: 0,
        format: '',
        created_at: now()
      });
    });
  } catch (err) { /* non-blocking media registry */ }
}

function extractPublicId_(url) {
  const m = /\/image\/upload\/(?:[^/]+\/)*v\d+\/(.+?)(?:\.[a-z0-9]+)?$/i.exec(String(url || ''));
  return m ? m[1] : '';
}


// ---------- 11. SETTINGS ----------

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
  if (String(s.cloudinary_api_key || '').length > 80 || String(s.custom_pages_folder_id || '').length > 120) throw new Error('Cloudinary API key or Drive folder ID is too long.');
}

function getThreshold_() {
  const value = Number(getSettings().low_stock_threshold);
  return Number.isSafeInteger(value) && value >= 0 ? value : 5;
}


// ---------- 12. EMAILS ----------

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

function mailReceipt(order, settings) {
  const items = parseOrderItems_(order.items_json);
  const html = emailShell(settings, 'Payment confirmed',
    '<p>Hi ' + esc(order.customer_name) + ', we have received your payment. Here is your receipt.</p>' +
    '<p><b>Order:</b> ' + esc(order.order_id) + '<br><b>Paid on:</b> ' + esc(order.paid_at) + '<br><b>Delivery to:</b> ' + esc(order.customer_address) + '</p>' +
    itemsTable(items, order.total, settings) + '<p>Thank you for shopping with ' + esc(settings.store_name) + '!</p>');
  return sendMail(order.customer_email, 'Receipt for order ' + order.order_id, html, settings);
}

function summaryDay_() {
  return Utilities.formatDate(new Date(Date.now() - 6 * 3600 * 1000), TZ, 'yyyy-MM-dd');
}

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

function emailShell(s, heading, inner) {
  const colour = /^#[0-9a-fA-F]{6}$/.test(String(s.brand_color || '')) ? s.brand_color : '#0b6e4f';
  const logo = isHttpsUrl_(String(s.logo_url || '')) ? '<img src="' + esc(s.logo_url) + '" height="32" style="vertical-align:middle;margin-right:8px">' : '';
  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee">' +
    '<div style="background:' + colour + ';color:#fff;padding:16px;font-size:18px">' + logo + esc(s.store_name || 'Store') + '</div>' +
    '<div style="padding:20px"><h2 style="margin-top:0">' + esc(heading) + '</h2>' + inner + '</div></div>';
}

function itemsTable(items, total, s) {
  const rows = items.map(i => '<tr><td>' + esc(i.name) + ' × ' + Number(i.qty) + '</td><td align="right">' + money(Number(i.price) * Number(i.qty), s) + '</td></tr>').join('');
  return '<table width="100%" cellpadding="6" style="border-top:1px solid #eee">' + rows +
    '<tr><td><b>Total</b></td><td align="right"><b>' + money(total, s) + '</b></td></tr></table>';
}

function badge(status) {
  const colours = {
    Paid: '#1a7f37', 'In Stock': '#1a7f37', Pending: '#b7791f',
    'Few Left': '#b7791f', 'Out of Stock': '#c53030', Cancelled: '#c53030'
  };
  const colour = colours[status] || '#555';
  return '<span style="background:' + colour + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">' + esc(status) + '</span>';
}

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


// ---------- 13. SMALL HELPERS ----------

function autoStatus(stock, threshold) {
  if (stock <= 0) return 'Out of Stock';
  if (stock <= threshold) return 'Few Left';
  return 'In Stock';
}

function finiteNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNum_(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat_(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function isTruthy_(val) {
  if (val === true) return true;
  const s = String(val == null ? '' : val).trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'active';
}

function money(value, settings) {
  const n = Number(value);
  return (settings.currency_symbol || '') + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-NG');
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function text_(value, maxLength, label, required) {
  const result = String(value == null ? '' : value).trim();
  if (required && !result) throw new Error(label + ' is required.');
  if (result.length > maxLength) throw new Error(label + ' must be ' + maxLength + ' characters or fewer.');
  return result;
}

function wholeNumber_(value, minimum, maximum, label) {
  if (value === '' || value === null || value === undefined) throw new Error(label + ' is required.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(label + ' must be a whole number from ' + minimum + ' to ' + maximum + '.');
  }
  return number;
}

function isEmail_(email) {
  return String(email || '').length <= LIMITS.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(email || ''));
}

function isHttpsUrl_(value) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(String(value || ''));
}

function slugify_(text) {
  return String(text || '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normaliseSlug_(text) {
  return slugify_(text).slice(0, LIMITS.slug);
}

function sanitizeHtmlFilename_(name) {
  const base = String(name || 'page.html').replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+/, '') || 'page.html';
  return /\.html?$/i.test(base) ? base : (base + '.html');
}

function safeError_(err) {
  return String(err && err.message ? err.message : err || 'Unknown error').slice(0, 500);
}

function now() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function sha256(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ensureTab_(name) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    setupSheets();
    sh = ss.getSheetByName(name);
  }
  return sh;
}

function sheet(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setupSheets() first.');
  return sh;
}

function headersFor_(name) {
  const sh = sheet(name);
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) throw new Error('Tab "' + name + '" has no header. Run setupSheets() first.');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const used = headers.filter(Boolean);
  if (new Set(used).size !== used.length) throw new Error('Tab "' + name + '" has duplicate column headers. Fix row 1 before continuing.');
  return headers;
}

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

function appendObj(name, obj) {
  const sh = sheet(name);
  const headers = headersFor_(name);
  const nextRow = sh.getLastRow() + 1;
  (TEXT_COLS[name] || []).forEach(column => {
    const index = headers.indexOf(column) + 1;
    if (index > 0) sh.getRange(nextRow, index).setNumberFormat('@');
  });
  sh.getRange(nextRow, 1, 1, headers.length).setValues([headers.map(header => sheetSafeValue_(obj[header] === undefined ? '' : obj[header]))]);
  if (['Products', 'Settings', 'Categories', 'HeroSettings', 'CustomPages', 'Navigation'].indexOf(name) >= 0) invalidatePublicCache_();
}

function updateRow(name, rowNumber, obj) {
  const sh = sheet(name);
  const headers = headersFor_(name);
  Object.keys(obj).forEach(key => {
    const col = headers.indexOf(key) + 1;
    if (col < 1) throw new Error('Column "' + key + '" is missing from ' + name + '. Run setupSheets() first.');
    sh.getRange(rowNumber, col).setValue(sheetSafeValue_(obj[key]));
  });
  if (['Products', 'Settings', 'Categories', 'HeroSettings', 'CustomPages', 'Navigation'].indexOf(name) >= 0) invalidatePublicCache_();
}

function sheetSafeValue_(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.replace(/^[\u0000-\u0020\uFEFF\u200B]+/, '');
  if (/^[=@]/.test(trimmed)) return "'" + value;
  if (/^[+\-]/.test(trimmed) && !/^\+[0-9][0-9\s().\-]*$/.test(trimmed)) return "'" + value;
  return value;
}

function unescapeSheetValue_(value) {
  if (typeof value !== 'string') return value;
  return /^'[\u0000-\u0020\uFEFF\u200B]*[=+\-@]/.test(value) ? value.slice(1) : value;
}

function getKvMap_(tabName) {
  const result = {};
  safeReadTabRows_(tabName).forEach(row => {
    if (row.key !== '' && row.key != null) result[String(row.key)] = String(row.value == null ? '' : row.value);
  });
  return result;
}

function setKv_(tabName, key, value) {
  ensureTab_(tabName);
  const matches = readRows(tabName).filter(row => String(row.key) === String(key));
  if (matches.length > 1) throw new Error('Duplicate ' + tabName + ' key: ' + key + '. Remove duplicates in the Sheet.');
  if (matches.length) updateRow(tabName, matches[0]._row, { value: String(value) });
  else appendObj(tabName, { key: String(key), value: String(value) });
}

function getSettings() {
  return getKvMap_('Settings');
}

function setSetting(key, value) {
  setKv_('Settings', key, value);
}
