// Re-theming: a client's look is DATA (tokens), never forked components.
import { isHexColour } from './safe.js';

/** CSS custom properties for a client config + the store's brand colour from the CMS. */
export function themeVariables(theme, brandColor) {
  const c = theme.colors;
  const accent = isHexColour(brandColor) && !theme.lockAccent ? brandColor : c.accent;
  return {
    '--bg': c.bg, '--surface': c.surface, '--card': c.card, '--border': c.border,
    '--text': c.text, '--text-muted': c.textMuted, '--accent': accent, '--accent-contrast': c.accentContrast || '#ffffff',
    '--success': c.success, '--danger': c.danger,
    '--font-heading': theme.fonts.heading, '--font-body': theme.fonts.body,
    '--radius-card': theme.radius.card, '--radius-control': theme.radius.control, '--radius-pill': theme.radius.pill,
    '--shadow': theme.shadow || '0 6px 28px rgba(0,0,0,.12)', '--page-width': theme.pageWidth || '1180px',
  };
}

export function applyTheme(theme, brandColor, root = document.documentElement) {
  Object.entries(themeVariables(theme, brandColor)).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.mode = theme.mode || 'light';
  if (theme.fonts.googleFontsUrl && /^https:\/\/fonts\.googleapis\.com\//.test(theme.fonts.googleFontsUrl) && !document.getElementById('theme-fonts')) {
    const link = document.createElement('link');
    link.id = 'theme-fonts'; link.rel = 'stylesheet'; link.href = theme.fonts.googleFontsUrl;
    document.head.appendChild(link);
  }
}
