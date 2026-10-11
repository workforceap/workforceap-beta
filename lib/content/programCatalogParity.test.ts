import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS as APP_PROGRAMS } from './programs';
import { PROGRAMS as MARKETING_PROGRAMS } from '../../marketing/src/data/programs';
import { getProgramSyllabus } from '../../shared/programSyllabi';

/**
 * Locks marketing/src/data/programs.ts (the public site — and the source
 * for marketing/src/pages/programs/price-list.astro, the document shared
 * with TWC / workforce boards) against silently drifting from
 * lib/content/programs.ts (the app catalog used for enrollment and the
 * member dashboard).
 *
 * Both catalogs must expose the same slugs, titles, duration labels and
 * estimated-hour totals. Active course lists must also agree. The two amended
 * programs below retain frozen operational keys for existing learner progress;
 * their public course lists must instead match the supplied approved syllabus,
 * and new assignments must remain paused. This source comparison does not
 * certify current provider availability, licenses, or owner policy approval.
 */

function sumHours(courses: { estimatedHours: number }[]): number {
  return courses.reduce((sum, c) => sum + (c.estimatedHours ?? 0), 0);
}

const appBySlug = new Map(APP_PROGRAMS.map((p) => [p.slug, p]));
const marketingBySlug = new Map(MARKETING_PROGRAMS.map((p) => [p.slug, p]));
const sharedSlugs = [...marketingBySlug.keys()];
const FROZEN_OPERATIONAL_PROGRAMS = new Set([
  'data-analytics-professional-certificate-google',
  'data-science-professional-certificate-ibm',
]);

test('marketing and app program catalogs expose the same program slugs', () => {
  assert.deepEqual([...marketingBySlug.keys()].sort(), [...appBySlug.keys()].sort());
});

for (const slug of sharedSlugs) {
  const appProgram = appBySlug.get(slug)!;
  const marketingProgram = marketingBySlug.get(slug)!;

  test(`program catalog parity — title: ${slug}`, () => {
    assert.equal(marketingProgram.title, appProgram.title, `title mismatch for ${slug}`);
  });

  test(`program catalog parity — duration: ${slug}`, () => {
    assert.equal(marketingProgram.duration, appProgram.duration);
  });

  test(`program catalog parity — estimated course hours: ${slug}`, () => {
    const appHours = sumHours(appProgram.courses);
    const marketingHours = sumHours(marketingProgram.courses);
    assert.equal(
      marketingHours,
      appHours,
      `estimated-hour total mismatch for ${slug}: marketing=${marketingHours} app=${appHours}`
    );
  });

  test(`program catalog parity — course list: ${slug}`, () => {
    const projectCourses = (program: typeof appProgram | typeof marketingProgram) =>
      program.courses.map(({ name, estimatedHours }) => ({ name, estimatedHours }));
    if (FROZEN_OPERATIONAL_PROGRAMS.has(slug)) {
      assert.equal(appProgram.curriculumMigrationPending, true);
      const syllabus = getProgramSyllabus(slug);
      assert.ok(syllabus, `expected an approved syllabus for ${slug}`);
      assert.deepEqual(projectCourses(marketingProgram), syllabus.courses.map(({ name, hours }) => ({
        name, estimatedHours: hours,
      })));
      return;
    }
    assert.deepEqual(projectCourses(marketingProgram), projectCourses(appProgram));
  });
}
