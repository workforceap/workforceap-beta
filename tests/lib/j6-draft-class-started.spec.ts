import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn() }));

import {
  j6DraftBindsLatestClassStarted,
  latestAttestation,
  type CaseSnapshot,
} from '@/lib/billing/twoStage/api/caseData';
import type { J6Content } from '@/lib/billing/twoStage/content';

/**
 * #2736 refuses J6 sign when a newer class_started row supersedes the draft.
 * The HTTP suite covers freeze/sign 409s; this pins the shared binding check
 * so a later attestation sort change cannot silently re-bind a stale draft.
 */

const content = (attestationId: string) => ({ classStarted: { attestationId } }) as J6Content;

const row = (id: string, attestedAt: string) => ({
  id,
  kind: 'class_started' as const,
  attestedAt: new Date(attestedAt),
});

describe('j6DraftBindsLatestClassStarted', () => {
  it('is true only while the draft still names the newest class_started row', () => {
    const snapshot = {
      attestations: [
        row('att-old', '2026-10-01T00:00:00Z'),
        row('att-new', '2026-10-10T00:00:00Z'),
      ],
    } as Pick<CaseSnapshot, 'attestations'>;

    expect(latestAttestation(snapshot, 'class_started')?.id).toBe('att-new');
    expect(j6DraftBindsLatestClassStarted(content('att-new'), snapshot)).toBe(true);
    expect(j6DraftBindsLatestClassStarted(content('att-old'), snapshot)).toBe(false);
  });

  it('is false when class-start evidence is missing', () => {
    const snapshot = { attestations: [] } as Pick<CaseSnapshot, 'attestations'>;
    expect(latestAttestation(snapshot, 'class_started')).toBeNull();
    expect(j6DraftBindsLatestClassStarted(content('att-missing'), snapshot)).toBe(false);
  });

  it('ignores other attestation kinds when choosing the current class start', () => {
    const snapshot = {
      attestations: [
        { id: 'att-ready', kind: 'j5_readiness', attestedAt: new Date('2026-10-11T00:00:00Z') },
        row('att-start', '2026-10-01T00:00:00Z'),
      ],
    } as Pick<CaseSnapshot, 'attestations'>;
    expect(j6DraftBindsLatestClassStarted(content('att-start'), snapshot)).toBe(true);
    expect(j6DraftBindsLatestClassStarted(content('att-ready'), snapshot)).toBe(false);
  });
});
