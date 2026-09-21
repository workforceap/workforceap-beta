/**
 * Old → new `course_progress.course_slug` mapping for the course keys that
 * #2421 and #2425 re-keyed in code without a data migration (WAP-76 / WAP-181).
 *
 * Why this exists
 * ---------------
 * `mkProgram` (lib/content/programs.ts) keys a syllabus course by the Coursera
 * catalog slug it binds to, and falls back to the synthetic `<program>-course-N`
 * when nothing binds. Two merged PRs gave thirteen syllabus rows an explicit
 * `courseraCourseId` / `courseraSlug` so their real completions would finally
 * credit:
 *
 *   - #2421 "credit renamed IBM courses"  — the two IBM AI rows;
 *   - #2425 "number audit batch 4"        — eight MCHIT publisher parentheticals,
 *                                            CompTIA A+ #5 and #9, Digital Marketing #5.
 *
 * Both changed how progress is computed *going forward*, which is correct and
 * is not revisited here. Neither moved the rows already stored under the old
 * synthetic keys. `course_progress` is unique on
 * `(user_id, program_slug, course_slug)`, so every such row is now orphaned
 * from its program's course list: the member finished the course, and the
 * portal shows nothing. This module is the one place that states the mapping,
 * and `courseSlugRemap.test.ts` re-derives it from `PROGRAMS` so it cannot
 * drift from the code that produced it.
 *
 * Pure and dependency-light on purpose: the repair script, the unit test and
 * the migration proof all read it.
 */
import { canonicalizeProgramSlug, programSlugReadCandidates } from '@/lib/content/programSlug';

export type CourseSlugRemapEntry = {
  /** Canonical WAP program slug the course belongs to. */
  programSlug: string;
  /** Every `program_slug` value a stored row may carry for that program. */
  programSlugCandidates: readonly string[];
  /** 1-based position in the regulated syllabus, which is what `-course-N` counts. */
  syllabusIndex: number;
  /** The synthetic key rows were written under before the crediting fix. */
  from: string;
  /** The catalog-bound key `mkProgram` produces today. */
  to: string;
  /** Regulated course title, for the dry-run report and the migration comment. */
  courseName: string;
  /** The PR that re-keyed it. */
  source: '#2421' | '#2425';
};

function entry(
  programSlug: string,
  syllabusIndex: number,
  to: string,
  courseName: string,
  source: CourseSlugRemapEntry['source'],
): CourseSlugRemapEntry {
  const canonical = canonicalizeProgramSlug(programSlug);
  return {
    programSlug: canonical,
    programSlugCandidates: Object.freeze(programSlugReadCandidates(canonical)),
    syllabusIndex,
    from: `${canonical}-course-${syllabusIndex}`,
    to,
    courseName,
    source,
  };
}

export const COURSE_SLUG_REMAP: readonly CourseSlugRemapEntry[] = Object.freeze([
  // #2421 — the two IBM rows whose regulated title never equalled Coursera's.
  entry('software-developer-professional-certificate-ibm', 2, 'introduction-to-ai', 'Introduction to Artificial Intelligence', '#2421'),
  entry('software-developer-professional-certificate-ibm', 4, 'generative-ai-prompt-engineering-for-everyone', 'Generative AI: Prompt Engineering', '#2421'),

  // #2425 — CompTIA A+ #5 and #9.
  entry('comptia-a-professional-certificate', 5, 'packt-operating-systems-and-networking-fundamentals-bokjh', 'Operating Systems and Network Fundamentals', '#2425'),
  entry('comptia-a-professional-certificate', 9, 'practice-exam-for-comptia-a', 'Practice Exams for CompTIA A+ Certification', '#2425'),

  // #2425 — Digital Marketing #5.
  entry('digital-marketing-e-commerce-google', 5, 'assess-for-success', 'Assess for Success: Market Analytics and Measurement', '#2425'),

  // #2425 — the eight MCHIT publisher parentheticals.
  entry('health-information-technology-mchit', 3, 'revenue-cycle-billing-and-coding', 'Revenue Cycle, Billing, and Coding (Johns Hopkins)', '#2425'),
  entry('health-information-technology-mchit', 4, 'the-billing-and-collection-process', 'The Billing and Collection Process (AAPC)', '#2425'),
  entry('health-information-technology-mchit', 5, 'medical-billing-coding-essentials', 'Medical Billing and Coding Essentials (MedCerts)', '#2425'),
  entry('health-information-technology-mchit', 11, 'data-and-electronic-health-records', 'Data and Electronic Health Records (Johns Hopkins)', '#2425'),
  entry('health-information-technology-mchit', 12, 'health-it-fundamentals', 'Health Information Technology Fundamentals (Johns Hopkins)', '#2425'),
  entry('health-information-technology-mchit', 13, 'telehealth', 'Foundations of Telehealth (Johns Hopkins)', '#2425'),
  entry('health-information-technology-mchit', 14, 'medical-administrative-assistants-and-office-procedures', 'Medical Administrative Assistants and Office Procedures (MedCerts)', '#2425'),
  entry('health-information-technology-mchit', 15, 'introduction-to-certified-professional-biller', 'Introduction to Certified Professional Biller (AAPC)', '#2425'),
]);

/** Every `course_slug` the migration reads. Nothing outside this set is touched. */
export const REMAPPED_SOURCE_SLUGS: readonly string[] = Object.freeze(
  COURSE_SLUG_REMAP.map((row) => row.from),
);

/** Look up the destination for a stored row, or null when the row is not ours. */
export function remapCourseSlug(programSlug: string, courseSlug: string): CourseSlugRemapEntry | null {
  const canonical = canonicalizeProgramSlug(programSlug);
  return (
    COURSE_SLUG_REMAP.find((row) => row.programSlug === canonical && row.from === courseSlug) ?? null
  );
}
