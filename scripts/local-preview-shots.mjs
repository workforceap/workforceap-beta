#!/usr/bin/env node
/**
 * Screenshots the admin attendance pages and both draft PDFs (PNG at 180 dpi) from a RUNNING
 * local preview (`npm run preview:local`). Output goes OUTSIDE the repo
 * (default ~/.wap-preview-local/out/shots, override with --out <dir>).
 *
 * Refuses any base URL that is not localhost / 127.0.0.1 / ::1 on the preview port.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const OUT = resolve(arg('--out', join(homedir(), '.wap-preview-local', 'out', 'shots')));
if (OUT.startsWith(ROOT)) { console.error('shots: output dir must be outside the repo'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const example = Object.fromEntries(readFileSync(join(ROOT, '.env.preview.local.example'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const BASE = arg('--base', `http://localhost:${example.PREVIEW_APP_PORT}`);
const u = new URL(BASE);
if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || Number(u.port) !== Number(example.PREVIEW_APP_PORT)) {
  console.error('shots: refusing a base URL that is not the local preview'); process.exit(1);
}

const state = JSON.parse(readFileSync(join(homedir(), '.wap-preview-local', 'state.json'), 'utf8'));
const fx = JSON.parse(readFileSync(join(ROOT, 'prisma', 'fixtures', 'preview-attendance.json'), 'utf8'));
const { chromium } = require(join(ROOT, 'node_modules', '@playwright', 'test'));

function findPkg(prefix, rel) {
  const dir = join(ROOT, 'node_modules', '.pnpm');
  const hit = readdirSync(dir).find((d) => d.startsWith(prefix));
  return hit ? join(dir, hit, 'node_modules', rel) : null;
}
const pdfjsPath = findPkg('pdfjs-dist@', 'pdfjs-dist/legacy/build/pdf.mjs');
const canvasPath = findPkg('@napi-rs+canvas@', '@napi-rs/canvas');
if (!pdfjsPath || !canvasPath) { console.error('shots: pdfjs-dist or @napi-rs/canvas missing from node_modules'); process.exit(1); }
const { getDocument } = await import(pathToFileURL(pdfjsPath).href);
const fontDir = join(dirname(dirname(dirname(pdfjsPath))), 'standard_fonts') + '/';
const { createCanvas } = require(canvasPath);

/** PDF bytes -> one PNG per page at `dpi`. */
async function pdfToPngs(bytes, baseName, dpi = 180) {
  const doc = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: fontDir, useSystemFonts: false, disableFontFace: true }).promise;
  const files = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const file = join(OUT, `${baseName}-p${n}.png`);
    writeFileSync(file, canvas.toBuffer('image/png'));
    files.push(file);
  }
  await doc.destroy();
  return files;
}

const isoDate = (d) => d.toISOString().slice(0, 10);
const monday = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; })();
const rowsFor = () => fx.weeklyEntries.map((e) => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + e.dayOffset); return { date: isoDate(d), ...(e.code ? { code: e.code } : { minutes: e.minutes }) }; });
const executablePath = (() => {
  const root = join(process.env.LOCALAPPDATA || join(homedir(), '.cache'), 'ms-playwright');
  const want = chromium.executablePath();
  if (existsSync(want)) return want;
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) for (const sub of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']) { const f = join(root, d, sub); if (existsSync(f)) return f; }
  return undefined;
})();

