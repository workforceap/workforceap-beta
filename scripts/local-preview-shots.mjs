#!/usr/bin/env node
/**
 * Screenshots the admin attendance pages and the draft PDFs of a RUNNING local preview
 * (npm run preview:local). Output goes OUTSIDE the repo: PREVIEW_SHOTS_DIR, default
 * <os tmp>/wap-preview-shots. Run through tsx (npm run preview:local:shots) because the
 * yearly sheet is rendered in-process with the app's own renderer.
 * Only fake preview data is involved; the guard runs first.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { buildPreviewEnv } from './local-preview.mjs';
import { PREVIEW_ENTRIES, PREVIEW_LEARNERS, PREVIEW_SELECTED_DATE } from '../prisma/fixtures/preview-attendance';
import { createDraft, renderAuthorizedDraft } from '../lib/attendance/workflow';

const require = createRequire(import.meta.url);
const { assertLocalOnly } = require('./lib/local-only-guard.cjs');
const env = buildPreviewEnv();
assertLocalOnly(env);

const BASE = 'http://localhost:' + env.PREVIEW_WEB_PORT;
const OUT = resolve(process.env.PREVIEW_SHOTS_DIR || join(tmpdir(), 'wap-preview-shots'));
if (OUT.startsWith(resolve(process.cwd()) + '\\') || OUT.startsWith(resolve(process.cwd()) + '/')) throw new Error('PREVIEW_SHOTS_DIR must be outside the repo');
mkdirSync(OUT, { recursive: true });
const learner = PREVIEW_LEARNERS[1];
const rows = PREVIEW_ENTRIES.map((e) => ({ ...e }));
const written = [];

async function pdfToPng(bytes, base, dpi = 180) {
  const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await import(pathToUrl(pdfjsPath));
  const fontDir = require.resolve('pdfjs-dist/package.json').split(String.fromCharCode(92)).join('/').replace('package.json', 'standard_fonts/');
  const canvasPkg = createRequire(require.resolve('pdfjs-dist/package.json'))('@napi-rs/canvas');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: fontDir, verbosity: 0 }).promise;
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = canvasPkg.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const file = join(OUT, base + '-p' + n + '-' + dpi + 'dpi.png');
    writeFileSync(file, canvas.toBuffer('image/png'));
    written.push(file);
  }
}
function pathToUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE + '/login');
  const login = await context.request.post(BASE + '/api/auth/login', { data: { email: env.PREVIEW_ADMIN_EMAIL, password: env.PREVIEW_ADMIN_PASSWORD, rememberMe: true } });
  if (!login.ok()) throw new Error('admin login failed: ' + login.status());

  // 1. Admin draft page, empty and filled, driving the real form.
  await page.goto(BASE + '/admin/attendance/draft');
  await page.screenshot({ path: join(OUT, 'admin-attendance-draft-empty.png'), fullPage: true });
  written.push(join(OUT, 'admin-attendance-draft-empty.png'));
  await page.locator('label:has-text("Enrollment ID") input').fill(learner.enrollmentId);
  await page.getByLabel(/Date in period/).fill(PREVIEW_SELECTED_DATE);
  for (let i = 0; i < rows.length; i += 1) {
    if (i > 0) await page.getByRole('button', { name: 'Add day' }).click();
    await page.getByLabel('Date', { exact: true }).nth(i).fill(rows[i].date);
    if ('code' in rows[i]) await page.getByLabel('Code instead of minutes').nth(i).selectOption(rows[i].code);
    else await page.getByLabel('Minutes attended').nth(i).fill(String(rows[i].minutes));
  }
  await page.screenshot({ path: join(OUT, 'admin-attendance-draft-filled.png'), fullPage: true });
  written.push(join(OUT, 'admin-attendance-draft-filled.png'));
  await page.getByRole('button', { name: 'Generate draft PDF' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, 'admin-attendance-draft-generated.png'), fullPage: true });
  written.push(join(OUT, 'admin-attendance-draft-generated.png'));

  // 2. Other attendance surfaces that exist: the local synthetic demo page.
  const synth = await page.goto(BASE + '/dev/attendance-synthetic');
  await page.screenshot({ path: join(OUT, 'dev-attendance-synthetic.png'), fullPage: true });
  written.push(join(OUT, 'dev-attendance-synthetic.png'));
  console.log('dev/attendance-synthetic status ' + synth?.status());

  // 3. Draft PDFs. Weekly and monthly come from the live admin API; the admin form disables
  //    yearly (no enrollment start month is stored), so yearly uses the app's own renderer with
  //    the same seeded learner and an explicit start month of 9.
  for (const kind of ['weekly', 'monthly']) {
    const res = await context.request.post(BASE + '/api/admin/attendance/draft-pdf', {
      data: { enrollmentId: learner.enrollmentId, kind, selectedDate: PREVIEW_SELECTED_DATE, rows },
    });
    if (!res.ok()) throw new Error(kind + ' draft pdf failed: ' + res.status());
    const bytes = await res.body();
    const file = join(OUT, 'draft-' + kind + '.pdf');
    writeFileSync(file, bytes);
    written.push(file);
    await pdfToPng(bytes, 'draft-' + kind);
  }
  const actor = { userId: env.PREVIEW_ADMIN_ID, organizationId: '00000000-0000-4000-8000-000000000001', permissions: ['attendance:admin'] };
  const scope = { organizationId: actor.organizationId, memberId: learner.id, enrollmentId: learner.enrollmentId };
  const evidence = rows.map((r) => ('code' in r
    ? { date: r.date, kind: r.code, sourceKey: 'preview:' + r.date, reference: 'preview synthetic', reason: 'preview synthetic', verifiedBy: 'Preview Admin' }
    : { date: r.date, kind: 'verified-duration', minutes: r.minutes, sourceKey: 'preview:' + r.date, reference: 'preview synthetic', reason: 'preview synthetic', verifiedBy: 'Preview Admin' }));
  const draft = createDraft(actor, scope, {
    kind: 'yearly', selectedDate: PREVIEW_SELECTED_DATE, startMonth: 9,
    profile: { name: learner.fullName, email: learner.email, phone: learner.phone },
    enrollment: { program: 'IT Support Professional Certificate (synthetic)', programSlug: 'it-support-professional-certificate-ibm', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
    evidence: evidence.filter((e) => e.date >= '2026-09-01'),
  });
  const yearly = await renderAuthorizedDraft(actor, draft);
  writeFileSync(join(OUT, 'draft-yearly.pdf'), yearly);
  written.push(join(OUT, 'draft-yearly.pdf'));
  await pdfToPng(yearly, 'draft-yearly');
} finally {
  await browser.close();
}
console.log('Screenshots written outside the repo:\n' + written.map((f) => '  ' + f).join('\n'));
