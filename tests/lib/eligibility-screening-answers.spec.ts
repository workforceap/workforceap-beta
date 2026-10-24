// @vitest-environment node
/**
 * Leftover from #2845 / WAP-170: Application.notes and member export may only
 * claim screening is on file when an actual screening answer exists. Referral
 * and hear-about fields are collected on the same row but are not screening.
 */
import { describe, expect, it } from 'vitest';
import {
  eligibilityScreeningAnswerCount,
  eligibilityScreeningNotesPointer,
  hasEligibilityScreeningAnswers,
  hasEligibilityScreeningFields,
} from '@/lib/apply/eligibilityScreeningFields';

const pointer = 'Eligibility screening: on file (answers on the member record in admin, not in these notes)';

describe('eligibility screening answer classification', () => {
  it('does not treat referral-only fields as screening answers', () => {
    const referralOnly = {
      hearAbout: 'Community event',
      hearAboutOther: 'Career fair',
      partnerAmbassadorReferral: 'Example Ambassador',
    };
    expect(hasEligibilityScreeningFields(referralOnly)).toBe(true);
    expect(hasEligibilityScreeningAnswers(referralOnly)).toBe(false);
    expect(eligibilityScreeningNotesPointer(referralOnly)).toBeNull();
    expect(eligibilityScreeningAnswerCount(referralOnly)).toBe(3);
  });

  it.each([
    { q1: 'yes' },
    { q2: 'no' },
    { q3: 'yes' },
    { qualifies: false },
    { yesCount: 0 },
    { receivingUnemployment: 'yes' },
    { exhaustedUnemployment: 'no' },
    { layoffCompany: 'Example Plant' },
    { snapWic: 'yes' },
    { publicAssistancePrograms: ['snap'] },
    { publicAssistanceHelpRequested: 'yes' },
  ])('writes the notes pointer for screening evidence %j', (fields) => {
    expect(hasEligibilityScreeningAnswers(fields)).toBe(true);
    expect(eligibilityScreeningNotesPointer(fields)).toBe(pointer);
  });

  it('ignores empty program lists and blank counted answers', () => {
    expect(hasEligibilityScreeningAnswers({ publicAssistancePrograms: [], layoffCompany: '' })).toBe(false);
    expect(hasEligibilityScreeningFields({ publicAssistancePrograms: [], layoffCompany: '' })).toBe(false);
    expect(eligibilityScreeningNotesPointer({ publicAssistancePrograms: [] })).toBeNull();
    expect(eligibilityScreeningAnswerCount({ q1: '   ', layoffCompany: '', publicAssistancePrograms: [] })).toBe(0);
  });
});
