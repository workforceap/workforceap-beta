import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    courseProgress: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { upsertCourseProgressFromXapiStatement } from '@/lib/member/courseProgress';
import { parseXapiStatement } from '@/lib/xapi/statementModel';

describe('xAPI item completion persistence guard', () => {
  it.each(['completed', 'passed', 'experienced'])('does not read or write course progress for untyped item %s', async (verb) => {
    const parsed = parseXapiStatement({
      id: `untyped-item-${verb}`,
      actor: { mbox: 'mailto:member@example.com' },
      verb: { id: `http://adlnet.gov/expapi/verbs/${verb}` },
      object: { id: 'https://www.coursera.org/learn/course-123/item/lecture-1' },
      context: { extensions: { 'http://coursera.org/xapi/extensions/courseId': 'course-123' } },
      result: { completion: true, success: true },
    });
    expect(parsed?.activityType).toBe('item');

    const result = await upsertCourseProgressFromXapiStatement({
      userId: 'member-1',
      enrolledProgramSlug: 'it-support',
      parsed: parsed!,
    });

    expect(result).toBeNull();
    expect(prisma.courseProgress.findUnique).not.toHaveBeenCalled();
    expect(prisma.courseProgress.findFirst).not.toHaveBeenCalled();
  });
});
