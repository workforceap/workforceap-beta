#!/usr/bin/env node
/** The repo TS/ESLint globs exclude .mts. Explicitly check the ESM browser suite. */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const spec = 'tests/e2e/portal-browser-acceptance.spec.mts';
// Retain the repository's alias resolution as the journal imports the canonical
// enrollment writer. Limit roots to this suite/config without weakening strictness.
const directory = mkdtempSync(join(tmpdir(), 'wap-portal-browser-source-'));
const config = join(directory, 'tsconfig.json');
try {
  writeFileSync(config, JSON.stringify({
    extends: resolve('tsconfig.json'),
    compilerOptions: { noEmit: true, skipLibCheck: true, strict: true, allowJs: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', incremental: false, composite: false, typeRoots: [resolve('node_modules/@types')] },
    files: [resolve(spec), resolve('playwright.portal-acceptance.config.ts')], include: [], exclude: [],
  }));
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', config], { stdio: 'inherit', windowsHide: true });
} finally { unlinkSync(config); rmdirSync(directory); }
// Feed unchanged source under the existing .ts lint rules; do not add a weaker config.
execFileSync(process.execPath, [join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js'), '--stdin', '--stdin-filename', spec.replace(/\.mts$/, '.ts')], { input: readFileSync(spec), stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
