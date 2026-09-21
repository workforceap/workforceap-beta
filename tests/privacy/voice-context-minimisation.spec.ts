/**
 * WAP-173 — the WIOA prequal voice context handed to ElevenLabs carries program
 * framing only. The member's screening answers never leave the database.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: {
    id: 'member-1',
    fullName: 'Fixture Member',
    email: 'member@example.test',
    phone: '512-555-0100',
    enrolledProgram: null,
    interviewEligible: true,
    organization: { name: 'Fixture Org', slug: 'fixture-org' },
    wioaQualificationJson: {
      version: 2,
      submittedAt: '2026-09-01T00:00:00Z',
      signal: 'likely',
      reasons: [{ code: 'low_income' }, { code: 'barrier', params: { barrier: 'housing' } }],
      answers: {
        ageBracket: '25_54',
        countyOrZip: 'Travis',
        primaryBarrier: 'housing',
        dislocatedWorker: true,
        lowIncomeSelfReport: true,
        trainingInterest: true,
        completedIntakeSelfReport: false,
        publicAssistanceSelfReport: true,
        publicAssistancePrograms: ['snap'],
        publicAssistanceHelpRequested: true,
      },
    },
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: async () => structuredClone(h.user) } } }));
vi.mock('@/lib/coach/memory', () => ({ getCoachMemoryDynamicVariables: async () => ({}) }));
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: () => null }));
vi.mock('@/lib/auth/roles', () => ({ getCounselorForUser: async () => null, getEmployerForUser: async () => null, getPartnerForUser: async () => null }));

import {
  buildPublicWioaPortalDynamicVariables,
  fetchMemberPortalDynamicVariables,
  fetchWioaPortalDynamicVariables,
} from '@/lib/ai/elevenlabsPortalContext';

/** Any key that would carry a screening answer or its derived signal. */
const ANSWER_KEY = /barrier|dislocated|income|assistance|signal|age_bracket|county|intake|training_interest|reasons/i;
/** Answer values from the fixture snapshot; none may appear anywhere in the context. */
const ANSWER_VALUES = ['housing', 'likely', 'Travis', '25_54', 'snap', 'low_income'];

describe('WIOA prequal voice context (WAP-173)', () => {
  it('keeps program framing and drops every screening answer', async () => {
    const vars = await fetchWioaPortalDynamicVariables('member-1');
    expect(vars).toMatchObject({
      member_name: 'Fixture Member',
      organization_name: 'Fixture Org',
      organization_slug: 'fixture-org',
      interview_eligible: 'true',
      wioa_program_name: 'Workforce Innovation and Opportunity Act (WIOA)',
      wioa_pronunciation: 'W. I. O. A.',
      site_name: 'WorkforceAP',
    });
    const answerKeys = Object.keys(vars).filter((key) => ANSWER_KEY.test(key));
    expect(answerKeys).toEqual([]);
    const serialized = JSON.stringify(vars);
    for (const value of ANSWER_VALUES) expect(serialized).not.toContain(value);
    expect(serialized).not.toContain('member@example.test');
    expect(serialized).not.toContain('512-555-0100');
  });

  it('sends no wioa_* answer keys from the general member context either', async () => {
    const vars = await fetchMemberPortalDynamicVariables('member-1');
    expect(Object.keys(vars).filter((key) => key.startsWith('wioa_'))).toEqual([]);
    expect(Object.keys(vars).filter((key) => ANSWER_KEY.test(key))).toEqual([]);
    expect(vars.member_name).toBe('Fixture Member');
  });
});

describe('public WIOA prequal voice context', () => {
  const form = {
    fullName: 'Jamie Lee Student',
    email: 'jamie@example.test',
    phone: '512-555-0199',
    countyOrZip: 'Travis County',
  };

  it('hands the vendor a first name only: no email, phone or county', () => {
    const vars = buildPublicWioaPortalDynamicVariables(form);
    expect(vars).toEqual({
      site_name: 'WorkforceAP',
      support_context: expect.any(String),
      member_name: 'Jamie',
      wioa_public_screening: 'true',
      wioa_program_name: 'Workforce Innovation and Opportunity Act (WIOA)',
      wioa_pronunciation: 'W. I. O. A.',
    });
    const serialized = JSON.stringify(vars);
    for (const value of ['jamie@example.test', '512-555-0199', 'Travis', 'Lee Student']) {
      expect(serialized).not.toContain(value);
    }
    for (const key of Object.keys(vars)) expect(key).not.toMatch(/email|phone|county|zip/i);
  });

  it('tolerates a missing or blank name', () => {
    expect(buildPublicWioaPortalDynamicVariables().member_name).toBe('');
    expect(buildPublicWioaPortalDynamicVariables({ fullName: '   ' }).member_name).toBe('');
  });
});
