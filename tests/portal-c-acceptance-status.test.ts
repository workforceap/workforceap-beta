import { describe, expect, it, vi } from 'vitest';
import { PORTAL_C_ACCEPTANCE_JOBS, latestPortalCAcceptanceRun, portalCAcceptanceStatus } from '../scripts/lib/portal-c-acceptance-status.mjs';
import { main, readPortalCAcceptance } from '../scripts/portal-c-acceptance-status.mjs';

const sha = 'a'.repeat(40);
const repository = 'workforceap/workforceap-beta';
const run = (id: number, event = 'deployment_status', head_sha = sha) => ({ id, event, head_sha, head_repository: { full_name: repository } });
const green = () => Object.fromEntries(Object.entries(PORTAL_C_ACCEPTANCE_JOBS).map(([kind, names]) => [kind, names.map(name => ({ name, status: 'completed', conclusion: 'success' }))]));

describe('truthful Portal C aggregate status', () => {
  it('requires registry, harness, authenticated member/mentor, and staff comparison together', () => {
    expect(portalCAcceptanceStatus(green()).state).toBe('success');
    const lanes = green();
    lanes.safety = [lanes.safety[1]];
    expect(portalCAcceptanceStatus(lanes).state).toBe('pending');
  });
  it.each(['skipped', 'neutral', null])('keeps incomplete or non-passing acceptance pending: %s', conclusion => {
    const lanes = green();
    Object.assign(lanes.staff[0], { conclusion });
    expect(portalCAcceptanceStatus(lanes).state).toBe('pending');
  });
  it.each(['failure', 'cancelled', 'timed_out', 'action_required'])('keeps a failed acceptance lane red: %s', conclusion => {
    const lanes = green();
    Object.assign(lanes.safety[2], { conclusion });
    expect(portalCAcceptanceStatus(lanes).state).toBe('failure');
  });
  it('selects the latest exact-head acceptance run and ignores registry-only PR runs and foreign heads', () => {
    const runs = [run(1), run(2), run(3, 'pull_request'), run(4, 'deployment_status', 'b'.repeat(40)), { ...run(5), head_repository: { full_name: 'foreign/repo' } }];
    expect(latestPortalCAcceptanceRun(runs, sha, 'safety')?.id).toBe(2);
    expect(latestPortalCAcceptanceRun(runs, sha, 'staff')?.id).toBe(3);
  });
  it('allows only the current staff run to report its final step, without overriding a newer run', () => {
    const lanes = green();
    const api = (path: string) => path.includes('/workflows/dev-') ? { workflow_runs: [run(1)] }
      : path.includes('/workflows/portal-') ? { workflow_runs: [run(2, 'pull_request')] }
        : { jobs: path.includes('/runs/1/') ? lanes.safety : [{ ...lanes.staff[0], status: 'in_progress', conclusion: null }] };
    expect(readPortalCAcceptance({ repository, sha, ownRunId: '2', ownStaffResult: 'success' }, api).state).toBe('success');
    expect(readPortalCAcceptance({ repository, sha, ownRunId: '1', ownStaffResult: 'success' }, api).state).toBe('pending');
    expect(readPortalCAcceptance({ repository, sha, ownRunId: '2', ownStaffResult: 'failure' }, api).state).toBe('failure');
  });
  it('replaces a stale green status with an error when job evidence cannot be read', () => {
    const posted: unknown[] = [];
    const exec = vi.fn((_command: string, args: string[], options: { input?: string }) => {
      if (args.includes('POST')) { posted.push(JSON.parse(options.input ?? '{}')); return '{}'; }
      throw new Error('private diagnostic must not be published');
    });
    expect(() => main({ NODE_ENV: 'test', GITHUB_REPOSITORY: repository, PORTAL_C_STATUS_SHA: sha, GITHUB_RUN_ID: '7' }, exec)).toThrow('could not be verified');
    expect(posted).toEqual([expect.objectContaining({ context: 'Portal C safety net', state: 'error' })]);
    expect(JSON.stringify(posted)).not.toContain('private diagnostic');
    exec.mockClear();
    expect(() => main({ NODE_ENV: 'test', GITHUB_REPOSITORY: repository, PORTAL_C_STATUS_SHA: 'short' }, exec)).toThrow('exact WorkforceAP commit');
    expect(exec).not.toHaveBeenCalled();
  });
});
