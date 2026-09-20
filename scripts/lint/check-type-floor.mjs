#!/usr/bin/env node
/**
 * Type-floor guard (WAP-122): no literal text size below 13px on member,
 * public or staff surfaces.
 *
 * Scans product source (TSX/TS/JSX/JS, CSS, Astro, MDX) for literal font
 * sizes that resolve below 13px and fails when any remain:
 *
 *   - CSS / inline style strings: `font-size: 11px`, `font-size: .75rem`,
 *     `font: 700 12px/1 …`, `font-size: clamp(0.7rem, …)` (first argument),
 *     and `--*font-size*` / `--*type*` custom-property definitions.
 *   - React style objects and props: `fontSize: 12`, `fontSize: '11px'`,
 *     `fontSize: '0.75rem'`, `fontSize={10}`, SVG `font-size="11"`.
 *   - Tailwind arbitrary values with the `wa-` prefix: `wa-text-[11px]`.
 *
 * `rem` resolves against the 16px root. `em` and `%` are relative to the
 * parent and cannot be judged statically, so they are not flagged; prefer
 * `var(--wa-type-meta)` (13px) or `var(--wa-type-body)` over any literal
 * (docs/KIT_GUIDE.md §1 "Type floors"). Zero (`font-size: 0`, an icon-font
 * hiding technique) is not text and is ignored.
 *
 * Escape hatch: a line containing `type-floor-allow` is skipped. Use it only
 * for text that is genuinely not read (e.g. a print-only legal footer) and
 * say why in the same comment.
 *
 * Usage:
 *   node scripts/lint/check-type-floor.mjs          # report, exit 1 on findings
 *   node scripts/lint/check-type-floor.mjs --fix    # rewrite offending literals
 *                                                     to the 13px floor, then report
 *   node scripts/lint/check-type-floor.mjs --json   # machine-readable findings
 *
 * Wired into `npm run lint` so CI and local lint share one gate.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FLOOR_PX = 13;
const ROOT_FONT_PX = 16;
export const FLOOR_REM = `${FLOOR_PX / ROOT_FONT_PX}rem`; // 0.8125rem
export const ALLOW_MARKER = 'type-floor-allow';

/** Directories scanned, relative to the repo root. */
export const SCAN_ROOTS = ['app', 'components', 'lib', 'css', 'marketing/src'];
export const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.astro', '.mdx']);

/** Path segments (relative, posix) that are never scanned. */
const IGNORED_PATH_RE = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)marketing\/dist\//,
  /(^|\/)marketing\/src\/_archive\//,
  // Route handlers and mail templates emit PDFs / emails, not rendered pages.
  /^app\/api\//,
  /^lib\/email\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
];

const SIZE_RE_SRC = String.raw`(\d*\.?\d+)(px|rem)`;

/**
 * Convert a `<number><unit>` literal to px. Returns null when it cannot be
 * judged statically.
 */
export function toPx(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (unit === 'px' || unit === '') return n;
  if (unit === 'rem') return n * ROOT_FONT_PX;
  return null;
}

function floorLiteral(unit) {
  return unit === 'rem' ? FLOOR_REM : unit === 'px' ? `${FLOOR_PX}px` : String(FLOOR_PX);
}

/** Strip block comments and full-line `//` / ` * ` comments, preserving line count. */
function stripComments(source) {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlocks
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
    .join('\n');
}

/**
 * Patterns yielding { literal, value, unit, start, end } for the size literal
 * within a line. `end` is exclusive. Each pattern owns the exact span of the
 * literal so `--fix` can rewrite it in place.
 */
