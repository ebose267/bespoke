import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const CODE_PATH = path.resolve(process.cwd(), 'thecode.gs');
const SOURCE = fs.readFileSync(CODE_PATH, 'utf8');

function createMockAppsScriptEnv() {
  const sheets = new Map();
  let nextFileId = 100;
  const driveFiles = new Map();
  const driveFolders = new Map();
  const cacheStore = new Map();
  const sentEmails = [];
  const triggers = [];

  function ensureRangeCell(grid, r, c) {
    while (grid.length < r) grid.push([]);
    while (grid[r - 1].length < c) grid[r - 1].push('');
  }

  function makeSheet(name) {
    const grid = [];
    const formats = new Map();
    const s = {
      getName: () => name,
      getLastRow: () => grid.length,
      getLastColumn: () => grid.reduce((m, row) => Math.max(m, row.length), 0),
      getMaxRows: () => Math.max(grid.length + 5, 10),
      setFrozenRows: () => {},
      deleteRow: (rowNum) => {
        if (rowNum >= 1 && rowNum <= grid.length) grid.splice(rowNum - 1, 1);
      },
      getDataRange: () => ({
        getValues: () => grid.map((row) => row.slice())
      }),
      getRange: (row, col, numRows = 1, numCols = 1) => ({
        setFontWeight: () => {},
        setNumberFormat: (fmt) => { formats.set(`${row}:${col}:${numRows}`, fmt); },
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const line = [];
            for (let c = 0; c < numCols; c++) {
              const val = grid[row - 1 + r] && grid[row - 1 + r][col - 1 + c];
              line.push(val === undefined ? '' : val);
            }
            out.push(line);
          }
          return out;
        },
        setValues: (vals) => {
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) {
              ensureRangeCell(grid, row + r, col + c);
              grid[row - 1 + r][col - 1 + c] = vals[r][c];
            }
          }
        },
        setValue: (val) => {
          ensureRangeCell(grid, row, col);
          grid[row - 1][col - 1] = val;
        }
      }),
      getSheet: () => s
    };
    return s;
  }

  const spreadsheet = {
    getSheetByName: (name) => sheets.get(name) || null,
    insertSheet: (name) => {
      const sh = makeSheet(name);
      sheets.set(name, sh);
      return sh;
    },
    getSheets: () => Array.from(sheets.values()),
    deleteSheet: (sh) => { sheets.delete(sh.getName()); }
  };

  function makeDriveFile(id, name, content) {
    let trashed = false;
    let body = String(content || '');
    let fileName = String(name || 'page.html');
    const fileObj = {
      getId: () => id,
      getName: () => fileName,
      setName: (n) => { fileName = String(n); },
      setContent: (c) => { body = String(c); },
      setTrashed: (v) => { trashed = Boolean(v); },
      isTrashed: () => trashed,
      getBlob: () => ({ getDataAsString: () => body })
    };
    driveFiles.set(id, fileObj);
    return fileObj;
  }

  function makeDriveFolder(id, name) {
    const folder = {
      getId: () => id,
      getName: () => name,
      createFile: (fname, content) => {
        const fid = 'DRV-' + (++nextFileId);
        return makeDriveFile(fid, fname, content);
      }
    };
    driveFolders.set(id, folder);
    return folder;
  }

  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: () => spreadsheet
    },
    DriveApp: {
      getFolderById: (id) => {
        if (!driveFolders.has(id)) throw new Error('Folder not found');
        return driveFolders.get(id);
      },
      getFoldersByName: (name) => {
        const matches = Array.from(driveFolders.values()).filter((f) => f.getName() === name);
        let idx = 0;
        return { hasNext: () => idx < matches.length, next: () => matches[idx++] };
      },
      createFolder: (name) => makeDriveFolder('FLD-' + (++nextFileId), name),
      getFileById: (id) => {
        if (!driveFiles.has(id)) throw new Error('File not found');
        return driveFiles.get(id);
      }
    },
    MimeType: { HTML: 'text/html' },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => { cacheStore.set(k, String(v)); },
        remove: (k) => { cacheStore.delete(k); }
      })
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, value) => Array.from(crypto.createHash('sha256').update(String(value)).digest()),
      formatDate: (d, _tz, fmt) => {
        const iso = new Date(d).toISOString();
        if (fmt === 'yyyy-MM-dd HH:mm:ss') return iso.slice(0, 10) + ' ' + iso.slice(11, 19);
        if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
        if (fmt === 'yyMMdd') return iso.slice(2, 10).replace(/-/g, '');
        return iso;
      },
      getUuid: () => crypto.randomUUID(),
      sleep: () => {}
    },
    MailApp: {
      getRemainingDailyQuota: () => 100,
      sendEmail: (opts) => { sentEmails.push(opts); }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({ setMimeType: () => ({ getContent: () => txt }) })
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: () => {},
      newTrigger: (fn) => ({
        timeBased: () => ({ everyDays: () => ({ atHour: () => ({ nearMinute: () => ({ inTimezone: () => ({ create: () => triggers.push({ getHandlerFunction: () => fn }) }) }) }) }) })
      })
    },
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Error,
    RegExp,
    encodeURIComponent
  };

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);

  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  const get = (parameter) => JSON.parse(sandbox.doGet({ parameter }).getContent());

  return { sandbox, post, get, sheets, driveFiles, cacheStore, sentEmails };
}

