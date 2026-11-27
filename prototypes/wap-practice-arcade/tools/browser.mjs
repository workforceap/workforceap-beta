// Resolves playwright-core and launches headless chromium.
// Default: the machine's real GPU (D3D11 via ANGLE), so screenshots show the look players get.
// Set ARCADE_SOFTWARE_GL=1 (or pass {software: true}) for the slow software renderer.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const WORKTREES = 'C:/Users/mabro/workforceap-beta/.worktrees';

export function resolvePlaywright() {
  const tried = [];
  const env = process.env.PLAYWRIGHT_CORE;
  if (env) {
    tried.push(env);
    if (fs.existsSync(env)) return env;
  }
  try {
    for (const d of fs.readdirSync(WORKTREES).sort()) {
      const pnpm = path.join(WORKTREES, d, 'node_modules', '.pnpm');
      if (!fs.existsSync(pnpm)) continue;
      for (const e of fs.readdirSync(pnpm).sort()) {
        if (!e.startsWith('playwright-core@')) continue;
        const p = path.join(pnpm, e, 'node_modules', 'playwright-core');
        tried.push(p);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* fall through */ }
  throw new Error(
    'playwright-core not found. Set PLAYWRIGHT_CORE to a playwright-core folder, or install it under ' +
    `${WORKTREES}/*/node_modules/.pnpm/playwright-core@*/node_modules/playwright-core. Checked: ${tried.join('; ') || '(nothing)'}`
  );
}

export const GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'];
export const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function launch({ software = process.env.ARCADE_SOFTWARE_GL === '1' } = {}) {
  const dir = resolvePlaywright();
  const require = createRequire(path.join(dir, 'package.json'));
  const pw = require(dir);
  if (!software) {
    try {
      return await pw.chromium.launch({ headless: true, args: GPU_ARGS });
    } catch { /* fall back to software rendering */ }
  }
  return pw.chromium.launch({ headless: true, args: SOFTWARE_ARGS });
}

// The WebGL renderer string the page really gets (for example "ANGLE (NVIDIA, ... Direct3D11 ...)" on a GPU, or
// "... SwiftShader ..." on the software path). Pass any playwright page; about:blank is enough.
export async function glRenderer(page) {
  return page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch { return null; }
  });
}

export const isSoftwareRenderer = (s) => /swiftshader|llvmpipe|software|basic render/i.test(String(s || ''));
