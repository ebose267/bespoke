// Safe-value helpers. Everything the CMS supplies is untrusted until it passes through here.
// (React escapes text for us; these cover URLs, phone numbers and slugs.)

/** Only absolute HTTPS URLs are ever used for images or links. Returns '' otherwise. */
export function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

/** Adds Cloudinary delivery optimisation (format, quality, width) to genuine Cloudinary URLs only. */
export function imageUrl(value, width = 600) {
  let url = httpsUrl(value);
  if (!url) return '';
  if (url.includes('res.cloudinary.com') && url.includes('/image/upload/')) {
    url = url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${Number(width) || 600}/`);
  }
  return url;
}

/** Digits-only WhatsApp number with country code: "0801 234 5678" -> 2348012345678. Mirrors the backend. */
export function waDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0\d{10}$/.test(digits)) digits = '234' + digits.slice(1);
  return digits;
}

export const isValidWaNumber = (digits) => { const d = String(digits || ''); return d.length >= 10 && d.length <= 15; };

/** Only a real wa.me link is trusted as a WhatsApp hand-off target. */
export function whatsappUrl(value) {
  const url = httpsUrl(value);
  if (!url) return '';
  return new URL(url).hostname === 'wa.me' ? url : '';
}

/** A tel: href that cannot carry anything except dialling characters. */
export function telHref(value) {
  const cleaned = String(value || '').replace(/[^+0-9]/g, '');
  return cleaned ? 'tel:' + cleaned : '';
}

export function slugify(text) {
  return String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const isHexColour = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));
