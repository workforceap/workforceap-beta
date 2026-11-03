import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const sha = process.env.HEAD_SHA ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';
if (!/^[a-f0-9]{40}$/.test(sha) || repository !== 'workforceap/workforceap-beta') throw new Error('Expected a WorkforceAP commit.');
const deadline = Date.now() + 25 * 60_000;
while (Date.now() < deadline) {
  const deployments = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/deployments?sha=${sha}&environment=Preview&per_page=20`], { encoding: 'utf8' }));
  for (const deployment of deployments.filter(d => d.creator?.login === 'vercel[bot]')) {
    const statuses = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/deployments/${deployment.id}/statuses?per_page=5`], { encoding: 'utf8' }));
    const latest = statuses[0];
    if (latest?.state !== 'success') continue;
    const url = new URL(latest.environment_url ?? latest.target_url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.origin !== url.href.replace(/\/$/, '')) continue;
    process.stdout.write(url.origin);
    process.exit(0);
  }
  await setTimeout(20_000);
}
throw new Error('No successful exact-commit Preview was published within 25 minutes.');
