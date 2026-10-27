import { createHash } from 'node:crypto';
import { canonical } from './demo-acceptance-journal.mjs';

/** An allowlist keeps database, Auth, provider and GitHub credentials out of both children. */
export function localFixtureEnvironment(env, sha, token) {
  if (!/^[a-f0-9]{40}$/.test(sha) || typeof token !== 'string' || token.length < 32) throw new Error('Explicit local source and capability required.');
  const child = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'CI', 'PLAYWRIGHT_BROWSERS_PATH'].filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
  return { ...child, NEXT_TELEMETRY_DISABLED: '1', VERCEL_GIT_COMMIT_SHA: sha,
    PORTAL_AUDIT_READ_ONLY_TOKEN: token, PORTAL_ACCEPTANCE_LOCAL_AUDIT_TOKEN: token };
}

export const localReceiptDigest = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyLocalExecution(execution, bytes, identity) {
  if (execution?.kind !== 'portal-local-fixture-execution' || execution.localContractOnly === true || execution.status !== 'completed' || execution.serverStopped !== true ||
      execution.sourceTreeClean !== true || execution.controlSha !== identity.controlSha || execution.controlSha !== identity.deployedSha ||
      canonical(execution.identity) !== canonical(identity) || execution.workflowRunId !== identity.workflowRunId || execution.workflowAttempt !== 1 ||
      execution.command !== 'node scripts/run-portal-local-fixtures.mjs' || execution.receiptDigest !== localReceiptDigest(bytes) ||
      !Number.isFinite(Date.parse(execution.startedAt)) || !Number.isFinite(Date.parse(execution.completedAt)) || Date.parse(execution.completedAt) < Date.parse(execution.startedAt)) {
    throw new Error('Local companion lacks matching same-run execution provenance.');
  }
  return true;
}
