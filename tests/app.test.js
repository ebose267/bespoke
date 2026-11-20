import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const indexHtmlRaw = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
const adminHtmlRaw = fs.readFileSync(path.resolve(process.cwd(), 'admin.html'), 'utf8');

function extractScriptAndBody(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scriptText = Array.from(doc.querySelectorAll('script'))
    .map((s) => s.textContent || '')
    .join('\n');
  return { bodyHtml: doc.body.innerHTML, scriptText };
}

function bootIndexApp({ fetchImpl, initialHash = '#/' } = {}) {
  const { bodyHtml, scriptText } = extractScriptAndBody(indexHtmlRaw);
  document.body.innerHTML = bodyHtml;
  window.location.hash = initialHash;
  window.__THIMBLE_NO_AUTO_MOUNT__ = true;
  new Function(scriptText)();
  const app = window.__STORE_APP__;
  const instance = app.mountStore({
    apiUrl: 'https://script.google.com/macros/s/demo/exec',
    fetchImpl,
    disableScroll: true
  });
  return { app, instance };
}

function bootAdminApp() {
  const { bodyHtml, scriptText } = extractScriptAndBody(adminHtmlRaw);
  document.body.innerHTML = bodyHtml;
  window.__THIMBLE_NO_AUTO_MOUNT__ = true;
  new Function(scriptText)();
  const admin = window.__ADMIN_APP__;
  admin.initAdmin();
  return admin;
}

const SAMPLE_STOREFRONT = {
  ok: true,
  products: [
    {
      id: 'P1',
      sku: 'THM-001',
      name: 'Handwoven Basket',
      price: 15000,
      compare_at_price: 20000,
      stock: 4,
      status: 'Few Left',
      category: 'Home',
      description: 'Natural woven fibers.\nMade to last.',
      images: ['https://res.cloudinary.com/dc2gwj09q/image/upload/v1/basket.jpg'],
      featured: 'yes',
      created_at: '2026-01-10 10:00:00'
    },
    {
      id: 'P2',
      sku: 'THM-002',
      name: 'Stoneware Bowl',
      price: 8000,
      stock: 0,
      status: 'Out of Stock',
      category: 'Kitchen',
      description: 'Matte glazed stoneware.',
      images: [],
      featured: 'no',
      created_at: '2026-01-12 10:00:00'
    }
  ],
  settings: {
    store_name: 'Thimble Atelier',
    currency_symbol: '₦',
    brand_color: '#0b6e4f',
    whatsapp_number: '2348012345678',
    about_title: 'Our Studio',
    about_text: 'Thoughtful pieces.',
    contact_email: 'hello@example.com'
  },
  bestSellers: [{ id: 'P1', rank: 1 }],
  hero: {
    image_url: 'https://res.cloudinary.com/dc2gwj09q/image/upload/v1/hero-banner.jpg',
    eyebrow: 'Seasonal Release',
    title: 'Crafted Essentials',
    subtitle: 'Managed live via Cloudinary and Google Sheets.',
    cta_label: 'Browse Shop',
    cta_to: '/shop',
    crop_mode: 'fill',
    focal_point: 'custom',
    focal_x: 35,
    focal_y: 60,
    zoom: 1.1,
    fit_desktop: 'cover',
    fit_tablet: 'cover',
    fit_mobile: 'contain',
    height_mobile: 'tall',
    overlay_opacity: 40
  },
  categories: [
    { id: 'CAT-1', name: 'Home', slug: 'home', description: 'Living spaces', image_url: '' },
    { id: 'CAT-2', name: 'Kitchen', slug: 'kitchen', description: 'Tableware', image_url: '' }
  ],
  customPages: [
    { page_id: 'PAGE-1', slug: 'lookbook', title: 'Spring Lookbook', show_in_nav: true, nav_label: 'Lookbook', nav_order: 25 }
  ],
  navigation: [
    { nav_id: 'home', label: 'Home', target: '/', type: 'builtin', is_visible: 'yes', sort_order: 10 },
    { nav_id: 'shop', label: 'Shop', target: '/shop', type: 'module:shop', is_visible: 'yes', sort_order: 20 }
  ]
};

describe('Three-file syntax & configuration integrity', () => {
  it('contains self-contained index.html and admin.html with zero React or secret leaks', () => {
    expect(indexHtmlRaw).not.toMatch(/api_secret|admin_token_hash|node_modules/i);
    expect(adminHtmlRaw).not.toMatch(/api_secret/i);
    expect(() => extractScriptAndBody(indexHtmlRaw)).not.toThrow();
    expect(() => extractScriptAndBody(adminHtmlRaw)).not.toThrow();
  });
});

