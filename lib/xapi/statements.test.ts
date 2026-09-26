import { describe, expect, test } from 'vitest';
import {
  flattenXapiStatementPayload,
  isXapiCompletionVerb,
  isXapiCourseProgressVerb,
  parseXapiStatement,
} from './statementModel';

describe('xapi statement model', () => {
  test.each(['course', 'item'])('keeps a %s score as grade without inventing progress', (activityType) => {
    const parsed = parseXapiStatement({
      id: 'grade-only',
      actor: { mbox: 'mailto:learner@example.com' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/progressed' },
      object: { definition: { type: `http://adlnet.gov/expapi/activities/${activityType}` } },
      result: { score: { scaled: 0.9, raw: 90 } },
    });
    expect(parsed?.resultScoreScaled).toBe(0.9);
    expect(parsed?.resultScoreRaw).toBe(90);
    expect(parsed?.resultProgressPercent).toBeNull();
  });

  test('flattenXapiStatementPayload: single object and array', () => {
    const one = { id: 'a' };
    expect(flattenXapiStatementPayload(one).length).toBe(1);
    expect(flattenXapiStatementPayload([one, { id: 'b' }]).length).toBe(2);
    expect(flattenXapiStatementPayload(null).length).toBe(0);
  });

  test('parseXapiStatement: mbox email, verb, course slug, progress percent', () => {
    const parsed = parseXapiStatement({
      id: 'stmt-1',
      actor: { mbox: 'mailto:Learner@Example.COM' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/progressed' },
      object: {
        id: 'https://www.coursera.org/learn/my-course-slug',
        definition: { name: { 'en-US': 'My Course' } },
      },
      result: { progress: 0.33 },
    });
    expect(parsed).toBeTruthy();
    expect(parsed!.email).toBe('learner@example.com');
    expect(parsed!.statementId).toBe('stmt-1');
    expect(parsed!.verbId).toBe('http://adlnet.gov/expapi/verbs/progressed');
    expect(parsed!.courseSlug).toBe('my-course-slug');
    expect(parsed!.resultProgressPercent).toBe(33);
  });

  test('isXapiCompletionVerb and isXapiCourseProgressVerb', () => {
    const progressed = parseXapiStatement({
      id: 'p',
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/progressed' },
      object: {
        id: 'https://x/y',
        definition: { type: 'http://adlnet.gov/expapi/activities/course' },
      },
    });
    expect(progressed).toBeTruthy();
    expect(isXapiCompletionVerb(progressed!)).toBe(false);
    expect(isXapiCourseProgressVerb(progressed!)).toBe(true);

    const completed = parseXapiStatement({
      id: 'c',
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
      object: {
        id: 'https://x/y',
        definition: { type: 'http://adlnet.gov/expapi/activities/course' },
      },
    });
    expect(completed).toBeTruthy();
    expect(isXapiCompletionVerb(completed!)).toBe(true);
    expect(isXapiCourseProgressVerb(completed!)).toBe(true);

    const legacyUnknownCompletion = parseXapiStatement({
      id: 'legacy-itemish',
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
      object: { id: 'https://www.coursera.org/learn/my-course-slug/lecture/abc123' },
    });
    expect(legacyUnknownCompletion).toBeTruthy();
    expect(isXapiCompletionVerb(legacyUnknownCompletion!)).toBe(false);
    expect(isXapiCourseProgressVerb(legacyUnknownCompletion!)).toBe(false);
  });

  test.each(['completed', 'passed'])('item %s is not course completion or course progress', (verb) => {
    const parsed = parseXapiStatement({
      id: `item-${verb}`,
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: `http://adlnet.gov/expapi/verbs/${verb}` },
      object: {
        id: 'https://www.coursera.org/learn/my-course-slug/item/lecture-1',
        definition: { type: 'http://adlnet.gov/expapi/activities/item' },
      },
      context: {
        extensions: { 'http://coursera.org/xapi/extensions/courseId': 'course-123' },
      },
      result: { completion: true, success: true },
    });

    expect(parsed?.activityType).toBe('item');
    expect(parsed?.courseraCourseId).toBe('course-123');
    expect(isXapiCompletionVerb(parsed!)).toBe(false);
    expect(isXapiCourseProgressVerb(parsed!)).toBe(false);
  });

  test('item progress remains a progress signal when the item result is complete', () => {
    const parsed = parseXapiStatement({
      id: 'item-progress',
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/progressed' },
      object: { definition: { type: 'http://adlnet.gov/expapi/activities/item' } },
      result: { completion: true },
    });

    expect(parsed?.activityType).toBe('item');
    expect(isXapiCompletionVerb(parsed!)).toBe(false);
    expect(isXapiCourseProgressVerb(parsed!)).toBe(true);
  });

  test.each([
    {
      label: 'untyped item path',
      objectId: 'https://www.coursera.org/learn/my-course-slug/item/lecture-1',
      definitionType: undefined,
      itemType: undefined,
    },
    {
      label: 'itemType extension on a course-looking path',
      objectId: 'https://www.coursera.org/learn/my-course-slug',
      definitionType: undefined,
      itemType: 'ITEM_TYPE_LECTURE',
    },
    {
      label: 'conflicting course type and item path',
      objectId: 'https://www.coursera.org/learn/my-course-slug/item/lecture-1',
      definitionType: 'http://adlnet.gov/expapi/activities/course',
      itemType: undefined,
    },
  ])('$label cannot complete the course despite a courseId extension', ({ objectId, definitionType, itemType }) => {
    const parsed = parseXapiStatement({
      id: 'untyped-item',
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
      object: {
        id: objectId,
        ...(definitionType ? { definition: { type: definitionType } } : {}),
      },
      context: { extensions: {
        'http://coursera.org/xapi/extensions/courseId': 'course-123',
        ...(itemType ? { 'http://coursera.org/xapi/extensions/itemType': itemType } : {}),
      } },
      result: { completion: true, success: true },
    });

    expect(parsed?.activityType).toBe('item');
    expect(isXapiCompletionVerb(parsed!)).toBe(false);
    expect(isXapiCourseProgressVerb(parsed!)).toBe(false);
  });

  test('untyped nested activity cannot complete the course, but an untyped course object can', () => {
    const base = {
      id: 'unknown-completion',
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/passed' },
      context: { extensions: { 'http://coursera.org/xapi/extensions/courseId': 'course-123' } },
      result: { success: true },
    };
    const nested = parseXapiStatement({
      ...base,
      object: { id: 'https://www.coursera.org/learn/my-course-slug/lecture/abc123' },
    });
    const course = parseXapiStatement({
      ...base,
      object: { id: 'https://www.coursera.org/learn/my-course-slug' },
    });

    expect(nested?.activityType).toBe('unknown');
    expect(isXapiCompletionVerb(nested!)).toBe(false);
    expect(course?.activityType).toBe('unknown');
    expect(isXapiCompletionVerb(course!)).toBe(true);
  });

  test.each([
    { objectId: 'https://www.coursera.org/course/course-123', activityType: 'unknown', completion: true },
    { objectId: 'https://www.coursera.org/course/course-123/item/lecture-1', activityType: 'item', completion: false },
  ])('untyped Coursera $objectId has course completion $completion', ({ objectId, activityType, completion }) => {
    const parsed = parseXapiStatement({
      id: 'course-path-completion',
      actor: { mbox: 'mailto:a@b.co' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
      object: { id: objectId },
      context: { extensions: { 'http://coursera.org/xapi/extensions/courseId': 'course-123' } },
      result: { completion: true },
    });

    expect(parsed?.activityType).toBe(activityType);
    expect(isXapiCompletionVerb(parsed!)).toBe(completion);
    expect(isXapiCourseProgressVerb(parsed!)).toBe(completion);
  });

  test('completion classifier rejects an item path even if a caller labels it course', () => {
    expect(isXapiCompletionVerb({
      activityType: 'course',
      courseraCourseId: 'course-123',
      courseObjectId: 'https://www.coursera.org/learn/course-123/item/lecture-1',
      verbId: 'http://adlnet.gov/expapi/verbs/completed',
      rawStatement: {},
    })).toBe(false);
  });
});
