import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { normalizeCourseraCourseId } from '@/lib/content/programCurriculumManifest';
import { PROGRAMS } from '@/lib/content/programs';
import { isCourseraDeliveredCourse } from '@/lib/coursera/progressTileSummary';
import { PROGRAM_SYLLABI } from '../../shared/programSyllabi';

/**
 * Syllabus <-> Coursera catalog parity.
 *
 * Every regulated syllabus row that Coursera delivers must bind to exactly one
 * catalog course id, or a member's completion of it can never be credited
 * ("3 of 17" for a learner who finished 5). The lab / project / test-prep row
 * WorkforceAP delivers itself must never bind to a provider id. (On legacy-v1
 * assignments that row stays a plain outline, not a `kind:'workforceap'`
 * module: lib/content/itSupportLabs.test.ts pins that it never becomes a
 * native completion route.) The only provider rows allowed to stay unbound
 * are listed below with the reason; adding a row here needs the same evidence
 * as removing one.
 */

/** The WorkforceAP-delivered block every TWC syllabus carries. */
const LAB_ROW = /\bLab\b/;
function isLabRow(course: { name: string }): boolean {
  return LAB_ROW.test(course.name);
}
const UNBOUND_PROVIDER_ROWS: ReadonlyArray<{ program: string; name: string; reason: string }> = [
  {
    program: 'cybersecurity-professional-certificate-google',
    name: 'CompTIA Network+ and Security+ Exam Practice',
    reason: 'one syllabus row spans two catalog courses (CompTIA Network+ _jlsu7N_EfChNw6iIZDwyw and Security+ 701 bfGb13eJEe-cBRK_mZB3Bw); a single id would credit half the row',
  },
  {
    program: 'digital-marketing-e-commerce-google',
    name: 'Make the Sale: Build, Launch, and Manage E-commerce Stores',
    reason: 'no course by this title in lib/content/courseraDiscoveredCatalog.ts for this program (regenerate with scripts/backfill-coursera-courseids.cjs before binding)',
  },
  {
    program: 'data-analytics-professional-certificate-google',
    name: 'Introduction to Management Consulting',
    reason: 'no course by this title in lib/content/courseraDiscoveredCatalog.ts for this program (regenerate with scripts/backfill-coursera-courseids.cjs before binding)',
  },
  {
    program: 'data-analytics-professional-certificate-google',
    name: 'Introduction to Business Analysis',
    reason: 'no course by this title in lib/content/courseraDiscoveredCatalog.ts for this program (regenerate with scripts/backfill-coursera-courseids.cjs before binding)',
  },
  {
    program: 'data-analytics-professional-certificate-google',
    name: 'Business Analysis: Preparation Exam for ECBA Certification',
    reason: 'no course by this title in lib/content/courseraDiscoveredCatalog.ts for this program (regenerate with scripts/backfill-coursera-courseids.cjs before binding)',
  },
  {
    program: 'ux-design-professional-certificate-google',
    name: 'Build Dynamic User Interfaces (UI) for Websites',
    reason:
      'Coursera dropped it: the 2026-09-17 Curriculum download\'s UX Design collection (h0Rk9) carries six courses and no longer lists it (WAP-76), so there is no id left to bind. The regulated syllabus still names the course and keeps its own courseraSlug, so the WAP course key and the eight-course denominator are unchanged and progress already stored on responsive-web-design-adobe-xd still credits by slug; only new provider-reported completions are impossible, and Coursera can no longer report any.',
  },
  {
    program: 'data-science-professional-certificate-ibm',
    name: 'Introduction to Data Engineering',
    reason: 'no course by this title in lib/content/courseraDiscoveredCatalog.ts for this program (regenerate with scripts/backfill-coursera-courseids.cjs before binding)',
  },
  {
    program: 'data-science-professional-certificate-ibm',
    name: 'Relational Database Administration (DBA)',
    reason: 'no course by this title in lib/content/courseraDiscoveredCatalog.ts for this program (regenerate with scripts/backfill-coursera-courseids.cjs before binding)',
  },
  {
    program: 'data-science-professional-certificate-ibm',
    name: 'Relational Database Administration Capstone Project',
    reason: 'no course by this title in lib/content/courseraDiscoveredCatalog.ts for this program (regenerate with scripts/backfill-coursera-courseids.cjs before binding)',
  },
];

function isAllowlisted(program: string, name: string): boolean {
  return UNBOUND_PROVIDER_ROWS.some((row) => row.program === program && row.name === name);
}

const syllabusPrograms = PROGRAMS.filter((program) => Boolean(program.syllabus));

