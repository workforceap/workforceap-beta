import { describe, it, expect } from 'vitest';
import { buildNextBestActions, type NextBestActionsContext } from '@/lib/member/nextBestActions';

function makeCtx(partial: Partial<NextBestActionsContext> = {}): NextBestActionsContext {
  return {
    state: 'A',
    noApplicationOnFile: false,
    enrolledProgram: null,
    assessmentCompleted: false,
    hasResume: false,
    profileCompletenessPct: 100,
    jobApplicationCount: 0,
    counselorUnreadCount: 0,
    weeklyRecapUnopened: false,
    ...partial,
  };
}

describe('buildNextBestActions', () => {
  it('always returns at least one action', () => {
    const actions = buildNextBestActions(makeCtx());
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[actions.length - 1].id).toBe('default_counselor');
  });

  it('returns max 4 actions', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'C',
      enrolledProgram: 'cyber',
      assessmentCompleted: true,
      hasResume: false,
      counselorUnreadCount: 3,
      jobApplicationCount: 0,
      profileCompletenessPct: 30,
      weeklyRecapUnopened: true,
    }));
    expect(actions.length).toBeLessThanOrEqual(4);
  });

  it('sorts by weight descending', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'A',
      noApplicationOnFile: true,
      counselorUnreadCount: 5,
    }));
    expect(actions[0].id).toBe('submit_application');
    expect(actions[0].weight).toBe(100);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].weight).toBeLessThanOrEqual(actions[i - 1].weight);
    }
  });

  it('shows submit_application for state A with no application', () => {
    const actions = buildNextBestActions(makeCtx({ state: 'A', noApplicationOnFile: true }));
    expect(actions.some((a) => a.id === 'submit_application')).toBe(true);
    expect(actions.find((a) => a.id === 'submit_application')?.variant).toBe('urgent');
  });

  it('shows choose_program for state A with application but no enrollment', () => {
    const actions = buildNextBestActions(makeCtx({ state: 'A', noApplicationOnFile: false }));
    expect(actions.some((a) => a.id === 'choose_program')).toBe(true);
  });

  it('does not show choose_program when enrolled', () => {
    const actions = buildNextBestActions(makeCtx({ state: 'A', noApplicationOnFile: false, enrolledProgram: 'cyber' }));
    expect(actions.some((a) => a.id === 'choose_program')).toBe(false);
  });

  it('shows skills_assessment for state B without starter profile review', () => {
    const actions = buildNextBestActions(makeCtx({ state: 'B', enrolledProgram: 'cyber', starterProfileReviewRequired: false }));
    expect(actions.some((a) => a.id === 'skills_assessment')).toBe(true);
    expect(actions.find((a) => a.id === 'skills_assessment')?.variant).toBe('urgent');
  });

  it('shows review_starter_profile for state B when review required', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'B',
      enrolledProgram: 'cyber',
      starterProfileReviewRequired: true,
      starterProfileMissingFields: ['phone', 'address'],
    }));
    expect(actions.some((a) => a.id === 'review_starter_profile')).toBe(true);
    expect(actions.some((a) => a.id === 'skills_assessment')).toBe(false);
    const review = actions.find((a) => a.id === 'review_starter_profile');
    expect(review?.body).toContain('Missing: phone, address');
  });

  it('shows counselor_messages when unread count > 0', () => {
    const actions = buildNextBestActions(makeCtx({ counselorUnreadCount: 3 }));
    expect(actions.some((a) => a.id === 'counselor_messages')).toBe(true);
    const msg = actions.find((a) => a.id === 'counselor_messages');
    expect(msg?.body).toContain('3 unread messages');
  });

  it('shows singular counselor message text for 1 unread', () => {
    const actions = buildNextBestActions(makeCtx({ counselorUnreadCount: 1 }));
    const msg = actions.find((a) => a.id === 'counselor_messages');
    expect(msg?.body).toContain('an unread message');
    expect(msg?.body).not.toContain('1 unread');
  });

  it('shows upload_resume for state C/D without resume', () => {
    const actions = buildNextBestActions(makeCtx({ state: 'C', enrolledProgram: 'cyber', hasResume: false }));
    expect(actions.some((a) => a.id === 'upload_resume')).toBe(true);
  });

  it('does not show upload_resume when resume exists', () => {
    const actions = buildNextBestActions(makeCtx({ state: 'C', enrolledProgram: 'cyber', hasResume: true }));
    expect(actions.some((a) => a.id === 'upload_resume')).toBe(false);
  });

  it('shows interview_practice and career_readiness for state D without practice', () => {
    const actions = buildNextBestActions(makeCtx({ state: 'D', enrolledProgram: 'cyber', assessmentCompleted: true, completedCourseCount: 1, hasResume: true, hasCompletedInterviewPractice: false }));
    expect(actions.some((a) => a.id === 'interview_practice')).toBe(true);
    expect(actions.some((a) => a.id === 'career_readiness')).toBe(true);
  });

  it('shows job_tracker when no applications and assessment completed', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'C',
      enrolledProgram: 'cyber',
      assessmentCompleted: true,
      jobApplicationCount: 0,
      hasResume: true,
      hasCompletedInterviewPractice: true,
      completedCourseCount: 1,
    }));
    expect(actions.some((a) => a.id === 'job_tracker')).toBe(true);
  });

  it('does not show job_tracker when applications exist', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'C',
      enrolledProgram: 'cyber',
      assessmentCompleted: true,
      jobApplicationCount: 3,
    }));
    expect(actions.some((a) => a.id === 'job_tracker')).toBe(false);
  });

  it('shows complete_profile when completeness < 55 and enrolled', () => {
    const actions = buildNextBestActions(makeCtx({
      enrolledProgram: 'cyber',
      profileCompletenessPct: 40,
      profileMissingFields: ['phone', 'LinkedIn', 'bio'],
    }));
    expect(actions.some((a) => a.id === 'complete_profile')).toBe(true);
    const cp = actions.find((a) => a.id === 'complete_profile');
    expect(cp?.body).toContain('40% complete');
    expect(cp?.body).toContain('Missing: phone, LinkedIn, bio');
  });

  it('shows weekly_recap when unopened', () => {
    const actions = buildNextBestActions(makeCtx({ weeklyRecapUnopened: true }));
    expect(actions.some((a) => a.id === 'weekly_recap')).toBe(true);
  });

  it('shows skills_assessment for state C while the preassessment is still open', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'C',
      enrolledProgram: 'cyber',
      assessmentCompleted: false,
    }));
    expect(actions.some((a) => a.id === 'skills_assessment')).toBe(true);
    expect(actions.find((a) => a.id === 'skills_assessment')?.href).toBe('/dashboard/assessment');
  });

  it('does not show skills_assessment after the preassessment is complete', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'C',
      enrolledProgram: 'cyber',
      assessmentCompleted: true,
    }));
    expect(actions.some((a) => a.id === 'skills_assessment')).toBe(false);
  });

  it('shows continue_training when training incomplete with next course', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'C',
      assessmentCompleted: true,
      enrolledProgram: 'cyber',
      trainingCoursesIncomplete: true,
      nextIncompleteCourseName: 'Cybersecurity Basics',
    }));
    expect(actions.some((a) => a.id === 'continue_training')).toBe(true);
    const ct = actions.find((a) => a.id === 'continue_training');
    expect(ct?.title).toContain('Cybersecurity Basics');
    expect(ct?.href).toBe('/dashboard/program');
    expect(ct?.href).not.toBe('/dashboard');
    expect(ct?.href).not.toBe('/dashboard/training');
  });

  it('shows launch_first_course and see_training_plan when 0 courses completed', () => {
    const actions = buildNextBestActions(makeCtx({
      state: 'C',
      assessmentCompleted: true,
      enrolledProgram: 'cyber',
      completedCourseCount: 0,
    }));
    expect(actions.some((a) => a.id === 'launch_first_course')).toBe(true);
    expect(actions.some((a) => a.id === 'see_training_plan')).toBe(true);
  });

  it('shows placement_retention_window_90 at 90 days', () => {
    const placedAt = new Date(Date.now() - 90 * 86400000);
    const actions = buildNextBestActions(makeCtx({
      placementPlacedAt: placedAt,
      placementRetentionDecision: null,
    }));
    expect(actions.some((a) => a.id === 'placement_retention_window_90')).toBe(true);
  });

  it('shows placement_retention_window_180 at 180 days', () => {
    const placedAt = new Date(Date.now() - 180 * 86400000);
    const actions = buildNextBestActions(makeCtx({
      placementPlacedAt: placedAt,
      placementRetentionDecision: null,
    }));
    expect(actions.some((a) => a.id === 'placement_retention_window_180')).toBe(true);
  });

  it('does not show placement retention before 85 days', () => {
    const placedAt = new Date(Date.now() - 30 * 86400000);
    const actions = buildNextBestActions(makeCtx({
      placementPlacedAt: placedAt,
      placementRetentionDecision: null,
    }));
    expect(actions.some((a) => a.id.startsWith('placement_retention'))).toBe(false);
  });

  it('does not show placement retention when decision exists', () => {
    const placedAt = new Date(Date.now() - 90 * 86400000);
    const actions = buildNextBestActions(makeCtx({
      placementPlacedAt: placedAt,
      placementRetentionDecision: 'retained',
    }));
    expect(actions.some((a) => a.id.startsWith('placement_retention'))).toBe(false);
  });

  it('shows job-loss re-activation actions when placement is separated', () => {
    const actions = buildNextBestActions(makeCtx({
      placementSeparated: true,
    }));
    expect(actions.some((a) => a.id === 'placement_job_loss_reactivate')).toBe(true);
    expect(actions.some((a) => a.id === 'placement_job_loss_counselor')).toBe(true);
    const reactivate = actions.find((a) => a.id === 'placement_job_loss_reactivate');
    expect(reactivate?.href).toBe('/dashboard/jobs');
    expect(reactivate?.variant).toBe('urgent');
  });

  it('does not show job-loss re-activation actions when placement is not separated', () => {
    const actions = buildNextBestActions(makeCtx({
      placementSeparated: false,
      placementPlacedAt: new Date(Date.now() - 90 * 86400000),
      placementRetentionDecision: null,
    }));
    expect(actions.some((a) => a.id.startsWith('placement_job_loss'))).toBe(false);
  });

  it('deduplicates actions by id', () => {
    // Force duplicate conditions that might create same ID
    const actions = buildNextBestActions(makeCtx({
      state: 'A',
      noApplicationOnFile: true,
      counselorUnreadCount: 5,
    }));
    const ids = actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
