// A realistic public API response (shape verified against backend/Code.gs publicProducts()/publicSettings()).
export const rawProducts = [
  { id: 'P1', name: 'Red Sneakers', price: 15000, description: 'Everyday sneakers.', category: 'Shoes', images: ['https://res.cloudinary.com/demo/image/upload/v1/a.jpg', 'javascript:alert(1)', 'http://insecure.example/b.jpg'], stock: 12, status: 'In Stock', created_at: '2026-11-10 10:00:00', featured: true, compare_at_price: 18000 },
  { id: 'P2', name: 'Leather Tote Bag', price: 28000, description: 'Handmade tote.', category: 'Bags', images: [], stock: 4, status: 'Few Left', created_at: '2026-11-12 09:00:00', featured: false, compare_at_price: 0 },
  { id: 'P3', name: 'Canvas Belt', price: 6500, description: 'Durable belt.', category: 'Accessories', images: [], stock: 0, status: 'In Stock', created_at: '', featured: false, compare_at_price: 0 },
  { id: 'P4', name: "Men's Sunglasses", price: 9000, description: 'UV shades.', category: "Men's Wear", images: [], stock: 20, status: 'In Stock', created_at: '2026-11-13 08:00:00', featured: false, compare_at_price: 5000 },
];
export const rawSettings = { store_name: 'Demo Store', currency_symbol: '₦', brand_color: '#0b6e4f', logo_url: '', banner_text: 'Free gift wrap', categories: 'Shoes,Bags,Accessories', whatsapp_number: '08012345678', tagline: 'Thoughtfully selected.', about_title: '', about_text: '', contact_phone: '', contact_email: '', contact_address: '', opening_hours: '', instagram_url: '' };
export const storefrontResponse = { ok: true, products: rawProducts, settings: rawSettings, bestSellers: [{ id: 'P2', rank: 1 }, { id: 'GONE', rank: 2 }, { id: 'P1', rank: 3 }] };

/** Fetch stub: GET returns the catalogue, POST records the body and answers like the backend. */
export function makeFetch({ get = storefrontResponse, post } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if ((init.method || 'GET') === 'POST') {
      const body = JSON.parse(init.body);
      const result = post ? await post(body) : { ok: true, orderId: 'ORD-261114-ABCD1234', total: 15000, whatsappUrl: 'https://wa.me/2348012345678?text=Hello' };
      return { ok: true, json: async () => result };
    }
    return { ok: true, json: async () => (typeof get === 'function' ? get(String(url)) : get) };
  };
  fn.calls = calls;
  return fn;
}