describe('syllabus <-> Coursera catalog parity', () => {
  it('covers every regulated syllabus', () => {
    assert.equal(syllabusPrograms.length, Object.keys(PROGRAM_SYLLABI).length);
    assert.ok(syllabusPrograms.length >= 12);
  });

  it('every Coursera-delivered syllabus row binds to a catalog id unless allowlisted with a reason', () => {
    const unbound: string[] = [];
    for (const program of syllabusPrograms) {
      for (const course of program.courses) {
        if (isLabRow(course)) continue;
        if (course.courseraCourseId) continue;
        if (isAllowlisted(program.slug, course.name)) continue;
        unbound.push(`${program.slug} / ${course.name} (slug ${course.slug})`);
      }
    }
    assert.deepEqual(unbound, [], `syllabus rows that can never be credited:\n${unbound.join('\n')}`);
  });

  it('the allowlist names only rows that are really unbound (no stale entries)', () => {
    for (const entry of UNBOUND_PROVIDER_ROWS) {
      const program = syllabusPrograms.find((candidate) => candidate.slug === entry.program);
      assert.ok(program, `allowlisted program ${entry.program} missing`);
      const course = program.courses.find((candidate) => candidate.name === entry.name);
      assert.ok(course, `allowlisted row ${entry.program} / ${entry.name} missing`);
      assert.equal(course.courseraCourseId, undefined, `${entry.program} / ${entry.name} is bound now; drop it from the allowlist`);
      assert.equal(isLabRow(course), false);
    }
  });

  it('every bound id names a real catalog course of the same program, exactly once', () => {
    for (const program of syllabusPrograms) {
      const catalog = DISCOVERED_COURSERA_PROGRAMS[program.slug];
      assert.ok(catalog, `no discovered catalog for ${program.slug}`);
      const catalogIds = new Set(catalog.courses.map((course) => normalizeCourseraCourseId(course.courseId)));
      const seen = new Map<string, string>();
      for (const course of program.courses) {
        if (!course.courseraCourseId) continue;
        const id = normalizeCourseraCourseId(course.courseraCourseId);
        assert.ok(catalogIds.has(id), `${program.slug} / ${course.name} binds ${course.courseraCourseId}, not in this program's catalog`);
        assert.notEqual(id, normalizeCourseraCourseId(catalog.learningPathId), `${program.slug} / ${course.name} is bound to the Learning Path`);
        assert.equal(seen.get(id), undefined, `${program.slug}: ${course.name} and ${seen.get(id)} share ${id}`);
        seen.set(id, course.name);
      }
    }
  });

  it('a syllabus title that differs from Coursera still binds when the syllabus carries the id', () => {
    const expectations: Array<[string, string, string]> = [
      ['software-developer-professional-certificate-ibm', 'Introduction to Artificial Intelligence', 'mR7MlUaTEemuHQ4HpHozrA'],
      ['software-developer-professional-certificate-ibm', 'Generative AI: Prompt Engineering', 'nI__WUzdEe64qQ7qqom4Rw'],
      ['health-information-technology-mchit', 'Revenue Cycle, Billing, and Coding (Johns Hopkins)', 'jb0fG5ClEe-KjBKlSS1PLQ'],
      ['health-information-technology-mchit', 'Introduction to Certified Professional Biller (AAPC)', 'uDMpp-fMEe-mrRK-FPQYAw'],
      ['comptia-a-professional-certificate', 'Operating Systems and Network Fundamentals', 'RP5nqGeBEe-ZVAr_5CUYPw'],
      ['comptia-a-professional-certificate', 'Practice Exams for CompTIA A+ Certification', 'bbLUnmLQEe66xBLRCmM3Cw'],
      ['digital-marketing-e-commerce-google', 'Assess for Success: Market Analytics and Measurement', 'FOu5AXsIEeynSxJpnIcphQ'],
    ];
    for (const [slug, name, id] of expectations) {
      const program = syllabusPrograms.find((candidate) => candidate.slug === slug);
      assert.ok(program);
      const course = program.courses.find((candidate) => candidate.name === name);
      assert.ok(course, `${slug} / ${name}`);
      assert.equal(course.courseraCourseId, id);
      assert.equal(course.name, name, 'the regulated wording is preserved verbatim');
      assert.equal(course.slug.startsWith(`${slug}-course-`), false, 'bound rows use the Coursera slug, not a synthetic slot');
    }
  });

  it('every syllabus lab row stays unbound on its stable local slug (no provider id, no Coursera slug)', () => {
    for (const program of syllabusPrograms) {
      const labs = program.courses.filter(isLabRow);
      const syllabusLabs = program.syllabus!.courses.filter(isLabRow);
      // The frozen operational snapshot (LEGACY_OPERATIONAL_COURSES) may word
      // the lab differently from the syllabus, so compare the count, not names.
      assert.equal(labs.length, syllabusLabs.length, `${program.slug}: every syllabus lab row must reach Program.courses`);
      if (program.slug === 'project-management-professional-certificate-microsoft'
        || program.slug === 'cybersecurity-professional-certificate-google'
        || program.slug === 'data-science-professional-certificate-ibm'
        || program.slug === 'aws-cloud-technology-amazon') {
        // These syllabi carry no separate lab block.
        assert.equal(labs.length, 0, `${program.slug} unexpectedly has a lab row`);
        continue;
      }
      assert.equal(labs.length, 1, `${program.slug} should have exactly one lab row, found ${labs.map((c) => c.name).join(', ')}`);
      const [lab] = labs;
      assert.equal(lab.courseraCourseId, undefined, `${program.slug}: the lab must never carry a Coursera id`);
      assert.equal(lab.courseraSlug, undefined);
      assert.equal(isCourseraDeliveredCourse(lab), false, `${program.slug}: the tile must count the lab as WorkforceAP's own course`);
      const index = program.courses.indexOf(lab);
      assert.equal(lab.slug, `${program.slug}-course-${index + 1}`, 'existing course_progress rows reference the local slot slug');
    }
  });

  it('no syllabus row other than the lab is left on a synthetic -course-N slug unless allowlisted', () => {
    for (const program of syllabusPrograms) {
      for (const course of program.courses) {
        if (isLabRow(course)) continue;
        if (isAllowlisted(program.slug, course.name)) continue;
        assert.equal(
          course.slug.startsWith(`${program.slug}-course-`),
          false,
          `${program.slug} / ${course.name} fell back to ${course.slug}`,
        );
      }
    }
  });
});
