import { describe, expect, it } from 'vitest';
import {
  MEMBER_ACTIVITY_CAP,
  MEMBER_EVENT_LOAD_CAP,
  buildMemberActivityRows,
  formatActivityMetadata,
  humanizeActivityName,
  redactActivityMetadata,
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

describe('event details (entity + redacted metadata)', () => {
  it('redacts email / phone / token / password keys at any depth and formats pretty JSON', () => {
    const json = formatActivityMetadata({
      employerName: 'Acme',
      contactEmail: 'hr@acme.example',
      nested: { phone: '555-0100', ok: 1 },
      list: [{ accessToken: 'abc' }, 'plain'],
      PASSWORD: 'x',
    });
    expect(json).toContain('"employerName": "Acme"');
    expect(json).toContain('"contactEmail": "[redacted]"');
    expect(json).toContain('"phone": "[redacted]"');
    expect(json).toContain('"accessToken": "[redacted]"');
    expect(json).toContain('"PASSWORD": "[redacted]"');
    expect(json).toContain('"ok": 1');
    expect(json).not.toContain('hr@acme.example');
    expect(redactActivityMetadata(['a', { email: 'x' }])).toEqual(['a', { email: '[redacted]' }]);
  });

  it('returns null for missing or empty metadata', () => {
    expect(formatActivityMetadata(null)).toBeNull();
    expect(formatActivityMetadata(undefined)).toBeNull();
    expect(formatActivityMetadata({})).toBeNull();
    expect(formatActivityMetadata(7)).toBe('7');
  });

  it('attaches a detail block to member events that carry entity or metadata, never to staff rows', () => {
    const rows = buildMemberActivityRows({
      auditRows: [{ id: 'a1', action: 'admin_program_change', createdAt: new Date('2026-09-18T10:00:00Z'), actorName: 'Staff' }],
      eventRows: [
        { id: 'e1', eventName: 'placement_recorded', createdAt: new Date('2026-09-19T10:00:00Z'), entityType: 'PlacementRecord', entityId: 'pl-1', metadata: { employer: 'Acme' } },
        { id: 'e2', eventName: 'career_plan_saved', createdAt: new Date('2026-09-17T10:00:00Z'), entityType: null, entityId: null, metadata: {} },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['event:e1', 'audit:a1', 'event:e2']);
    expect(rows[0].detail).toEqual({ entityType: 'PlacementRecord', entityId: 'pl-1', metadata: '{\n  "employer": "Acme"\n}' });
    expect(rows[1].detail).toBeUndefined();
    expect(rows[2].detail).toBeUndefined();
    expect(MEMBER_EVENT_LOAD_CAP).toBe(100);
  });
});