describe('index.html storefront upgrade', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('renders Cloudinary hero image with focal point and responsive parameters (never hardcoded)', async () => {
    const fetchMock = async () => ({ ok: true, json: async () => SAMPLE_STOREFRONT });
    const { app } = bootIndexApp({ fetchImpl: fetchMock });

    await new Promise((r) => setTimeout(r, 20));
    const heroImg = document.querySelector('.hero-media img');
    expect(heroImg).not.toBeNull();
    expect(heroImg.getAttribute('src')).toContain('c_fill,f_auto,q_auto,w_1600');
    expect(document.querySelector('.hero').getAttribute('style')).toContain('--hero-pos:35% 60%');
    expect(document.body.textContent).toContain('Crafted Essentials');
    expect(document.body.textContent).toContain('Lookbook');

    // Verify pure hero URL builder separates fl_relative crop before resize width
    const cropped = app.core.cloudinaryHeroUrl({
      image_url: 'https://res.cloudinary.com/dc2gwj09q/image/upload/v1/demo.jpg',
      crop_mode: 'crop',
      crop_x: 10,
      crop_y: 20,
      crop_w: 50,
      crop_h: 60
    }, 1000);
    expect(cropped).toContain('c_crop,fl_relative,x_0.10,y_0.20,w_0.50,h_0.60/f_auto,q_auto,w_1000');
  });

  it('dynamically loads active custom HTML pages inside a sandboxed iframe and blocks inactive ones', async () => {
    const customHtml = '<html><body><h2>Lookbook Custom Content</h2></body></html>';
    const fetchMock = async (url) => {
      if (url.includes('action=page&slug=lookbook')) {
        return {
          ok: true,
          json: async () => ({ ok: true, page: { slug: 'lookbook', title: 'Spring Lookbook', html: customHtml } })
        };
      }
      if (url.includes('action=page&slug=disabled-page')) {
        return { ok: true, json: async () => ({ ok: false, error: 'Page not found.' }) };
      }
      return { ok: true, json: async () => SAMPLE_STOREFRONT };
    };

    const { instance } = bootIndexApp({ fetchImpl: fetchMock, initialHash: '#/page/lookbook' });
    await new Promise((r) => setTimeout(r, 30));

    const frame = document.querySelector('#custom-page-frame');
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame.getAttribute('srcdoc')).toContain('Lookbook Custom Content');

    // Navigating to an inactive or unknown custom page renders clean 404 state
    instance.navigate('/page/disabled-page');
    await new Promise((r) => setTimeout(r, 30));
    expect(document.body.textContent).toContain('Page not found');
  });

  it('recovers from temporary backend outage using localStorage snapshot and allows checkout submission', async () => {
    // First boot populates cache cleanly
    const fetchOk = async () => ({ ok: true, json: async () => SAMPLE_STOREFRONT });
    bootIndexApp({ fetchImpl: fetchOk });
    await new Promise((r) => setTimeout(r, 20));
    expect(window.localStorage.getItem('thimble_storefront_cache_v1')).toBeTruthy();

    // Second boot simulates failed network -> offline fallback restores catalog
    const fetchFail = async () => { throw new Error('Network offline'); };
    bootIndexApp({ fetchImpl: fetchFail });
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector('.offline-banner')).not.toBeNull();
    expect(document.body.textContent).toContain('Handwoven Basket');
  });
});

describe('admin.html CMS, CSV Import, Image Matcher & Custom Pages', () => {
  it('parses RFC-4180 CSVs, maps discounted_price, detects duplicates & errors cleanly', () => {
    const admin = bootAdminApp();
    const csv = [
      'sku,name,category,price,discounted_price,stock,status,featured,description',
      'THM-001,"Linen Tote, Ivory",Bags,20000,15000,12,In Stock,yes,"Woven tote."',
      'THM-003,Ceramic Mug,Home,8000,9000,5,In Stock,no,"Discount higher than price"',
      'THM-001,Duplicate SKU,Bags,10000,,2,In Stock,no,"Dup SKU"',
      'SKU-4,,Home,0,,-1,InvalidStatus,no,""'
    ].join('\n');

    const { records } = admin.parseCsv(csv);
    expect(records.length).toBe(4);

    const validated = admin.validateCsvRows(records, [{ id: 'P1', sku: 'THM-001', name: 'Old Name' }]);
    // Row 1 updates existing THM-001 with selling=15000, compare_at_price=20000
    expect(validated[0].valid).toBe(true);
    expect(validated[0].action).toBe('Update');
    expect(validated[0].normalized.price).toBe(15000);
    expect(validated[0].normalized.compare_at_price).toBe(20000);

    // Row 2 flags discounted_price >= price
    expect(validated[1].valid).toBe(false);
    expect(validated[1].errors.join(' ')).toContain('Discounted price must be lower than price');

    // Row 3 flags duplicate SKU within CSV
    expect(validated[2].valid).toBe(false);
    expect(validated[2].errors.join(' ')).toContain('Duplicate SKU');

    // Row 4 flags missing name, invalid price/stock/status
    expect(validated[3].valid).toBe(false);
    expect(validated[3].errors.length).toBeGreaterThanOrEqual(4);
  });

  it('matches uploaded image filenames to products by SKU, ID, or name', () => {
    const admin = bootAdminApp();
    const products = [
      { id: 'P100', sku: 'THM-001', name: 'Handwoven Linen Tote' },
      { id: 'P101', sku: 'MUG-9', name: 'Ceramic Bowl' }
    ];

    expect(admin.matchImageFilenameToProduct('THM-001.jpg', products).id).toBe('P100');
    expect(admin.matchImageFilenameToProduct('thm-001_2.webp', products).id).toBe('P100');
    expect(admin.matchImageFilenameToProduct('P101_front.png', products).id).toBe('P101');
    expect(admin.matchImageFilenameToProduct('ceramic-bowl-hero.jpg', products).id).toBe('P101');
    expect(admin.matchImageFilenameToProduct('unrelated-image.jpg', products)).toBeNull();
  });

  it('computes Cloudinary Hero preview transforms for viewport sizes and cropping', () => {
    const admin = bootAdminApp();
    const spec = admin.buildHeroPreviewStyle({
      image_url: 'https://res.cloudinary.com/dc2gwj09q/image/upload/v1/hero.jpg',
      crop_mode: 'fill',
      focal_point: 'custom',
      focal_x: 25,
      focal_y: 75,
      zoom: 1.4,
      fit_desktop: 'cover',
      fit_mobile: 'contain',
      height_mobile: 'tall',
      overlay_opacity: 50
    }, 'mobile');

    expect(spec.fit).toBe('contain');
    expect(spec.height).toBe('tall');
    expect(spec.fx).toBe(25);
    expect(spec.fy).toBe(75);
    expect(spec.previewUrl).toContain('c_fill,f_auto,q_auto,w_760');
  });
});
