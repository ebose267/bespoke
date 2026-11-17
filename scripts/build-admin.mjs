// Builds the owner dashboard for ONE client: injects that client's API URL and Cloudinary settings into admin.html.
// Values come from environment variables (Netlify site settings) or clients/<id>.json (git-ignored, local only).
//   API_URL=https://script.google.com/macros/s/XXXX/exec CLOUDINARY_CLOUD=abc CLOUDINARY_PRESET=store_uploads npm run build:admin
//   node scripts/build-admin.mjs synthova-oil     (reads clients/synthova-oil.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveClientConfig(env = process.env, clientId = process.argv[2] || env.CLIENT_ID) {
  let file = {};
  if (clientId) {
    const p = path.join(root, 'clients', clientId + '.json');
    if (!fs.existsSync(p)) throw new Error(`clients/${clientId}.json not found. Copy clients/example.json and fill it in.`);
    file = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  const cfg = {
    apiUrl: env.API_URL || file.apiUrl || '',
    cloud: env.CLOUDINARY_CLOUD || file.cloudinaryCloud || '',
    preset: env.CLOUDINARY_PRESET || file.cloudinaryPreset || '',
  };
  const problems = [];
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.apiUrl)) problems.push('API_URL must look like https://script.google.com/macros/s/<id>/exec');
  if (!/^[A-Za-z0-9_-]{2,60}$/.test(cfg.cloud) || /^REPLACE/.test(cfg.cloud)) problems.push('CLOUDINARY_CLOUD is missing or still a placeholder');
  if (!/^[A-Za-z0-9_.-]{2,80}$/.test(cfg.preset) || /^REPLACE/.test(cfg.preset)) problems.push('CLOUDINARY_PRESET is missing or still a placeholder');
  if (problems.length) throw new Error('build-admin: ' + problems.join('; '));
  return cfg;
}

export function renderAdmin(html, cfg) {
  const swaps = [['__API_URL__', cfg.apiUrl], ['__CLOUDINARY_CLOUD__', cfg.cloud], ['__CLOUDINARY_PRESET__', cfg.preset]];
  for (const [token, value] of swaps) {
    if (!html.includes(token)) throw new Error('build-admin: placeholder ' + token + ' not found in admin.html');
    html = html.split(token).join(value);
  }
  return html;
}

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1]?.endsWith('build-admin.mjs')) {
  const out = path.join(root, 'dist', 'admin');
  const html = renderAdmin(fs.readFileSync(path.join(root, 'admin', 'admin.html'), 'utf8'), resolveClientConfig());
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(out, '_headers'), '/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n');
  console.log('Admin dashboard built to dist/admin (deploy this folder to the client\'s unlisted admin Netlify site).');
}