const LINE_PATTERNS = [
  // font-size: <value>  (CSS, Astro, inline style strings)
  {
    id: 'css-font-size',
    re: new RegExp(String.raw`font-size\s*:\s*(?!var\()`, 'gi'),
    extract(line, m) {
      const valueStart = m.index + m[0].length;
      const rest = line.slice(valueStart);
      const valueEnd = rest.search(/[;}"'`]|$/);
      const raw = rest.slice(0, valueEnd);
      // clamp(min, …): the floor is the first argument.
      const clamp = /^clamp\(\s*/.exec(raw);
      const target = clamp ? raw.slice(clamp[0].length) : raw;
      const offset = valueStart + (clamp ? clamp[0].length : 0);
      const size = new RegExp(String.raw`^${SIZE_RE_SRC}(?=\s*[,\)!]|\s*$|\s+[a-zA-Z!/])`).exec(target);
      if (!size) return null;
      return { value: size[1], unit: size[2], start: offset, end: offset + size[0].length };
    },
  },
  // font: 700 11px/1.2 Inter  (shorthand; first px/rem token is the size)
  {
    id: 'css-font-shorthand',
    re: /(?<![-\w])font\s*:\s*(?!var\()/gi,
    extract(line, m) {
      const valueStart = m.index + m[0].length;
      const rest = line.slice(valueStart);
      const valueEnd = rest.search(/[;}"'`]|$/);
      const raw = rest.slice(0, valueEnd);
      const size = new RegExp(String.raw`(?:^|\s)${SIZE_RE_SRC}(?=\s*\/|\s|$)`).exec(raw);
      if (!size) return null;
      const lead = size[0].length - size[1].length - size[2].length;
      const start = valueStart + size.index + lead;
      return { value: size[1], unit: size[2], start, end: start + size[1].length + size[2].length };
    },
  },
  // --wa-type-foo: 12px / --font-size-xs: 0.75rem (token definitions)
  {
    id: 'css-token-definition',
    re: new RegExp(String.raw`--[\w-]*(?:font-size|text-size|type)[\w-]*\s*:\s*${SIZE_RE_SRC}\s*(?=[;}]|$)`, 'gi'),
    extract(line, m) {
      const end = m.index + m[0].replace(/\s*$/, '').length;
      const start = end - m[1].length - m[2].length;
      return { value: m[1], unit: m[2], start, end };
    },
  },
  // fontSize: 12  |  fontSize: 12,  |  fontSize={12}
  {
    id: 'jsx-font-size-number',
    re: /\bfontSize\s*(?::|=\s*\{)\s*(\d*\.?\d+)(?=\s*[,}\s)\]])/g,
    extract(line, m) {
      const end = m.index + m[0].length;
      return { value: m[1], unit: '', start: end - m[1].length, end };
    },
  },
  // fontSize: '11px' | fontSize: "0.75rem" | font-size="11" | fontSize="11px"
  {
    id: 'jsx-font-size-string',
    re: new RegExp(String.raw`\b(?:fontSize|font-size)\s*(?::|=)\s*(['"])(\d*\.?\d+)(px|rem|)\1`, 'g'),
    extract(line, m) {
      const end = m.index + m[0].length - 1;
      return { value: m[2], unit: m[3], start: end - m[2].length - m[3].length, end };
    },
  },
  // wa-text-[11px] / wa-text-[0.75rem]
  {
    id: 'tailwind-arbitrary',
    re: new RegExp(String.raw`\bwa-text-\[${SIZE_RE_SRC}\]`, 'g'),
    extract(line, m) {
      const start = m.index + 'wa-text-['.length;
      return { value: m[1], unit: m[2], start, end: start + m[1].length + m[2].length };
    },
  },
];

/**
 * Scan one source string. Returns findings sorted by line/column, each
 * `{ line, column, literal, px, rule }`. When `fix` is true also returns the
 * rewritten source.
 */
export function scanSource(source, { fix = false } = {}) {
  const findings = [];
  const clean = stripComments(source);
  const lines = source.split('\n');
  const cleanLines = clean.split('\n');
  const out = fix ? [...lines] : null;

  for (let i = 0; i < cleanLines.length; i += 1) {
    const cleanLine = cleanLines[i];
    // The allow marker usually lives in a comment, so check the raw line.
    if (!cleanLine.trim() || lines[i].includes(ALLOW_MARKER)) continue;
    const edits = [];
    for (const pattern of LINE_PATTERNS) {
      pattern.re.lastIndex = 0;
      let m;
      while ((m = pattern.re.exec(cleanLine)) !== null) {
        const hit = pattern.extract(cleanLine, m);
        if (!hit) continue;
        const px = toPx(hit.value, hit.unit);
        if (px === null || px === 0 || px >= FLOOR_PX) continue;
        const literal = `${hit.value}${hit.unit}`;
        if (edits.some((e) => e.start === hit.start)) continue;
        edits.push({ ...hit, literal, px, rule: pattern.id });
      }
    }
    if (edits.length === 0) continue;
    edits.sort((a, b) => a.start - b.start);
    for (const e of edits) {
      findings.push({ line: i + 1, column: e.start + 1, literal: e.literal, px: e.px, rule: e.rule });
    }
    if (fix) {
      let rewritten = lines[i];
      for (const e of [...edits].reverse()) {
        rewritten = rewritten.slice(0, e.start) + floorLiteral(e.unit) + rewritten.slice(e.end);
      }
      out[i] = rewritten;
    }
  }
  return { findings, source: fix ? out.join('\n') : source };
}

function isIgnored(relPath) {
  return IGNORED_PATH_RE.some((re) => re.test(relPath));
}

export function listSourceFiles(root) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(abs);
        continue;
      }
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0 || !SCAN_EXTENSIONS.has(entry.name.slice(dot))) continue;
      if (isIgnored(rel)) continue;
      files.push(rel);
    }
  };
  for (const scanRoot of SCAN_ROOTS) {
    const abs = join(root, scanRoot);
    try {
      if (statSync(abs).isDirectory()) walk(abs);
    } catch {
      // optional root (e.g. marketing/src) absent in a sparse checkout
    }
  }
  return files.sort();
}