function loginAsOwner(env, token = 'secret-owner-token-24-chars-long!!') {
  env.sandbox.setupSheets();
  env.sandbox.setSetting('admin_token_hash', env.sandbox.sha256(token));
  const res = env.post({ action: 'login', token });
  assert.equal(res.ok, true);
  return res.session;
}

test('setupSheets creates all 9 tabs idempotently and appends missing columns without data loss', () => {
  const env = createMockAppsScriptEnv();
  const res1 = env.sandbox.setupSheets();
  assert.equal(res1.ok, true);
  ['Products', 'Orders', 'Customers', 'Settings', 'Categories', 'HeroSettings', 'CustomPages', 'Navigation', 'MediaAssets'].forEach((tab) => {
    assert.ok(env.sheets.has(tab), `Expected tab ${tab}`);
  });

  // Update a setting and verify re-running setupSheets never resets it
  env.sandbox.setSetting('store_name', 'Thimble Bespoke');
  env.sandbox.setupSheets();
  assert.equal(env.sandbox.getSettings().store_name, 'Thimble Bespoke');

  // Verify Products includes sku
  const headers = env.sandbox.headersFor_('Products');
  assert.ok(headers.includes('sku'));
});

test('auth guards reject missing/bad sessions and allow valid owner session', () => {
  const env = createMockAppsScriptEnv();
  env.sandbox.setupSheets();
  env.sandbox.setSetting('admin_token_hash', env.sandbox.sha256('very-strong-token-value-12345'));

  const badLogin = env.post({ action: 'login', token: 'wrong-token' });
  assert.equal(badLogin.ok, false);

  const unauth = env.post({ action: 'getAdminWorkspace' });
  assert.equal(unauth.ok, false);
  assert.match(unauth.error, /log in again/i);

  const session = loginAsOwner(env);
  const ws = env.post({ action: 'getAdminWorkspace', session });
  assert.equal(ws.ok, true);
  assert.equal(ws.settings.admin_token_hash, undefined);
});

