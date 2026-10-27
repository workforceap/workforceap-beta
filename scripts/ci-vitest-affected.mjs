#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPlan } from './ci-plan.mjs';
import { findSourceTextTests } from './verify-no-source-text-tests.mjs';

/** Every changed runtime file must have test ownership; partial coverage is not enough. */
export async function selectTests(runtimePaths, collect, always = []) {
  const files = new Set(always);
  if (!runtimePaths.length && !files.size) return { mode: 'full-required', files: [], reason: 'No proven documentation or disk-reader coverage' };
  try {
    for (const source of runtimePaths) {
      const owned = await collect(source);
      if (!Array.isArray(owned) || !owned.length || owned.some((file) => typeof file !== 'string' || !file)) {
        return { mode: 'full-required', files: [], reason: `No complete Vitest ownership for ${source}` };
      }
      for (const file of owned) files.add(file);
    }
    return { mode: 'affected', files: [...files].sort(), reason: 'Vitest dependency graph covers every changed runtime file' };
  } catch {
    return { mode: 'full-required', files: [], reason: 'Vitest collection failed' };
  }
}

// The Vite import graph cannot observe fs.readFile/glob inputs. Include these
// specs on EVERY child run, including documentation-only changes. This also
// retains the frozen source-text tests while their behavioral replacements land.
export function readsDisk(source) {
  return /(?:['"](?:node:)?fs(?:\/promises)?['"]|['"](?:fs-extra|graceful-fs|glob|globby|fast-glob)(?:\/[^'"]*)?['"]|\b(?:readFileSync|readFile|readdirSync|readdir|createReadStream|openSync|openAsBlob|globSync|glob)\s*\()/.test(source);
}

/** Follow the import graph from disk-reading helpers as well as specs. */
export async function collectDiskReaderTests({ files, read, collect, frozen = [] }) {
  const readers = files.filter((file) => readsDisk(read(file)));
  const dependents = readers.length ? await collect(readers) : [];
  if (!Array.isArray(dependents) || dependents.some((file) => typeof file !== 'string' || !file)) {
    throw new Error('Invalid disk-reader dependency evidence');
  }
  return [...new Set([...frozen, ...dependents])].sort();
}

/** A full-suite fallback here would still skip build/DB. Fail the whole child. */
export function executeSelection(selection, run) {
  if (selection.mode !== 'affected' || !selection.files.length) {
    console.error(`Affected validation cannot prove coverage: ${selection.reason}. Add the ci-full PR label to rerun CI with full Vitest, build and PostgreSQL gates.`);
    return 1;
  }
  return run(selection.files);
}

export async function main(env = process.env, cwd = process.cwd()) {
  const plan = readPlan(env, cwd);
  if (plan.mode !== 'affected') throw new Error('Affected job has no valid affected plan');
  let ctx;
  let selection;
  try {
    const { createVitest } = await import('vitest/node');
    ctx = await createVitest('test', { root: cwd, watch: false, run: true });
    const allSpecs = await ctx.globTestSpecifications();
    const frozenReaders = new Set(findSourceTextTests(cwd));
    const collect = async (sources) => {
      ctx.config.related = sources.map((source) => path.resolve(cwd, source).split(path.sep).join('/'));
      const specs = await ctx.getRelevantTestSpecifications();
      return specs.map((spec) => {
        const file = path.relative(cwd, spec.moduleId).split(path.sep).join('/');
        if (file.startsWith('../') || path.isAbsolute(file)) throw new Error('Test lies outside checkout');
        return file;
      });
    };
    const trackedCode = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .split('\0').filter((file) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file));
    const always = await collectDiskReaderTests({
      files: trackedCode,
      read: (file) => readFileSync(path.resolve(cwd, file), 'utf8'),
      collect,
      frozen: allSpecs.map((spec) => path.relative(cwd, spec.moduleId).split(path.sep).join('/')).filter((file) => frozenReaders.has(file)),
    });
    selection = await selectTests(plan.runtimePaths, (source) => collect([source]), always);
  } catch {
    selection = { mode: 'full-required', files: [], reason: 'Vitest initialization or disk-reader collection failed' };
  } finally {
    if (ctx) await ctx.close();
  }
  console.log(JSON.stringify(selection, null, 2));
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `\n## Child Vitest coverage\n\n${selection.mode}: ${selection.reason}. Selected ${selection.files.length} files.\n`);
  return executeSelection(selection, (files) => {
    const require = createRequire(import.meta.url);
    const cli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const result = spawnSync(process.execPath, [cli, 'run', ...files, '--passWithNoTests=false'], {
      cwd, env, stdio: 'inherit', timeout: 12 * 60 * 1000,
    });
    return result.status ?? 1;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
