import { describe, expect, it } from 'vitest';
import {
  MEMBER_ACTIVITY_CAP,
  buildMemberActivityRows,
  humanizeActivityName,
} from '@/lib/admin/memberActivity';

/**
 * Admin member detail — Activity tab (wave 16). The tab merges staff audit
 * rows and the member's own events into one newest-first list; this pins the
 * labelling, ordering, actor fallback and cap so a data-shape change cannot
 * silently reorder or mislabel the trail.
 */
describe('humanizeActivityName', () => {
  it('turns audit actions and event names into sentence-case labels', () => {
    expect(humanizeActivityName('admin_feature_flag_update')).toBe('Feature flag update');
    expect(humanizeActivityName('career_plan_saved')).toBe('Career plan saved');
    expect(humanizeActivityName('member-profile-updated')).toBe('Profile updated');
    expect(humanizeActivityName('placementConfirmationSubmitted')).toBe('Placement confirmation submitted');
  });

  it('never returns an empty label', () => {
    expect(humanizeActivityName('')).toBe('Activity');
    expect(humanizeActivityName('   ')).toBe('Activity');
    expect(humanizeActivityName('admin_')).toBe('Activity');
  });
});

describe('buildMemberActivityRows', () => {
  const t = (iso: string) => new Date(iso);

  it('merges staff audit rows and member events newest first', () => {
    const rows = buildMemberActivityRows({
      auditRows: [
        { id: 'a1', action: 'admin_program_change', createdAt: t('2026-09-18T10:00:00Z'), actorName: 'Staff Person' },
        { id: 'a2', action: 'admin_counselor_assigned', createdAt: t('2026-09-20T09:00:00Z'), actorName: 'Other Staff' },
      ],
      eventRows: [
        { id: 'e1', eventName: 'career_plan_saved', createdAt: t('2026-09-19T12:00:00Z') },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['audit:a2', 'event:e1', 'audit:a1']);
    expect(rows[0]).toMatchObject({ kind: 'staff', label: 'Counselor assigned', actor: 'Other Staff' });
    expect(rows[1]).toMatchObject({ kind: 'member', label: 'Career plan saved', actor: 'Member' });
    expect(rows[2]).toMatchObject({ kind: 'staff', label: 'Program change', actor: 'Staff Person' });
  });

  it('falls back from actor name to e-mail snapshot to role snapshot to System', () => {
    const at = t('2026-09-20T09:00:00Z');
    const rows = buildMemberActivityRows({
      auditRows: [
        { id: 'n', action: 'x', createdAt: at, actorName: 'Named', actorEmailSnapshot: 'named@example.com' },
        { id: 'e', action: 'x', createdAt: at, actorName: null, actorEmailSnapshot: 'gone@example.com', actorRoleSnapshot: 'admin' },
        { id: 'r', action: 'x', createdAt: at, actorName: null, actorEmailSnapshot: null, actorRoleSnapshot: 'super_admin' },
        { id: 's', action: 'x', createdAt: at },
      ],
      eventRows: [],
    });
    const byId = new Map(rows.map((r) => [r.id, r.actor]));
    expect(byId.get('audit:n')).toBe('Named');
    expect(byId.get('audit:e')).toBe('gone@example.com');
    expect(byId.get('audit:r')).toBe('Super admin (account removed)');
    expect(byId.get('audit:s')).toBe('System');
  });

  it('caps the merged list (default MEMBER_ACTIVITY_CAP) keeping the newest rows', () => {
    const auditRows = Array.from({ length: 15 }, (_, i) => ({
      id: `a${i}`,
      action: 'x',
      createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
    }));
    const eventRows = Array.from({ length: 15 }, (_, i) => ({
      id: `e${i}`,
      eventName: 'y',
      createdAt: new Date(Date.UTC(2026, 1, 1 + i)),
    }));
    const rows = buildMemberActivityRows({ auditRows, eventRows });
    expect(MEMBER_ACTIVITY_CAP).toBe(20);
    expect(rows).toHaveLength(20);
    // All 15 February events outrank every January audit row; the 5 newest audit rows fill the rest.
    expect(rows.slice(0, 15).every((r) => r.kind === 'member')).toBe(true);
    expect(rows.slice(15).map((r) => r.id)).toEqual(['audit:a14', 'audit:a13', 'audit:a12', 'audit:a11', 'audit:a10']);

    expect(buildMemberActivityRows({ auditRows, eventRows, limit: 3 })).toHaveLength(3);
  });
});