const written = [];
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  const login = await context.request.post(`${BASE}/api/auth/login`, { data: { email: example.PREVIEW_ADMIN_EMAIL, password: example.PREVIEW_ADMIN_PASSWORD, rememberMe: true }, maxRedirects: 0 });
  if (![200, 302, 303, 307].includes(login.status())) throw new Error(`admin login failed (HTTP ${login.status()})`);

  const shot = async (name) => { const file = join(OUT, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); written.push(file); };

  // 1. Admin draft page: empty, then filled and generated (the real admin route, real DB enrollment).
  await page.goto(`${BASE}/admin/attendance/draft`, { waitUntil: 'networkidle', timeout: 180000 });
  await shot('01-admin-attendance-draft-empty');
  const student = { enrollmentId: state.enrollments.find((e) => e.email === example.PREVIEW_STUDENT_EMAIL).id };
  await page.getByLabel('Enrollment ID').fill(student.enrollmentId);
  await page.getByLabel('Date in period (YYYY-MM-DD)').fill(rowsFor()[0].date);
  const rows = rowsFor();
  for (let i = 1; i < rows.length; i++) await page.getByRole('button', { name: 'Add day' }).click();
  for (let i = 0; i < rows.length; i++) {
    await page.getByLabel('Date', { exact: true }).nth(i).fill(rows[i].date);
    if (rows[i].code) await page.getByLabel('Code instead of minutes').nth(i).selectOption(rows[i].code);
    else await page.getByLabel('Minutes attended').nth(i).fill(String(rows[i].minutes));
  }
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/admin/attendance/draft-pdf'), { timeout: 120000 }),
    page.getByRole('button', { name: 'Generate draft PDF' }).click(),
  ]);
  if (resp.status() !== 200) throw new Error(`admin draft PDF returned HTTP ${resp.status()} ${await resp.text()}`);
  // The browser already consumed the response body, so re-request the same PDF with the session.
  const again = await context.request.post(`${BASE}/api/admin/attendance/draft-pdf`, { data: { enrollmentId: student.enrollmentId, kind: 'weekly', selectedDate: rows[0].date, rows } });
  if (again.status() !== 200) throw new Error(`admin draft PDF re-request returned HTTP ${again.status()}`);
  const weeklyPdf = await again.body();
  await page.waitForTimeout(1500);
  await shot('02-admin-attendance-draft-generated');
  writeFileSync(join(OUT, 'draft-weekly-admin.pdf'), weeklyPdf);
  written.push(...(await pdfToPngs(weeklyPdf, 'pdf-weekly-admin-180dpi')));

  // 2. The other attendance page that exists in this build: the local synthetic demo.
  await page.goto(`${BASE}/dev/attendance-synthetic`, { waitUntil: 'networkidle', timeout: 180000 });
  await shot('03-dev-attendance-synthetic');

  // 3. Yearly draft PDF. The admin route cannot render yearly (no enrollment start month is stored),
  //    so the yearly sheet comes from the synthetic route, which carries startMonth 8.
  const ids = { organizationId: '00000000-0000-4000-8000-000000000003', memberId: '00000000-0000-4000-8000-000000000001', enrollmentId: '00000000-0000-4000-8000-000000000005' };
  const post = (data) => context.request.post(`${BASE}/api/dev/attendance-synthetic`, { data: { ...ids, ...data } });
  const imported = await post({ action: 'import', expectedRevision: 0, rows: rows.filter((r) => r.minutes !== undefined).map((r, i) => ({ sourceKey: `preview-${i}`, date: r.date, kind: 'verified-duration', minutes: r.minutes, reference: 'synthetic-only', reason: 'Synthetic preview entry' })) });
  if (imported.status() !== 200 && imported.status() !== 409) throw new Error(`synthetic import returned HTTP ${imported.status()}`);
  for (const kind of ['weekly', 'yearly']) {
    const r = await post({ action: 'preview', kind, selectedDate: rows[0].date });
    if (r.status() !== 200) throw new Error(`synthetic ${kind} preview returned HTTP ${r.status()}`);
    const pdf = Buffer.from((await r.json()).pdfBase64, 'base64');
    writeFileSync(join(OUT, `draft-${kind}-synthetic.pdf`), pdf);
    written.push(...(await pdfToPngs(pdf, `pdf-${kind}-synthetic-180dpi`)));
  }
} finally {
  await browser.close();
}

console.log(`screenshots written to ${OUT}:`);
for (const f of written) console.log(`  ${f}`);
