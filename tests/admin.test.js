// Static guards for the owner dashboard, the generated preview and the per-client build script.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderAdmin, resolveClientConfig } from '../scripts/build-admin.mjs';

const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin/admin.html'), 'utf8');
const scripts = (html) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const fnNames = (html) => new Set([...scripts(html).join('\n').matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]));

describe('admin.html', () => {
  it('parses and carries no real client values, only placeholders', () => {
    scripts(admin).forEach((s) => expect(() => new Function(s)).not.toThrow());
    expect(admin).toContain("const API='__API_URL__'");
    expect(admin).toContain("CLOUD='__CLOUDINARY_CLOUD__'");
    expect(admin).not.toMatch(/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/);
  });
  it('keeps every safety pattern from the audited release', () => {
    for (const needle of ["'Content-Type':'text/plain;charset=utf-8'", "api('retryReceipt'", "api('retryOrderEmails'", 'function csvValue(', 'function newProductRequestId(', 'function productFingerprintKey(', 'secureImageUrl(', "api('revertPaid'", 'stock_loaded']) expect(admin).toContain(needle);
  });
  it('has unique static IDs and no inline handler built from data', () => {
    const ids = [...admin.split(/<script\b/i)[0].matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(admin).not.toMatch(/onclick="[^"]*\$\{/);
  });
  it('requires a price of at least 1 in the form', () => { expect(admin).toContain('id="pp" type="number" min="1"'); });
});

describe('generated preview', () => {
  const out = path.join(root, 'dist-test-preview.html');
  execFileSync('node', ['scripts/build-preview.mjs', out], { cwd: root });
  const preview = fs.readFileSync(out, 'utf8'); fs.rmSync(out);
  it('cannot reach the live API or Cloudinary', () => {
    expect(preview).not.toContain('fetch(');
    expect(preview).not.toContain('api.cloudinary.com');
    expect(preview).toContain('PREVIEW_ONLY_NO_LIVE_API');
    expect(preview).toContain('Preview mode');
    expect(preview).toContain('URL.createObjectURL(file)');
    scripts(preview).forEach((s) => expect(() => new Function(s)).not.toThrow());
  });
  it('cannot drift: every dashboard function exists in the preview', () => {
    const missing = [...fnNames(admin)].filter((n) => !fnNames(preview).has(n));
    expect(missing).toEqual([]);
  });
  it('mocks every protected action the dashboard calls', () => {
    const called = new Set([...admin.matchAll(/api\('([A-Za-z]+)'/g)].map((m) => m[1]));
    called.forEach((action) => expect(preview, action).toContain(`case '${action}'`));
  });
});

describe('build-admin script', () => {
  const good = { API_URL: 'https://script.google.com/macros/s/AKfycbABC123_-xyz/exec', CLOUDINARY_CLOUD: 'democloud', CLOUDINARY_PRESET: 'store_uploads' };
  it('injects client values and leaves no placeholder behind', () => {
    const html = renderAdmin(admin, resolveClientConfig(good, undefined));
    expect(html).toContain(good.API_URL); expect(html).toContain("CLOUD='democloud'"); expect(html).not.toMatch(/__[A-Z_]+__/);
    scripts(html).forEach((s) => expect(() => new Function(s)).not.toThrow());
  });
  it('refuses a missing, placeholder or non-Apps-Script configuration', () => {
    expect(() => resolveClientConfig({}, undefined)).toThrow(/API_URL/);
    expect(() => resolveClientConfig({ ...good, API_URL: 'https://evil.example/exec' }, undefined)).toThrow(/API_URL/);
    expect(() => resolveClientConfig({ ...good, CLOUDINARY_CLOUD: 'REPLACE_CLOUD_NAME' }, undefined)).toThrow(/CLOUDINARY_CLOUD/);
  });
});
