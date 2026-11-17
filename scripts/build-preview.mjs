// Generates admin/admin-preview.html from admin/admin.html + admin/preview-mock.js.
// The preview can therefore never drift from the real dashboard. Run: npm run build:preview
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'admin', 'admin-preview.html');
let html = fs.readFileSync(path.join(root, 'admin', 'admin.html'), 'utf8');
const mock = fs.readFileSync(path.join(root, 'admin', 'preview-mock.js'), 'utf8');

function swap(label, from, to) {
  if (!html.includes(from)) throw new Error('build-preview: could not find ' + label + '. admin.html changed; update this script.');
  html = html.replace(from, () => to);
}
function swapBetween(label, startMarker, endMarker, replacement) {
  const a = html.indexOf(startMarker), b = html.indexOf(endMarker);
  if (a < 0 || b < 0 || b < a) throw new Error('build-preview: could not find ' + label + '. admin.html changed; update this script.');
  html = html.slice(0, a) + replacement + html.slice(b);
}

swap('title', '<title>Admin Dashboard</title>', '<title>Admin Dashboard (Preview)</title>');
swap('config', "const API='__API_URL__';", "const API='PREVIEW_ONLY_NO_LIVE_API';");
swap('cloud', "const CLOUD='__CLOUDINARY_CLOUD__', PRESET='__CLOUDINARY_PRESET__';", "const CLOUD='preview', PRESET='preview-only';");
swapBetween('api()', '// All owner requests use the short-lived session', '/* ===== LOGIN ===== */', mock + '\n');
swap('image urls', "return url.protocol==='https:'?url.href:''", "return (url.protocol==='https:'||url.protocol==='blob:')?url.href:''");
swapBetween('upload', '// Validate each image before sending it to the public Cloudinary preset.', '// Send clean product fields to the server',
`// Preview uploads stay in this tab as temporary blob URLs; nothing is uploaded.
async function upl(files){
  const button=$('psb');if(!files||!files.length)return;
  try{
    for(const file of Array.from(files)){
      if(IMG.length>=8)throw new Error('A product can have no more than 8 images.');
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use a JPG, PNG or WebP image.');
      if(file.size>5*1024*1024)throw new Error('Each image must be 5 MB or smaller.');
      IMG.push(URL.createObjectURL(file));drawImgs();
    }
  }catch(error){toast(error.message,true)}
  finally{if($('pf'))$('pf').value=''}
}
`);
swap('banner', '<div class="shell hide" id="app">', '<div class="shell hide" id="app">\n  <div style="margin-top:14px;background:#fff3cd;color:#7a5b00;border-radius:12px;padding:10px 16px;font-size:.82rem">👀 <b>Preview mode</b>: demo data only. Nothing is saved and a refresh resets it. No email, WhatsApp or live Sheet changes occur here.</div>');
swap('boot', "try{S=sessionStorage.getItem('s')||''}catch(error){}\nif(S)start();", "S='preview';start();");

fs.writeFileSync(out, html);
console.log('wrote', path.relative(root, out), '(' + html.length + ' bytes)');
