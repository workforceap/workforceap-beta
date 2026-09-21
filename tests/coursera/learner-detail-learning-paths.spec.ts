import { describe, expect, it } from 'vitest';

import { KNOWN_LEARNING_PATH_IDS } from '@/lib/content/coursera/learningPaths';
import { isLearningPathCourseRow, partitionLearnerCourseRows } from '@/lib/coursera/progressQueries';

/**
 * Audit S7 — the admin member detail Coursera tile counted a Learning Path's
 * own enrollment row as a course (5 of 7 shown where 5 of 6 is true; 11 users
 * read 0 of 2 where 0 of 1 is true). `loadCoursesForUserId` now excludes path
 * ids in SQL and returns them in a separate `learningPaths` array so the raw
 * learner view can still show them without any count picking them up.
 */
describe('learner detail course / learning-path partition (S7)', () => {
  const PATH_ID = KNOWN_LEARNING_PATH_IDS[0];

  it('registers at least one learning path id to exclude', () => {
    expect(typeof PATH_ID).toBe('string');
    expect(PATH_ID.length).toBeGreaterThan(0);
  });

  it('classifies a path row as a path, with or without the B4B "Course~" prefix', () => {
    expect(isLearningPathCourseRow({ courseraCourseId: PATH_ID })).toBe(true);
    expect(isLearningPathCourseRow({ courseraCourseId: `Course~${PATH_ID}` })).toBe(true);
    expect(isLearningPathCourseRow({ courseraCourseId: 'some-real-course-id' })).toBe(false);
  });

  it('splits rows so the course count never includes the path row', () => {
    const rows = [
      { courseraCourseId: 'course-a' },
      { courseraCourseId: PATH_ID },
      { courseraCourseId: 'course-b' },
    ];
    const { courses, learningPaths } = partitionLearnerCourseRows(rows);
    expect(courses).toHaveLength(2);
    expect(learningPaths).toHaveLength(1);
    // Nothing is dropped: every row lands in exactly one bucket.
    expect(courses.length + learningPaths.length).toBe(rows.length);
  });
});
