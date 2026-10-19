#!/usr/bin/env node
/**
 * Print the PR head branch for the signed-in guard. Stdout is only the branch.
 */
import { setTimeout } from 'node:timers/promises';
import { selectPreviewBranch } from './lib/portal-c-preview-branch.mjs';

const eventName = process.env.PORTAL_C_EVENT_NAME ?? '';
const sha = process.env.HEAD_SHA ?? '';
const BRANCH_RETRY_MS = 60_000;
const BRANCH_RETRY_INTERVAL_MS = 5_000;

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
    return [];
  }
  return response.json();
}

function selectBranch(commitPulls) {
  return selectPreviewBranch({
    eventName,
    eventBranch: process.env.PORTAL_C_EVENT_BRANCH ?? '',
    refName: process.env.GITHUB_REF_NAME ?? '',
    commitPulls,
    sha,
  });
}

const firstPulls = await commitPulls();
if (firstPulls === null) {
  /* configuration error already recorded */
} else {
  const deadline = eventName === 'deployment_status' ? Date.now() + BRANCH_RETRY_MS : Date.now();
  let pulls = firstPulls;
  while (true) {
    let branch = '';
    try {
      branch = selectBranch(pulls);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'branch resolution failed';
      console.error(`[portal-c-branch] ${message}`);
      process.exitCode = 2;
      break;
    }
    if (branch) {
      process.stdout.write(branch);
      break;
    }
    if (Date.now() >= deadline) {
      console.error('[portal-c-branch] could not resolve the PR head branch.');
      process.exitCode = 2;
      break;
    }
    await setTimeout(BRANCH_RETRY_INTERVAL_MS);
    const next = await commitPulls();
    if (next === null) break;
    pulls = next;
  }
}
