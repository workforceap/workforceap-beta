import { describe, it, expect } from 'vitest';
import { buildFirstValueActions, type FirstValueActionsContext } from '@/lib/member/firstValueActions';
import { DEFAULT_RECOMMENDED_PROGRAM_SLUGS } from '@/lib/member/recommendPrograms';
import { isNewMember } from '@/lib/member/isNewMember';

function makeCtx(partial: Partial<FirstValueActionsContext> = {}): FirstValueActionsContext {
  return {
    state: 'A',
    noApplicationOnFile: true,
    application: null,
    enrolledProgram: null,
    assessmentCompleted: false,
    hasResume: false,
    profileCompletenessPct: 100,
    careerRecommendation: null,
    ...partial,
  };
}

describe('buildFirstValueActions', () => {
  it('returns exactly three actions', () => {
    const actions = buildFirstValueActions(makeCtx());
    expect(actions).toHaveLength(3);
  });

  it('prioritizes application when none on file', () => {
    const actions = buildFirstValueActions(makeCtx({ noApplicationOnFile: true }));
    expect(actions[0].id).toBe('fv_submit_application');
  });

  it('includes program exploration from defaults when no career match', () => {
    const actions = buildFirstValueActions(makeCtx({ profileCompletenessPct: 100, hasResume: true }));
    const exploreIds = actions.filter((a) => a.id.startsWith('fv_explore_program_'));
    expect(exploreIds.length).toBeGreaterThan(0);
    expect(exploreIds[0].id).toBe(`fv_explore_program_${DEFAULT_RECOMMENDED_PROGRAM_SLUGS[0]}`);
  });

  it('surfaces resume gap ahead of program exploration', () => {
    const actions = buildFirstValueActions(
      makeCtx({
        state: 'C',
        noApplicationOnFile: false,
        enrolledProgram: 'it-support-professional-certificate-ibm',
        assessmentCompleted: true,
        application: null,
        hasResume: false,
        profileCompletenessPct: 100,
      })
    );
    expect(actions[0].id).toBe('fv_upload_resume');
  });
});

describe('isNewMember', () => {
  it('is true within seven days of signup', () => {
    const createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(isNewMember(createdAt)).toBe(true);
  });

  it('is false after seven days', () => {
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(isNewMember(createdAt)).toBe(false);
  });
});


it.each(['B', 'C'] as const)('offers the enrolled incomplete assessment with either loader stage %s', (state) => {
  const actions = buildFirstValueActions(makeCtx({ state, enrolledProgram: 'assigned', noApplicationOnFile: false }));
  expect(actions[0].id).toBe('fv_preassessment');
});
