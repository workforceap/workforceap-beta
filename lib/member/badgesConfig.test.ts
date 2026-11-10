import assert from 'node:assert/strict';
import test from 'node:test';
import { BADGES, CELEBRATION_NOTE_PREFIX, evaluateBadges } from './badgesConfig';
import { WIRED_EVENTS } from './pointsConfig';

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** One qualifying points row. Duplicate entityIds model the unique (user, event, entity) key. */
function row(
  event: string,
  entityId: string,
  iso = '2026-06-01',
  note: string | null = null,
) {
  return { event, entityId, note, createdAt: at(iso) };
}

test('every badge event is one members can actually earn today', () => {
  for (const badge of BADGES) {
    if (!badge.event) continue;
    assert.ok(
      WIRED_EVENTS.has(badge.event),
      `${badge.key} uses ${badge.event}, which is not in WIRED_EVENTS`,
    );
  }
});

test('no points earns nothing and leaves every badge locked', () => {
  const badges = evaluateBadges([], { longestStreak: 0 });
  assert.equal(badges.length, BADGES.length);
  assert.ok(badges.every((badge) => !badge.earned));
  assert.ok(badges.every((badge) => badge.have === 0));
  assert.ok(badges.every((badge) => badge.earnedAt === null));
});

test('ready_to_start is earned by one assessment and dated from that row', () => {
  const [badge] = evaluateBadges(
    [row('assessment_completed', '', '2026-06-02')],
    { longestStreak: 0 },
  ).filter((item) => item.key === 'ready_to_start');
  assert.equal(badge.earned, true);
  assert.equal(badge.have, 1);
  assert.equal(badge.need, 1);
  assert.equal(badge.earnedAt, at('2026-06-02').toISOString());
});

test('ready_to_start stays locked with no assessment', () => {
  const [badge] = evaluateBadges(
    [row('resume_uploaded', 'first-upload')],
    { longestStreak: 0 },
  ).filter((item) => item.key === 'ready_to_start');
  assert.equal(badge.earned, false);
  assert.equal(badge.have, 0);
});

test('resume_ready counts one resume upload and ignores a second row for the same entity', () => {
  const once = evaluateBadges(
    [row('resume_uploaded', 'first-upload', '2026-06-03')],
    { longestStreak: 0 },
  ).find((item) => item.key === 'resume_ready');
  const twice = evaluateBadges(
    [
      row('resume_uploaded', 'first-upload', '2026-06-03'),
      row('resume_uploaded', 'first-upload', '2026-06-04'),
    ],
    { longestStreak: 0 },
  ).find((item) => item.key === 'resume_ready');
  assert.equal(once?.earned, true);
  assert.equal(once?.have, 1);
  assert.equal(twice?.have, 1);
  assert.equal(twice?.earnedAt, at('2026-06-03').toISOString());
});

test('job_hunter is locked at 2 distinct applications and earned at 3', () => {
  const two = evaluateBadges(
    [row('job_application', 'a', '2026-06-01'), row('job_application', 'b', '2026-06-02')],
    { longestStreak: 0 },
  ).find((item) => item.key === 'job_hunter');
  assert.equal(two?.earned, false);
  assert.equal(two?.have, 2);
  assert.equal(two?.need, 3);

  const three = evaluateBadges(
    [
      row('job_application', 'a', '2026-06-01'),
      row('job_application', 'b', '2026-06-02'),
      row('job_application', 'a', '2026-06-03'),
      row('job_application', 'c', '2026-06-04'),
    ],
    { longestStreak: 0 },
  ).find((item) => item.key === 'job_hunter');
  assert.equal(three?.earned, true);
  assert.equal(three?.have, 3);
  // The date of the 3rd distinct application, not the duplicate of the first.
  assert.equal(three?.earnedAt, at('2026-06-04').toISOString());
});

test('first_course is earned by one completed course and not by a certification', () => {
  const none = evaluateBadges(
    [row('certification_earned', 'CompTIA A+')],
    { longestStreak: 0 },
  ).find((item) => item.key === 'first_course');
  assert.equal(none?.earned, false);

  const done = evaluateBadges(
    [row('course_completed', 'intro-to-support', '2026-06-05')],
    { longestStreak: 0 },
  ).find((item) => item.key === 'first_course');
  assert.equal(done?.earned, true);
  assert.equal(done?.earnedAt, at('2026-06-05').toISOString());
});

test('certified ignores course-celebration rows and counts a real certification once', () => {
  const celebration = evaluateBadges(
    [
      row(
        'certification_earned',
        'progress-1',
        '2026-06-01',
        `${CELEBRATION_NOTE_PREFIX} IT Support — intro`,
      ),
    ],
    { longestStreak: 0 },
  ).find((item) => item.key === 'certified');
  assert.equal(celebration?.earned, false);
  assert.equal(celebration?.have, 0);

  const earned = evaluateBadges(
    [
      row('certification_earned', 'progress-1', '2026-06-01', `${CELEBRATION_NOTE_PREFIX} IT Support`),
      row('certification_earned', 'CompTIA A+', '2026-06-06'),
      row('certification_earned', 'CompTIA A+', '2026-06-07'),
    ],
    { longestStreak: 0 },
  ).find((item) => item.key === 'certified');
  assert.equal(earned?.earned, true);
  assert.equal(earned?.have, 1);
  assert.equal(earned?.earnedAt, at('2026-06-06').toISOString());
});

test('streak_7 reads the best streak and stores no date', () => {
  const short = evaluateBadges([], { longestStreak: 6 }).find((item) => item.key === 'streak_7');
  assert.equal(short?.earned, false);
  assert.equal(short?.have, 6);
  assert.equal(short?.need, 7);

  const hit = evaluateBadges([], { longestStreak: 7 }).find((item) => item.key === 'streak_7');
  assert.equal(hit?.earned, true);
  assert.equal(hit?.have, 7);
  assert.equal(hit?.earnedAt, null);
});
