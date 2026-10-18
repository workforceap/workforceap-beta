#!/usr/bin/env node
/**
 * Print the PR head branch for the signed-in guard. Stdout is only the branch.
 */
import { selectPreviewBranch } from './lib/portal-c-preview-branch.mjs';

const eventName = process.env.PORTAL_C_EVENT_NAME ?? '';
const sha = process.env.HEAD_SHA ?? '';

async function commitPulls() {
  if (eventName !== 'deployment_status') return [];
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GH_TOKEN ?? '';
  if (!repository || !token || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error('[portal-c-branch] GitHub token, repository, and HEAD_SHA are required.');
    process.exitCode = 2;
    return null;
  }
  const response = await fetch(
    `https://api.github.com/repos/${repository}/commits/${sha}/pulls`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'workforceap-portal-c',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) {
    console.error(`[portal-c-branch] commit pulls lookup failed (${response.status}).`);
    process.exitCode = 2;
    return null;
  }
  return response.json();
}

const pulls = await commitPulls();
if (pulls === null) {
  /* exit code already set */
} else {
  let branch = '';
  try {
    branch = selectPreviewBranch({
      eventName,
      eventBranch: process.env.PORTAL_C_EVENT_BRANCH ?? '',
      refName: process.env.GITHUB_REF_NAME ?? '',
      commitPulls: pulls,
      sha,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'branch resolution failed';
    console.error(`[portal-c-branch] ${message}`);
    process.exitCode = 2;
  }
  if (!process.exitCode && !branch) {
    console.error('[portal-c-branch] could not resolve the PR head branch.');
    process.exitCode = 2;
  }
  if (!process.exitCode) process.stdout.write(branch);
}