test('HeroSettings save and public storefront delivery with validation', () => {
  const env = createMockAppsScriptEnv();
  const session = loginAsOwner(env);

  const bad = env.post({
    action: 'saveHeroSettings',
    session,
    hero: { image_url: 'http://insecure.example.com/hero.jpg' }
  });
  assert.equal(bad.ok, false);

  const saved = env.post({
    action: 'saveHeroSettings',
    session,
    hero: {
      image_url: 'https://res.cloudinary.com/dc2gwj09q/image/upload/v1/hero-banner.jpg',
      eyebrow: 'New Collection',
      title: 'Handcrafted Goods',
      subtitle: 'Built for everyday rituals.',
      crop_mode: 'fill',
      focal_point: 'custom',
      focal_x: 34,
      focal_y: 62,
      zoom: 1.25,
      fit_desktop: 'cover',
      fit_mobile: 'contain',
      height_mobile: 'tall',
      overlay_opacity: 40
    }
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.hero.focal_x, 34);
  assert.equal(saved.hero.fit_mobile, 'contain');

  const sf = env.get({ action: 'storefront' });
  assert.equal(sf.ok, true);
  assert.equal(sf.hero.image_url, 'https://res.cloudinary.com/dc2gwj09q/image/upload/v1/hero-banner.jpg');
  assert.equal(sf.hero.focal_y, 62);
  assert.equal(sf.hero.zoom, 1.25);
});

test('CustomPages stores HTML in Drive, enforces activation/reserved slugs, and flushes cache on direct Sheet edits', () => {
  const env = createMockAppsScriptEnv();
  const session = loginAsOwner(env);

  // Reserved slug rejected
  const reserved = env.post({
    action: 'saveCustomPage',
    session,
    page: { title: 'Shop', slug: 'shop', html_content: '<h1>Bad</h1>' }
  });
  assert.equal(reserved.ok, false);

  // Upload valid HTML page
  const htmlDoc = '<!doctype html><html><head><style>body{color:#111}</style></head><body><h1>Spring Lookbook</h1></body></html>';
  const created = env.post({
    action: 'saveCustomPage',
    session,
    page: {
      title: 'Spring Lookbook',
      slug: 'lookbook',
      is_active: 'yes',
      show_in_nav: 'yes',
      nav_label: 'Lookbook',
      nav_order: 25,
      file_name: 'lookbook.html',
      html_content: htmlDoc
    }
  });
  assert.equal(created.ok, true);
  assert.ok(created.drive_file_id);
  assert.ok(env.driveFiles.has(created.drive_file_id));

  // Public storefront lists active page & page route serves HTML
  const sf1 = env.get({ action: 'storefront' });
  assert.equal(sf1.customPages.length, 1);
  assert.equal(sf1.customPages[0].slug, 'lookbook');

  const pageRes = env.get({ action: 'page', slug: 'lookbook' });
  assert.equal(pageRes.ok, true);
  assert.equal(pageRes.page.html, htmlDoc);

  // Deactivate page -> visitors must receive not found & storefront omits it
  const off = env.post({ action: 'toggleCustomPage', session, page_id: created.page_id, is_active: 'no' });
  assert.equal(off.ok, true);
  const blocked = env.get({ action: 'page', slug: 'lookbook' });
  assert.equal(blocked.ok, false);
  const sf2 = env.get({ action: 'storefront' });
  assert.equal(sf2.customPages.length, 0);

  // Simulate direct Sheet edit (owner changes column is_active back to 'yes' in Google Sheets)
  const cpSheet = env.sheets.get('CustomPages');
  const headers = env.sandbox.headersFor_('CustomPages');
  const activeCol = headers.indexOf('is_active') + 1;
  cpSheet.getRange(2, activeCol).setValue('yes');
  env.sandbox.onEdit({ range: { getSheet: () => cpSheet } });

  const reactivated = env.get({ action: 'page', slug: 'lookbook' });
  assert.equal(reactivated.ok, true);
  assert.equal(reactivated.page.title, 'Spring Lookbook');

  // Delete trashes Drive file
  const del = env.post({ action: 'deleteCustomPage', session, page_id: created.page_id });
  assert.equal(del.ok, true);
  assert.equal(env.driveFiles.get(created.drive_file_id).isTrashed(), true);
});

test('Bulk CSV product import creates, updates by SKU without duplicates, and assigns Cloudinary images', () => {
  const env = createMockAppsScriptEnv();
  const session = loginAsOwner(env);

  // Reject batch if duplicate SKU appears inside CSV -> atomic failure (zero rows written)
  const badBatch = env.post({
    action: 'importProductsCsv',
    session,
    rows: [
      { sku: 'DUP-1', name: 'Item A', price: 5000, stock: 5 },
      { sku: 'dup-1', name: 'Item B', price: 6000, stock: 3 }
    ]
  });
  assert.equal(badBatch.ok, false);
  assert.equal(env.sandbox.readRows('Products').length, 0);

  // Import valid batch
  const imp1 = env.post({
    action: 'importProductsCsv',
    session,
    rows: [
      { sku: 'THM-001', name: 'Linen Tote', category: 'Bags', price: 15000, compare_at_price: 18500, stock: 12, featured: true, description: 'Everyday tote' },
      { sku: 'THM-002', name: 'Stoneware Mug', category: 'Home', price: 9500, stock: 3, status: 'Few Left' }
    ]
  });
  assert.equal(imp1.ok, true);
  assert.equal(imp1.created, 2);
  assert.equal(imp1.updated, 0);

  // Re-import with matching SKU updates existing record instead of duplicating
  const imp2 = env.post({
    action: 'importProductsCsv',
    session,
    rows: [
      { sku: 'thm-001', name: 'Linen Tote v2', category: 'Bags', price: 14000, compare_at_price: 18500, stock: 20 }
    ]
  });
  assert.equal(imp2.ok, true);
  assert.equal(imp2.created, 0);
  assert.equal(imp2.updated, 1);
  assert.equal(env.sandbox.readRows('Products').length, 2);

  // Assign Cloudinary images by SKU
  const imgAssign = env.post({
    action: 'assignProductImages',
    session,
    assignments: [
      { sku: 'THM-001', images: ['https://res.cloudinary.com/dc2gwj09q/image/upload/v1/thm001.jpg'], mode: 'append' }
    ]
  });
  assert.equal(imgAssign.ok, true);
  assert.equal(imgAssign.updated, 1);

  const sf = env.get({ action: 'storefront' });
  const tote = sf.products.find((p) => p.sku.toLowerCase() === 'thm-001');
  assert.equal(tote.name, 'Linen Tote v2');
  assert.equal(tote.images[0], 'https://res.cloudinary.com/dc2gwj09q/image/upload/v1/thm001.jpg');
});

test('placeOrder calculates authoritative totals server-side and markPaid/revertPaid manage stock cleanly', () => {
  const env = createMockAppsScriptEnv();
  const session = loginAsOwner(env);

  const prod = env.post({
    action: 'saveProduct',
    session,
    product: {
      name: 'Brass Candle',
      sku: 'CND-1',
      price: 12000,
      stock: 5,
      category: 'Home',
      images: [],
      request_id: 'req_create_candle_123456'
    }
  });
  assert.equal(prod.ok, true);

  // Place order (client cannot override price)
  const orderRes = env.post({
    action: 'placeOrder',
    name: 'Ada Obi',
    email: 'ada@example.com',
    phone: '08012345678',
    address: '12 Palm Ave, Lagos',
    newsletter: true,
    items: [{ id: prod.id, qty: 2, price: 1 }],
    request_id: 'req_order_attempt_123456',
    started_at: Date.now() - 5000,
    website: ''
  });
  assert.equal(orderRes.ok, true);
  assert.equal(orderRes.total, 24000);

  // Duplicate request_id returns same order idempotently
  const repeat = env.post({
    action: 'placeOrder',
    name: 'Ada Obi',
    email: 'ada@example.com',
    phone: '08012345678',
    address: '12 Palm Ave, Lagos',
    newsletter: true,
    items: [{ id: prod.id, qty: 2 }],
    request_id: 'req_order_attempt_123456'
  });
  assert.equal(repeat.ok, true);
  assert.equal(repeat.orderId, orderRes.orderId);
  assert.equal(repeat.repeatedRequest, true);

  // Confirm payment deducts stock
  const paid = env.post({ action: 'markPaid', session, orderId: orderRes.orderId });
  assert.equal(paid.ok, true);
  let ws = env.post({ action: 'getAdminWorkspace', session });
  assert.equal(ws.products[0].stock, 3);

  // Revert payment restores stock
  const reverted = env.post({ action: 'revertPaid', session, orderId: orderRes.orderId });
  assert.equal(reverted.ok, true);
  ws = env.post({ action: 'getAdminWorkspace', session });
  assert.equal(ws.products[0].stock, 5);
});
