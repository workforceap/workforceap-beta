import { describe, expect, it } from 'vitest';
import {
  buildCounselorScopeOptions,
  resolveAdminRosterScope,
  rosterScopeToParam,
  ROSTER_SCOPE_ALL,
  ROSTER_SCOPE_MINE,
  ROSTER_SCOPE_UNASSIGNED,
} from '@/lib/counselor/rosterScope';

describe('counselor roster scope', () => {
  it('defaults admins to all counselors so the roster is not a dead end', () => {
    expect(resolveAdminRosterScope(undefined, null)).toEqual({ kind: 'all' });
    expect(resolveAdminRosterScope('all', 'c-1')).toEqual({ kind: 'all' });
  });

  it('resolves unassigned, mine, and counselor UUID scopes', () => {
    expect(resolveAdminRosterScope(ROSTER_SCOPE_UNASSIGNED, 'c-1')).toEqual({ kind: 'unassigned' });
    expect(resolveAdminRosterScope(ROSTER_SCOPE_MINE, 'c-1')).toEqual({
      kind: 'counselor',
      counselorId: 'c-1',
    });
    expect(resolveAdminRosterScope('6c323c10-403b-4e16-be01-4d588d849b4b', null)).toEqual({
      kind: 'counselor',
      counselorId: '6c323c10-403b-4e16-be01-4d588d849b4b',
    });
  });

  it('falls back to all for unknown scope values', () => {
    expect(resolveAdminRosterScope('not-a-scope', 'c-1')).toEqual({ kind: 'all' });
    expect(resolveAdminRosterScope(ROSTER_SCOPE_MINE, null)).toEqual({ kind: 'all' });
  });

  it('round-trips selected scope params for the selector', () => {
    expect(rosterScopeToParam({ kind: 'all' }, null)).toBe(ROSTER_SCOPE_ALL);
    expect(rosterScopeToParam({ kind: 'unassigned' }, null)).toBe(ROSTER_SCOPE_UNASSIGNED);
    expect(rosterScopeToParam({ kind: 'counselor', counselorId: 'c-1' }, 'c-1')).toBe(ROSTER_SCOPE_MINE);
    expect(rosterScopeToParam({ kind: 'counselor', counselorId: 'c-2' }, 'c-1')).toBe('c-2');
  });

  it('builds All / Unassigned / named counselor options with counts', () => {
    const options = buildCounselorScopeOptions({
      allCount: 139,
      unassignedCount: 12,
      ownCounselorId: 'c-mine',
      counselors: [
        { id: 'c-mine', fullName: 'Me Counselor', email: 'me@example.org', assignmentCount: 40 },
        { id: 'c-other', fullName: 'Other Counselor', email: 'other@example.org', assignmentCount: 99 },
      ],
    });
    expect(options.map((o) => o.label)).toEqual([
      'All counselors [139]',
      'Unassigned [12]',
      'My caseload [40]',
      'Other Counselor [99]',
    ]);
  });
});
