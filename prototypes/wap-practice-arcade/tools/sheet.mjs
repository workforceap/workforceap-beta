// Contact sheets of the per-level play screenshots, so a whole game can be judged at a glance.
// Usage: node tools/sheet.mjs <game-id ...> [--out dir]
//   Reads <evidence>/<game-id>/play-*-390.png and play-*-360.png (evidence = ARCADE_EVIDENCE or ROOT/evidence)
//   and writes sheet-390.png and sheet-360.png next to them (or into --out dir/<game-id>/ when given).
//   260 px wide thumbnails in rows, the level id under each. Built by loading the PNGs in a headless page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = process.env.ARCADE_EVIDENCE ? path.resolve(process.env.ARCADE_EVIDENCE) : path.join(ROOT, 'evidence');
const THUMB = 260;
const GAP = 14;
const MAX_COLS = 5;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function buildHtml(title, items) {
  const cols = Math.min(MAX_COLS, items.length);
  const width = cols * THUMB + (cols + 1) * GAP;
  const cells = items.map((it) => `<figure><img src="data:image/png;base64,${it.b64}" alt=""><figcaption>${esc(it.label)}</figcaption></figure>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#15171c;color:#e8eaf0;font:600 13px system-ui,Segoe UI,sans-serif}
    .wrap{width:${width}px;padding:${GAP}px;box-sizing:border-box}
    h1{margin:0 0 ${GAP}px;font-size:15px;font-weight:700;color:#aab0c0}
    .grid{display:flex;flex-wrap:wrap;gap:${GAP}px;align-items:flex-start}
    figure{margin:0;width:${THUMB}px}
    img{display:block;width:${THUMB}px;height:auto;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.5);background:#000}
    figcaption{margin-top:6px;text-align:center;overflow-wrap:anywhere}
  </style></head><body><div class="wrap"><h1>${esc(title)}</h1><div class="grid">${cells}</div></div></body></html>`;
}

async function sheetsFor(browser, id, outRoot) {
  const srcDir = path.join(EVIDENCE, id);
  if (!fs.existsSync(srcDir)) throw new Error(`no evidence folder for ${id}: ${srcDir} (run tools/smoke.mjs ${id} first)`);
  const outDir = outRoot ? path.join(outRoot, id) : srcDir;
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const w of ['390', '360']) {
    const re = new RegExp(`^play-(.+)-${w}\.png$`);
    const files = fs.readdirSync(srcDir).map((f) => ({ f, m: re.exec(f) })).filter((x) => x.m).sort((a, b) => a.f.localeCompare(b.f));
    if (!files.length) { console.log(`${id}: no play-*-${w}.png files, skipped sheet-${w}.png`); continue; }
    const items = files.map(({ f, m }) => ({ label: m[1], b64: fs.readFileSync(path.join(srcDir, f)).toString('base64') }));
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
    try {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: Math.min(MAX_COLS, items.length) * THUMB + (Math.min(MAX_COLS, items.length) + 1) * GAP, height: 800 });
      await page.setContent(buildHtml(`${id}  ${w}px play screens`, items));
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
      const out = path.join(outDir, `sheet-${w}.png`);
      await page.screenshot({ path: out, fullPage: true });
      written.push(out);
      console.log(`${id}: ${out} (${items.length} screens)`);
    } finally { await ctx.close(); }
  }
  return written;
}

async function main() {
  const argv = process.argv.slice(2);
  const ids = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out = path.resolve(argv[++i] || '');
    else if (a.startsWith('--out=')) out = path.resolve(a.slice(6));
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); return 2; }
    else ids.push(a);
  }
  if (!ids.length) { console.error('Usage: node tools/sheet.mjs <game-id ...> [--out dir]'); return 2; }
  const browser = await launch();
  let code = 0;
  try {
    for (const id of ids) {
      try { await sheetsFor(browser, id, out); } catch (e) { console.error(`FAIL ${id}: ${e.message}`); code = 1; }
    }
  } finally { await browser.close(); }
  return code;
}

main().then((c) => process.exit(c));
