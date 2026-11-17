// Synthova Oil: first Thimble client. Dark, warm, editorial. Re-theme only: same components as every other client.
import base from './default.js';

export default {
  ...base,
  id: 'synthova-oil',
  theme: {
    ...base.theme,
    mode: 'dark',
    colors: {
      bg: '#080c08', surface: '#0f140f', card: '#141c14', border: '#243024',
      text: '#ede8e0', textMuted: '#b8c4b0', accent: '#d4920c', accentContrast: '#ffffff',
      success: '#56a845', danger: '#e0623a',
    },
    fonts: {
      heading: '"Playfair Display", Georgia, serif',
      body: 'Outfit, system-ui, sans-serif',
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Outfit:wght@300;400;500;600&display=swap',
    },
    radius: { card: '20px', control: '10px', pill: '999px' },
    shadow: '0 6px 32px rgba(0,0,0,.4)',
  },
  hero: { ...base.hero, eyebrow: 'Welcome', ctaLabel: 'Shop now' },
};
