/**
 * Mirrors how `next build` applies `outputFileTracingIncludes`
 * (next/dist/build/collect-build-traces.js): each key is a picomatch glob
 * tested with { dot: true, contains: true } against normalizeAppPath(entryName),
 * where entryName is the app entry such as `app/api/x/[id]/route`.
 *
 * It lists route file names only and never reads their text. It exists so a
 * test can prove that a key reaches its route and that the files the route reads
 * at runtime end up in its serverless bundle.
 */
import { readdirSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const picomatch = require('next/dist/compiled/picomatch');
const { normalizeAppPath } = require('next/dist/shared/lib/router/utils/app-paths');

const ENTRY_FILE = /^(route|page)\.(ts|tsx|js|jsx)$/;

/** True when `next build` would apply include `key` to app entry `entryName`. */
export function tracingKeyMatchesEntry(key, entryName) {
  return picomatch(key, { dot: true, contains: true })(normalizeAppPath(entryName));
}

/** App Router server entries under `<root>/app`, named the way the build trace step names them. */
export function listAppEntryNames(root) {
  const appDir = path.join(root, 'app');
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (ENTRY_FILE.test(entry.name)) {
        out.push(path.relative(root, full).split(path.sep).join('/').replace(/\.(ts|tsx|js|jsx)$/, ''));
      }
    }
  };
  walk(appDir);
  return out.sort();
}

/** Repo-relative files (forward slashes) that the includes add to `entryName`'s bundle. */
export async function tracedIncludeFiles(includes, entryName, root) {
  const files = new Set();
  for (const [key, patterns] of Object.entries(includes)) {
    if (!tracingKeyMatchesEntry(key, entryName)) continue;
    for (const pattern of patterns) {
      for await (const file of glob(pattern, { cwd: root })) files.add(file.split(path.sep).join('/'));
    }
  }
  return files;
}
