// @vitest-environment node
/**
 * The partner attention timeline names each event's actor. A member-reported
 * placement is written with the member as actor, so a minor hidden from the
 * partner (lib/partner/dataAccess.ts) would appear there by full name. New
 * events are no longer written for a hidden member (placementAction.ts); the
 * read also leaves out rows already written with a hidden member as actor.
 *
 * The Prisma fake evaluates the exact `where` against fixture rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => {
  const actor = (fullName: string, profile: Record<string, unknown> | null) => ({ fullName, email: null, profile });
  const events = [
    { id: 'ev-staff', partnerId: 'partner-1', actor: actor('Partner Staff', { isMinor: false, dob: null, ferpaConsentGiven: false }) },
    { id: 'ev-hidden-minor', partnerId: 'partner-1', actor: actor('Hidden Minor', { isMinor: true, dob: null, ferpaConsentGiven: false }) },
    { id: 'ev-consented-minor', partnerId: 'partner-1', actor: actor('Consented Minor', { isMinor: true, dob: null, ferpaConsentGiven: true }) },
    { id: 'ev-no-profile', partnerId: 'partner-1', actor: actor('No Profile', null) },
    { id: 'ev-no-actor', partnerId: 'partner-1', actor: null },
    { id: 'ev-other-partner', partnerId: 'partner-2', actor: actor('Other', null) },
  ];
  return { events };
});

vi.mock('@/lib/db/prisma', async () => {
  const { matchesWhere } = await import('@/tests/helpers/prismaWhereMatches');
  return {
    prisma: {
      portalWorkflowEvent: {
        findMany: vi.fn(async ({ where }: { where: unknown }) => fx.events.filter((e) => matchesWhere(e, where))),
      },
    },
  };
});

import { listPartnerWorkflowEvents } from '@/lib/portal/workflowEvents';
import { partnerDataAccess } from '@/lib/partner/dataAccess';

beforeEach(() => vi.clearAllMocks());

describe('listPartnerWorkflowEvents and hidden members', () => {
  it.each(['community', 'referral'])('a %s partner never sees an event whose actor is a hidden minor', async (partnerType) => {
    const rows = await listPartnerWorkflowEvents('partner-1', 30, partnerDataAccess({ partnerType }));
    expect(rows.map((r) => r.id)).toEqual(['ev-staff', 'ev-consented-minor', 'ev-no-profile', 'ev-no-actor']);
  });

  it('a high-school partner keeps every event', async () => {
    const rows = await listPartnerWorkflowEvents('partner-1', 30, partnerDataAccess({ partnerType: 'high_school' }));
    expect(rows.map((r) => r.id)).toContain('ev-hidden-minor');
    expect(rows).toHaveLength(5);
  });
});