export function runCheck(root, { fix = false } = {}) {
  const results = [];
  for (const rel of listSourceFiles(root)) {
    const abs = join(root, rel);
    const before = readFileSync(abs, 'utf8');
    const { findings, source } = scanSource(before, { fix });
    if (findings.length === 0) continue;
    if (fix && source !== before) {
      writeFileSync(abs, source);
      // Re-scan so the report shows only what --fix could not rewrite.
      const after = scanSource(source).findings;
      if (after.length) results.push({ file: rel, findings: after, fixed: findings.length - after.length });
      else results.push({ file: rel, findings: [], fixed: findings.length });
      continue;
    }
    results.push({ file: rel, findings, fixed: 0 });
  }
  return results;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const fix = args.has('--fix');
  const json = args.has('--json');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const results = runCheck(root, { fix });
  const remaining = results.flatMap((r) => r.findings.map((f) => ({ file: r.file, ...f })));
  const fixed = results.reduce((n, r) => n + r.fixed, 0);

  if (json) {
    process.stdout.write(`${JSON.stringify({ floorPx: FLOOR_PX, fixed, findings: remaining }, null, 2)}\n`);
  } else {
    if (fix && fixed) console.log(`[type-floor] rewrote ${fixed} literal(s) to the ${FLOOR_PX}px floor`);
    for (const f of remaining) {
      console.error(`${f.file}:${f.line}:${f.column} ${f.literal} resolves to ${f.px}px (< ${FLOOR_PX}px) [${f.rule}]`);
    }
    if (remaining.length) {
      console.error(
        `\n[type-floor] FAIL — ${remaining.length} literal text size(s) below ${FLOOR_PX}px. ` +
          `Use var(--wa-type-meta) / var(--wa-type-body) or a ${FLOOR_PX}px+ literal (docs/KIT_GUIDE.md §1). ` +
          `Run \`node scripts/lint/check-type-floor.mjs --fix\` to raise them to the floor.`,
      );
    } else {
      console.log(`[type-floor] OK — no literal text size below ${FLOOR_PX}px in ${SCAN_ROOTS.join(', ')}.`);
    }
  }
  process.exit(remaining.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
