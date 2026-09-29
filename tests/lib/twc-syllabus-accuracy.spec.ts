import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getProgramBySlug,
  isCurriculumMigrationPending,
  LEGACY_PROGRAM_TITLE_VALUES,
  PROGRAMS,
  SUPPORTED_PROGRAM_STORAGE_VALUES,
} from '@/lib/content/programs';
import { PROGRAM_INTEREST_OPTIONS } from '@/lib/validation/member';
import { getProgramComparisonTracks } from '@/lib/content/programComparisonTracks';
import { TRAINING_BRIDGE_OCCUPATIONS } from '@/lib/content/trainingBridge';
import { PROGRAM_SYLLABI } from '../../shared/programSyllabi';
import {
  PROGRAMS as MARKETING_PROGRAMS,
  partnerBadge,
} from '../../marketing/src/data/programs';
import { PROGRAM_COMPARISON_TRACKS as MARKETING_COMPARISON_TRACKS } from '../../marketing/src/data/programComparison';

const EXPECTED_SYLLABI = {
  'it-support-professional-certificate-ibm': ['IT Support Professional Certificate (IBM)', 160, 10],
  'comptia-a-professional-certificate': ['CompTIA A+ Professional Certificate (CompTIA A+)', 160, 10],
  'cybersecurity-professional-certificate-google': ['Networking and Cybersecurity Professional Certificate (Net+, Sec+)', 160, 14],
  'project-management-professional-certificate-microsoft': ['Project Management Professional Certificate (Microsoft)', 160, 10],
  'ai-practitioner-professional-certificate-aws': ['AI Practitioner Professional Certificate (AWS)', 160, 17],
  'data-analytics-professional-certificate-google': ['Management Analyst & Business Intelligence Professional Certificate', 160, 11],
  'data-science-professional-certificate-ibm': ['Database Administrator (DBA) Professional Certificate (IBM)', 160, 9],
  'aws-cloud-technology-amazon': ['AWS Cloud Technology Professional Certificate (AWS)', 160, 10],
  'ux-design-professional-certificate-google': ['User Experience & Interface Design Professional Certificate', 160, 8],
  'digital-marketing-e-commerce-google': ['Digital Marketing & E-Commerce Professional Certificate (Google)', 160, 8],
  'software-developer-professional-certificate-ibm': ['AI and Software Developer Professional Certificate (IBM)', 200, 17],
  'health-information-technology-mchit': ['Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)', 160, 16],
} as const;

