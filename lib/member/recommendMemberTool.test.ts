import test from 'node:test';
import assert from 'node:assert/strict';

import { recommendMemberTool, type MemberToolStageFacts } from './recommendMemberTool';

const enrolled = (overrides: Partial<MemberToolStageFacts> = {}): MemberToolStageFacts => ({
  enrolledProgram: 'it-support-professional-certificate-ibm',
  assessmentCompleted: true,
  hasResume: true,
  hasCompletedInterviewPractice: true,
  openApplicationStatuses: [],
  placed: false,
  placementSeparated: false,
  ...overrides,
});

test('no program yet: benefits cliff, the question worth answering before choosing', () => {
  const pick = recommendMemberTool(enrolled({ enrolledProgram: null, assessmentCompleted: false, hasResume: false }));
  assert.equal(pick?.slug, 'benefits-cliff');
});

test('enrolled without a resume: resume studio', () => {
  assert.equal(recommendMemberTool(enrolled({ hasResume: false }))?.slug, 'resume-studio');
});

test('resume on file, preassessment done, never practiced: interview practice', () => {
  assert.equal(recommendMemberTool(enrolled({ hasCompletedInterviewPractice: false }))?.slug, 'interview-practice');
});

test('resume and practice done: job match scorer', () => {
  assert.equal(recommendMemberTool(enrolled())?.slug, 'job-match-scorer');
});

test('an interview in the tracker beats generic prep', () => {
  const pick = recommendMemberTool(enrolled({ hasResume: false, openApplicationStatuses: ['APPLIED', 'INTERVIEWING'] }));
  assert.equal(pick?.slug, 'interview-prep');
  assert.equal(recommendMemberTool(enrolled({ openApplicationStatuses: ['PHONE_SCREEN'] }))?.slug, 'interview-prep');
});

test('an offer beats an interview', () => {
  const pick = recommendMemberTool(enrolled({ openApplicationStatuses: ['INTERVIEWING', 'OFFER'] }));
  assert.equal(pick?.slug, 'salary-negotiation');
});

test('placed and still working: no tool', () => {
  assert.equal(recommendMemberTool(enrolled({ placed: true })), null);
});

test('separated from a placement: back to matching new openings', () => {
  assert.equal(recommendMemberTool(enrolled({ placed: false, placementSeparated: true }))?.slug, 'job-match-scorer');
});

test('skips a tool the home already shows, matching by path whatever the query', () => {
  const facts = enrolled({ hasResume: false, hasCompletedInterviewPractice: false });
  const pick = recommendMemberTool(facts, ['/dashboard/ai-tools/resume-studio?view=rewrite']);
  assert.equal(pick?.slug, 'interview-practice');
  assert.equal(
    recommendMemberTool(facts, ['/dashboard/ai-tools/resume-studio', '/dashboard/ai-tools/interview-practice?prefill=true']),
    null,
  );
});

test('every pick links inside AI Career Tools', () => {
  const stages: MemberToolStageFacts[] = [
    enrolled({ enrolledProgram: null }),
    enrolled({ hasResume: false }),
    enrolled({ hasCompletedInterviewPractice: false }),
    enrolled(),
    enrolled({ openApplicationStatuses: ['OFFER'] }),
    enrolled({ placementSeparated: true }),
  ];
  for (const facts of stages) {
    const pick = recommendMemberTool(facts);
    assert.ok(pick, 'expected a pick');
    assert.ok(pick.href.startsWith(`/dashboard/ai-tools/${pick.slug}`), pick.href);
  }
});
