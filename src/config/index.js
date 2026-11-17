// Picks the client config at build time: VITE_CLIENT=synthova-oil npm run build
import base from './clients/default.js';

const files = import.meta.glob('./clients/*.js', { eager: true });

/** Fill anything a client file leaves out from the default, so a partial config can never crash the UI. */
export function mergeConfig(client, fallback = base) {
  return {
    ...fallback, ...client,
    theme: {
      ...fallback.theme, ...client.theme,
      colors: { ...fallback.theme.colors, ...(client.theme || {}).colors },
      fonts: { ...fallback.theme.fonts, ...(client.theme || {}).fonts },
      radius: { ...fallback.theme.radius, ...(client.theme || {}).radius },
    },
    modules: { ...fallback.modules, ...client.modules },
    hero: { ...fallback.hero, ...client.hero },
    footer: { ...fallback.footer, ...client.footer },
  };
}

export function pickClient(id, all = files) {
  const entry = Object.entries(all).find(([path]) => path.endsWith('/' + id + '.js'));
  return mergeConfig(entry ? entry[1].default : base);
}

export const siteConfig = pickClient(import.meta.env.VITE_CLIENT || 'default');
