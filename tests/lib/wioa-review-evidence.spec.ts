// @vitest-environment node
/**
 * Leftover from #2803: staff WIOA review uses a fingerprint of the loaded
 * evidence as an optimistic lock. Foreign-org apply rows must not enter that
 * fingerprint, and key order must not force a false 409.
 */
import { describe, expect, it } from 'vitest';
import { buildWioaReviewEvidence, type ApplyWioaReviewScreening } from '@/lib/wioa/reviewEvidence';

const snapshot = {
  version: 1 as const,
  signal: 'likely' as const,
  reasons: [] as string[],
  submittedAt: '2026-09-02T00:00:00.000Z',
  answers: {
    ageBracket: '25_54' as const,
    countyOrZip: '30301',
    primaryBarrier: 'none' as const,
    dislocatedWorker: false,
    lowIncomeSelfReport: false,
    trainingInterest: true,
    completedIntakeSelfReport: true,
  },
};

const apply = (overrides: Partial<ApplyWioaReviewScreening> = {}): ApplyWioaReviewScreening => ({
  id: 'apply-1',
  organizationId: 'org-1',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  q1: 'yes',
  q2: null,
  q3: null,
  qualifies: true,
  yesCount: 1,
  receivingUnemployment: null,
  exhaustedUnemployment: null,
  layoffCompany: null,
  snapWic: null,
  publicAssistancePrograms: [],
  publicAssistanceHelpRequested: null,
  ...overrides,
});

describe('buildWioaReviewEvidence', () => {
  it('returns nothing when neither a questionnaire nor a same-org apply row exists', () => {
    expect(buildWioaReviewEvidence(null, null, 'org-1')).toBeNull();
    expect(buildWioaReviewEvidence({ version: 1 }, null, 'org-1')).toBeNull();
    expect(buildWioaReviewEvidence(null, apply({ organizationId: 'org-2' }), 'org-1')).toBeNull();
  });

  it('keeps a same-org apply row when the questionnaire snapshot is unreadable', () => {
    const evidence = buildWioaReviewEvidence({ version: 1 }, apply(), 'org-1');
    expect(evidence?.snapshot).toBeNull();
    expect(evidence?.applyScreening?.q1).toBe('yes');
  });

  it('drops a foreign-org apply row even when a questionnaire is present', () => {
    const evidence = buildWioaReviewEvidence(snapshot, apply({ organizationId: 'org-2', layoffCompany: 'Foreign Plant' }), 'org-1');
    expect(evidence?.applyScreening).toBeNull();
    expect(evidence?.submittedAt).toBe(snapshot.submittedAt);
    expect(JSON.stringify(evidence)).not.toContain('Foreign Plant');
    expect(evidence?.revision).toBe(buildWioaReviewEvidence(snapshot, null, 'org-1')?.revision);
  });

  it('uses the apply createdAt when that is the only evidence', () => {
    const evidence = buildWioaReviewEvidence(null, apply(), 'org-1');
    expect(evidence?.snapshot).toBeNull();
    expect(evidence?.submittedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(evidence?.applyScreening?.q1).toBe('yes');
  });

  it('keeps the revision stable across apply key order and changes it when an answer changes', () => {
    const first = apply({ q1: 'yes', q2: 'no' });
    const reordered: ApplyWioaReviewScreening = {
      q2: first.q2, q1: first.q1, yesCount: first.yesCount, qualifies: first.qualifies,
      publicAssistanceHelpRequested: first.publicAssistanceHelpRequested,
      publicAssistancePrograms: first.publicAssistancePrograms, snapWic: first.snapWic,
      layoffCompany: first.layoffCompany, exhaustedUnemployment: first.exhaustedUnemployment,
      receivingUnemployment: first.receivingUnemployment, q3: first.q3,
      createdAt: first.createdAt, organizationId: first.organizationId, id: first.id,
    };
    const same = buildWioaReviewEvidence(snapshot, first, 'org-1')!.revision;
    expect(buildWioaReviewEvidence(snapshot, reordered, 'org-1')!.revision).toBe(same);
    expect(buildWioaReviewEvidence(snapshot, apply({ q1: 'no', q2: 'no' }), 'org-1')!.revision).not.toBe(same);
  });
});
