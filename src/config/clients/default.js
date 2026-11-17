// Neutral light theme. Copy this file to start a new client, then change tokens and content only.
export default {
  id: 'default',
  theme: {
    mode: 'light',
    lockAccent: false, // false: the accent follows the brand colour set by the owner in the dashboard
    colors: {
      bg: '#ffffff', surface: '#f6f5f2', card: '#ffffff', border: '#e4e1da',
      text: '#1b1d18', textMuted: '#62675c', accent: '#0b6e4f', accentContrast: '#ffffff',
      success: '#2f7d32', danger: '#c0392b',
    },
    fonts: { heading: 'Georgia, "Times New Roman", serif', body: 'system-ui, -apple-system, "Segoe UI", sans-serif', googleFontsUrl: '' },
    radius: { card: '14px', control: '10px', pill: '999px' },
    shadow: '0 6px 24px rgba(0,0,0,.08)',
    pageWidth: '1180px',
  },
  modules: { shop: true, newArrivals: true, categories: true, bestSellers: true, search: true },
  nav: [
    { label: 'Home', to: '/' },
    { label: 'Shop', to: '/shop', module: 'shop' },
    { label: 'New arrivals', to: '/new-arrivals', module: 'newArrivals' },
    { label: 'Categories', to: '/categories', module: 'categories' },
    { label: 'Best sellers', to: '/best-sellers', module: 'bestSellers' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
  ],
  // Static, designer-chosen content for this client. Leave a field empty to hide that element.
  hero: { eyebrow: '', title: '', subtitle: '', image: '', imageAlt: '', ctaLabel: 'Shop now', ctaTo: '/shop', secondaryLabel: '', secondaryTo: '' },
  // Only TRUE business promises. Empty list hides the strip.
  trust: [
    { title: 'Order on WhatsApp', text: 'Place your order online, then confirm with us on WhatsApp.' },
    { title: 'Email receipts', text: 'Order and payment confirmations are emailed to you.' },
    { title: 'Stock checked again', text: 'Availability is verified again when you place the order.' },
  ],
  promo: null, // { title, text, image, ctaLabel, ctaTo }
  homeSections: ['hero', 'trust', 'categories', 'featured', 'bestSellers', 'newArrivals', 'promo'],
  footer: { links: [], note: '' },
};
