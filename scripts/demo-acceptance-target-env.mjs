import { readFileSync, appendFileSync } from 'node:fs';
const preflight = JSON.parse(readFileSync('test-results/portal-acceptance/preflight.json', 'utf8'));
const origin = preflight.targets?.candidate?.origin;
const url = new URL(origin);
if (preflight.status !== 'passed' || preflight.identity?.deployedSha !== process.env.GITHUB_SHA ||
    url.origin !== origin || url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') ||
    !process.env.GITHUB_ENV) throw new Error('Verified immutable candidate origin is missing.');
appendFileSync(process.env.GITHUB_ENV, `PLAYWRIGHT_BASE_URL=${origin}\n`);
