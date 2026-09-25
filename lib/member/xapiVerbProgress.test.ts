import { describe, expect, test } from 'vitest';
import { CourseProgressStatus } from '@prisma/client';
import { inferCourseProgressStatusFromXapiVerb } from './xapiVerbProgress';
import type { ParsedXapiStatement } from '@/lib/xapi/statementModel';

function minimalParsed(overrides: Partial<ParsedXapiStatement>): ParsedXapiStatement {
  return {
    rawStatement: {},
    ...overrides,
  };
}

describe('inferCourseProgressStatusFromXapiVerb', () => {
  test('completion verb → COMPLETED', () => {
    const s = minimalParsed({
      activityType: 'course',
      verbId: 'http://adlnet.gov/expapi/verbs/completed',
    });
    expect(inferCourseProgressStatusFromXapiVerb(s)).toBe(CourseProgressStatus.COMPLETED);
  });

  test.each(['completed', 'passed'])('item %s does not complete the course', (verb) => {
    const s = minimalParsed({
      activityType: 'item',
      courseraCourseId: 'course-123',
      verbId: `http://adlnet.gov/expapi/verbs/${verb}`,
      resultCompletion: true,
      resultSuccess: true,
    });
    expect(inferCourseProgressStatusFromXapiVerb(s)).toBeNull();
  });

  test('item progress still starts the course even if its result says the item is complete', () => {
    const s = minimalParsed({
      activityType: 'item',
      courseraCourseId: 'course-123',
      verbId: 'http://adlnet.gov/expapi/verbs/progressed',
      resultCompletion: true,
      resultSuccess: true,
    });
    expect(inferCourseProgressStatusFromXapiVerb(s)).toBe(CourseProgressStatus.IN_PROGRESS);
  });

  test('progressed → IN_PROGRESS', () => {
    const s = minimalParsed({
      verbId: 'http://adlnet.gov/expapi/verbs/progressed',
    });
    expect(inferCourseProgressStatusFromXapiVerb(s)).toBe(CourseProgressStatus.IN_PROGRESS);
  });

  test('non-progress verb → null', () => {
    const s = minimalParsed({
      verbId: 'http://adlnet.gov/expapi/verbs/experienced',
    });
    expect(inferCourseProgressStatusFromXapiVerb(s)).toBeNull();
  });
});
