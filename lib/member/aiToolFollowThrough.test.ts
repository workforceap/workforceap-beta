import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIToolFollowThrough } from './aiToolFollowThrough';

test('resume tools route into application follow-through', () => {
  const result = getAIToolFollowThrough({ toolType: 'resume_rewriter' });
  assert.equal(result.href, '/dashboard/job-applications');
});

test('interview tools route into readiness follow-through', () => {
  const result = getAIToolFollowThrough({ toolType: 'interview_practice' });
  assert.equal(result.href, '/dashboard/readiness');
});

test('skill assessment routes into training follow-through', () => {
  const result = getAIToolFollowThrough({ toolType: 'skill_assessment' });
  assert.equal(result.href, '/dashboard/program');
});

test('gap and skill-map tools open My Program, not the member home', () => {
  for (const toolType of ['job_match_scorer', 'gap_analyzer', 'skill_mapper']) {
    const result = getAIToolFollowThrough({ toolType });
    assert.equal(result.href, '/dashboard/program', toolType);
    assert.equal(result.cta, 'Open My Program', toolType);
  }
});

test('career counselor elevator pitch routes into voice interview practice', () => {
  const result = getAIToolFollowThrough({
    toolType: 'career_counselor',
    inputSummary: 'Need an elevator pitch for IT support roles',
  });
  assert.equal(result.href, '/dashboard/ai-tools/voice-interview');
});
