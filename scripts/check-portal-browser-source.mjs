#!/usr/bin/env node
/** The repo TS/ESLint globs exclude .mts. Explicitly check the ESM browser suite. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const spec = 'tests/e2e/portal-browser-acceptance.spec.mts';
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--skipLibCheck', '--strict', '--allowJs', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', spec, 'playwright.portal-acceptance.config.ts'], { stdio: 'inherit', windowsHide: true });
// Feed unchanged source under the existing .ts lint rules; do not add a weaker config.
execFileSync(process.execPath, [join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js'), '--stdin', '--stdin-filename', spec.replace(/\.mts$/, '.ts')], { input: readFileSync(spec), stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
