#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { describePreviewFailure, waitForPreviewDeployment } from './lib/portal-preview-deployment-gate.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
if (repository !== 'workforceap/workforceap-beta' || !/^[a-f0-9]{40}$/.test(sha ?? '')) {
  console.error('::error::Expected the canonical repository and full trusted SHA. No login attempted.');
  process.exit(2);
}
const controller = new AbortController();
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => controller.abort());
async function readApi(path) {
  // Explicit GET, fixed repository paths, finite request deadline; never log raw
  // API errors, URLs, descriptions or environment values that may contain secrets.
  const { stdout: output } = await execFileAsync('gh', ['api', '--method', 'GET', '--paginate', '--slurp', path], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    signal: controller.signal,
  });
  const pages = JSON.parse(output);
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error('Invalid API response');
  return pages.flat();
}
function configuredWindow(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 25 * 60_000) {
    throw new Error('Invalid polling window');
  }
  return Number(value);
}
try {
  const timeoutMs = configuredWindow('PORTAL_PREVIEW_BUILD_TIMEOUT_MS', 25 * 60_000);
  const outcome = await waitForPreviewDeployment({
    sha,
    registrationTimeoutMs: configuredWindow('PORTAL_PREVIEW_REGISTRATION_TIMEOUT_MS', timeoutMs),
    timeoutMs,
    signal: controller.signal,
    listDeployments: () => readApi(`repos/${repository}/deployments?sha=${sha}&environment=Preview&per_page=100`),
    listStatuses: (id) => readApi(`repos/${repository}/deployments/${id}/statuses?per_page=100`),
    log: (message) => console.log(message),
  });
  if (!outcome.ok) {
    console.error(`::error::${describePreviewFailure(outcome)}`);
    process.exitCode = 1;
  }
} catch {
  console.error('::error::Could not read trusted Preview deployment metadata (configuration, API access, timeout or invalid response). Check deployments:read permission and GitHub availability. No login attempted.');
  process.exitCode = 1;
}
