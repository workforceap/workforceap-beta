import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  signup: null as null | {
    orgType: string;
    serveArea: string | null;
    expectedMonthly: string | null;
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerSignupRequest: {
      findFirst: async () => state.signup,
    },
  },
}));

import {
  loadPartnerIntakeMetadata,
  partnerContactIncomplete,
} from '@/lib/partner/partnerIntakeMetadata';

describe('partner intake metadata', () => {
  beforeEach(() => {
    state.signup = null;
  });

  it('falls back to partner.organizationType when no signup row matches', async () => {
    const intake = await loadPartnerIntakeMetadata({
      name: 'Workforce Solutions Capital Area',
      contactEmail: 'partner@example.org',
      organizationType: 'Workforce board',
    });
    expect(intake).toEqual({
      orgType: 'Workforce board',
      serveArea: null,
      expectedMonthly: null,
      fromSignupRequest: false,
    });
  });

  it('surfaces orgType, serveArea, and expectedMonthly from the signup request', async () => {
    state.signup = {
      orgType: 'Nonprofit',
      serveArea: 'Travis County',
      expectedMonthly: '10–20',
    };
    const intake = await loadPartnerIntakeMetadata({
      name: 'Workforce Solutions Capital Area',
      contactEmail: 'partner@example.org',
      organizationType: null,
    });
    expect(intake).toEqual({
      orgType: 'Nonprofit',
      serveArea: 'Travis County',
      expectedMonthly: '10–20',
      fromSignupRequest: true,
    });
  });

  it('flags incomplete contact when any of name, email, or phone is blank', () => {
    expect(
      partnerContactIncomplete({
        contactName: 'Ada',
        contactEmail: 'ada@example.org',
        contactPhone: '5125550100',
      }),
    ).toBe(false);
    expect(
      partnerContactIncomplete({
        contactName: null,
        contactEmail: 'ada@example.org',
        contactPhone: '5125550100',
      }),
    ).toBe(true);
    expect(
      partnerContactIncomplete({
        contactName: 'Ada',
        contactEmail: '  ',
        contactPhone: '5125550100',
      }),
    ).toBe(true);
  });
});
