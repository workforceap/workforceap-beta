#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function appBuildScriptForEnvironment(vercelEnv) {
  if (vercelEnv === 'production') return 'build:with-migrate';
  if (vercelEnv === 'preview') return 'build:preview';
  throw new Error(`Unsupported VERCEL_ENV=${vercelEnv || '(unset)'}.`);
}

function runNpm(args, cwd, spawn = spawnSync) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawn(executable, args, {
    cwd,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`npm ${args.join(' ')} failed with status ${result.status ?? 1}.`);
  }
}

function copyMarketingBuild(repoRoot) {
  const source = path.join(repoRoot, 'marketing', 'dist');
  const destination = path.join(repoRoot, 'public');
  if (!fs.existsSync(source)) {
    throw new Error('Marketing build output is missing.');
  }
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
  // /blog is CMS-backed Next output. Remove stale generated HTML from prior
  // builds as well as any accidental Astro overlap, while keeping images/blog.
  for (const locale of ['', 'en', 'es', 'fr', 'pt']) {
    fs.rmSync(path.join(destination, locale, 'blog'), { recursive: true, force: true });
    fs.rmSync(path.join(destination, locale, 'blog.html'), { force: true });
  }
}

function main() {
  const appBuildScript = appBuildScriptForEnvironment(process.env.VERCEL_ENV);
  console.log(`[vercel-build] environment=${process.env.VERCEL_ENV} app=${appBuildScript}`);

  if (process.argv.includes('--check')) {
    console.log('[vercel-build] routing check passed; no build command executed.');
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const marketingRoot = path.join(repoRoot, 'marketing');
  runNpm(['ci', '--no-audit', '--no-fund'], marketingRoot);
  runNpm(['run', 'build'], marketingRoot);
  copyMarketingBuild(repoRoot);
  runNpm(['run', appBuildScript], repoRoot);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[vercel-build] BLOCKED: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  appBuildScriptForEnvironment,
  copyMarketingBuild,
  main,
  runNpm,
};