describe('TWC syllabus source lock', () => {
  it('contains the exact 12 submitted program records', () => {
    expect(Object.keys(PROGRAM_SYLLABI)).toEqual(Object.keys(EXPECTED_SYLLABI));
  });

  it.each(Object.entries(EXPECTED_SYLLABI))(
    '%s preserves the submitted title, total hours, course count, and hour sum',
    (slug, [title, totalHours, courseCount]) => {
      const syllabus = PROGRAM_SYLLABI[slug as keyof typeof PROGRAM_SYLLABI];
      expect(syllabus.title).toBe(title);
      expect(syllabus.totalHours).toBe(totalHours);
      expect(syllabus.courses).toHaveLength(courseCount);
      expect(syllabus.courses.reduce((sum, course) => sum + course.hours, 0)).toBe(totalHours);
      expect(syllabus.courses.every((course) => course.description.trim().length > 0)).toBe(true);
    },
  );

  it.each(Object.keys(EXPECTED_SYLLABI))(
    '%s drives both Next and Astro catalog records',
    (slug) => {
      const syllabus = PROGRAM_SYLLABI[slug as keyof typeof PROGRAM_SYLLABI];
      const nextProgram = PROGRAMS.find((program) => program.slug === slug);
      const marketingProgram = MARKETING_PROGRAMS.find((program) => program.slug === slug);

      for (const program of [nextProgram, marketingProgram]) {
        expect(program?.title).toBe(syllabus.title);
        expect(program?.description).toBe(syllabus.description);
        expect(program?.syllabus).toEqual(syllabus);
      }
      expect(marketingProgram?.courses.map(({ name, estimatedHours, description }) => ({ name, estimatedHours, description }))).toEqual(
        syllabus.courses.map((course) => ({
          name: course.name,
          estimatedHours: course.hours,
          description: course.description,
        })),
      );
      if (!nextProgram?.curriculumMigrationPending) {
        expect(nextProgram?.courses.map(({ name, estimatedHours, description }) => ({ name, estimatedHours, description }))).toEqual(
          syllabus.courses.map((course) => ({
            name: course.name,
            estimatedHours: course.hours,
            description: course.description,
          })),
        );
      }
      expect(partnerBadge(marketingProgram!)).toBe(syllabus.providers);
    },
  );

  it('keeps existing-enrollee operational course keys stable for repurposed slugs', () => {
    const management = getProgramBySlug('data-analytics-professional-certificate-google');
    const dba = getProgramBySlug('data-science-professional-certificate-ibm');

    expect(management?.curriculumMigrationPending).toBe(true);
    expect(management?.courses).toHaveLength(13);
    expect(management?.courses[0]).toMatchObject({
      slug: 'data-analytics-professional-certificate-google-course-1',
      name: 'Introduction to Management Consulting',
      estimatedHours: 5,
    });
    expect(dba?.curriculumMigrationPending).toBe(true);
    expect(dba?.courses).toHaveLength(9);
    expect(dba?.courses[0]).toMatchObject({ slug: 'what-is-datascience', name: 'What is Data Science?' });
    expect(dba?.courses[7]).toMatchObject({
      slug: 'data-science-professional-certificate-ibm-course-8',
      name: 'Relational Database Administration (DBA)',
    });
  });

  it('locks exact amended provider and readiness copy from the approved PDFs', () => {
    const management = PROGRAM_SYLLABI['data-analytics-professional-certificate-google'];
    const ux = PROGRAM_SYLLABI['ux-design-professional-certificate-google'];

    expect(management.providers).toBe('Google & IBM via Coursera');
    expect(management.providerLine).toContain('Google & IBM via Coursera');
    expect(ux.courses[7]?.description).toBe(
      'Hands-on labs, project work, and test preparation supporting all program competencies and career readiness.',
    );
  });

  it('accepts applications but guards every direct training-enrollment writer during migration', () => {
    expect(isCurriculumMigrationPending('data-analytics-professional-certificate-google')).toBe(true);
    expect(isCurriculumMigrationPending('Database Administrator (DBA) Professional Certificate (IBM)')).toBe(true);
    expect(isCurriculumMigrationPending('ux-design-professional-certificate-google')).toBe(true);

    // B4B sync is intentionally excluded: it imports observed activity from
    // the retired Enterprise paths for legacy learners. Every user/admin path
    // that creates a fresh enrollment must either defer or reject assignment.
    const directEnrollmentWriters = [
      'app/api/apply/signup/route.ts',
      'app/api/member/enroll/route.ts',
      'app/api/admin/members/create/route.ts',
      'app/api/admin/members/bulk-update/route.ts',
      'app/api/admin/members/[id]/program/route.ts',
      'app/api/admin/program-change-requests/[id]/route.ts',
      'app/api/admin/coursera/reconcile/add-to-wap/route.ts',
      'app/api/invite/accept/route.ts',
    ];

    for (const relativePath of directEnrollmentWriters) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
      expect(source).toMatch(/curriculumMigrationPending|isCurriculumMigrationPending/);
    }
  });

  it.each([
    [
      'data-analytics-professional-certificate-google',
      '6-Management Analyst & Business Intelligence Professional Certificate (IBM).pdf',
      '49079c1479a516089f3a374dbcbc35dc2b0b267eb99c22b22db93ea9777a41af',
      10,
    ],
    [
      'data-science-professional-certificate-ibm',
      '7-Database Administrator (DBA) Professional Certificate (IBM).pdf',
      'f1c3f8eb3838bc76bc7863b72ab7245ca5f632131cde28775f1b212037a1289f',
      9,
    ],
    [
      'ux-design-professional-certificate-google',
      '9-User Experience & Interface Design Professional Certificate (Google).pdf',
      '6ac3ac7d95b30786356fbc702245ac0ea42d5410594aa6add3629bdf2385ff08',
      7,
    ],
  ] as const)(
    '%s is locked to the approved PDF and preserves its official Coursera links',
    (slug, sourceDocument, sourceSha256, linkedCourseCount) => {
      const syllabus = PROGRAM_SYLLABI[slug];
      expect(syllabus.sourceDocument).toBe(sourceDocument);
      expect(syllabus.sourceSha256).toBe(sourceSha256);
      expect(
        syllabus.courses.filter(
          (course) => 'courseraSlug' in course && Boolean(course.courseraSlug),
        ).length,
      ).toBe(linkedCourseCount);
    },
  );

  it.each([
    [
      'Management and Data Analyst Professional Certificate (Google/IBM)',
      'data-analytics-professional-certificate-google',
    ],
    [
      'Data Science and Database Administrator (DBA) Professional Certificate (IBM)',
      'data-science-professional-certificate-ibm',
    ],
    [
      'UX Design Professional Certificate (Google)',
      'ux-design-professional-certificate-google',
    ],
  ] as const)('keeps the previous title %s resolvable', (previousTitle, canonicalSlug) => {
    expect(getProgramBySlug(previousTitle)?.slug).toBe(canonicalSlug);
  });

  it('shows each approved title once while retaining exact historical storage values', () => {
    const approvedTitles = [
      'Management Analyst & Business Intelligence Professional Certificate',
      'Database Administrator (DBA) Professional Certificate (IBM)',
      'User Experience & Interface Design Professional Certificate',
    ];

    for (const title of approvedTitles) {
      expect(PROGRAM_INTEREST_OPTIONS.filter((option) => option === title)).toHaveLength(1);
    }
    for (const legacyTitle of LEGACY_PROGRAM_TITLE_VALUES) {
      expect(SUPPORTED_PROGRAM_STORAGE_VALUES).toContain(legacyTitle);
      expect(getProgramBySlug(legacyTitle)).toBeDefined();
      expect(PROGRAM_INTEREST_OPTIONS).not.toContain(legacyTitle);
    }
  });

  it('uses each amended approved title on both comparison surfaces', () => {
    const approvedTitlesBySlug = {
      'data-analytics-professional-certificate-google':
        'Management Analyst & Business Intelligence Professional Certificate',
      'data-science-professional-certificate-ibm':
        'Database Administrator (DBA) Professional Certificate (IBM)',
      'ux-design-professional-certificate-google':
        'User Experience & Interface Design Professional Certificate',
    } as const;
    const appTracks = getProgramComparisonTracks();

    for (const [slug, approvedTitle] of Object.entries(approvedTitlesBySlug)) {
      expect(appTracks.find((track) => track.slug === slug)?.shortName).toBe(approvedTitle);
      expect(MARKETING_COMPARISON_TRACKS.find((track) => track.slug === slug)?.shortName).toBe(
        approvedTitle,
      );
    }
  });

  it('uses the approved occupations in recommendations and training bridges', () => {
    const managementBridge = TRAINING_BRIDGE_OCCUPATIONS.find(
      (occupation) => occupation.programSlug === 'data-analytics-professional-certificate-google',
    );
    const dbaBridge = TRAINING_BRIDGE_OCCUPATIONS.find(
      (occupation) => occupation.programSlug === 'data-science-professional-certificate-ibm',
    );

    expect(managementBridge).toMatchObject({
      occupationTitle: 'Management Analyst',
      onetCodePrefixes: ['13-1111'],
      boardClassification: {
        primaryOnetSocCode: '13-1111.00',
        secondaryOnetSocCodes: ['13-1161.00'],
      },
    });
    expect(dbaBridge).toMatchObject({
      occupationTitle: 'Database Administrator',
      onetCodePrefixes: ['15-1242', '15-1245', '15-1243'],
      boardClassification: {
        primaryOnetSocCode: '15-1245.00',
        secondaryOnetSocCodes: ['15-1243.00'],
      },
    });

    const seedSource = readFileSync(
      join(process.cwd(), 'prisma/seed-onet-career.ts'),
      'utf8',
    );
    expect(seedSource).toContain('DBA_ALIGNMENT.operational.primaryOnetSocCode');
    expect(seedSource).toContain('OBSOLETE_REVISED_PROGRAM_MAPPINGS');
    expect(seedSource).toContain('careerProgramMapping.deleteMany');
  });

  it('keeps verified syllabus Coursera slugs launchable from My Program', () => {
    const programPage = readFileSync(
      join(process.cwd(), 'app/(portal)/dashboard/program/page.tsx'),
      'utf8',
    );
    expect(programPage).toContain('...curriculumCourses');
    expect(programPage).toContain("Boolean(course.courseraSlug?.trim())");
    expect(programPage).toContain('/api/member/coursera/launch?');
  });

  it('renders syllabus facts and removes the generic course placeholder', () => {
    const detailTemplate = readFileSync(
      join(process.cwd(), 'marketing/src/pages/programs/[slug].astro'),
      'utf8',
    );

    expect(detailTemplate).not.toContain('Part of the {display} program.');
    expect(detailTemplate).toContain('program.syllabus.deliveryFormat');
    expect(detailTemplate).toContain('program.syllabus.totalHoursLabel');
    expect(detailTemplate).toContain('program.syllabus.tuitionAndFees');
    expect(detailTemplate).toContain('c.description');
  });
});
