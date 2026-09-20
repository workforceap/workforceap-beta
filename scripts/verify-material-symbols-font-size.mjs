#!/usr/bin/env node
/**
 * Ensures self-hosted Material Symbols woff2 stays small (bounded transfer budget)
 * and that the committed glyph subset covers every icon name used in source.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.join(__dirname, '../public/fonts/material-symbols-outlined.woff2');
const MAX_BYTES = 200 * 1024;

try {
  const st = fs.statSync(FONT_PATH);
  const n = st.size;
  if (n > MAX_BYTES) {
    console.error(
      `Material Symbols font is ${Math.round(n / 1024)} KB (limit ${Math.round(MAX_BYTES / 1024)} KB).\n` +
        `Subset with: npm run fonts:subset-material-symbols`,
    );
    process.exit(1);
  }
} catch {
  console.error(`Missing Material Symbols font: ${FONT_PATH}\nRun: npm run fonts:subset-material-symbols`);
  process.exit(1);
}

// Coverage: fail the build if source uses an icon the committed subset lacks
// (it would render as raw ligature text like FLIGHT_TAKEOFF in production).
try {
  execFileSync('node', [path.join(__dirname, 'extract-material-symbol-glyphs.mjs'), '--check'], {
    stdio: 'inherit',
  });
} catch {
  process.exit(1);
}

// WAP-110: and fail the build if the font comes back to the surfaces it was
// removed from — the twelve public funnel routes and the member shell. The
// legacy portal/admin trees are out of scope; see the guard's own header.
try {
  execFileSync('node', [path.join(__dirname, 'check-public-surface-icons.mjs')], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
