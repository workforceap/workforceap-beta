import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workforceApCourseHref } from '@/lib/content/courseDelivery';
import { PROGRAMS } from '@/lib/content/programs';
import { PROGRAM_SYLLABI } from '../../shared/programSyllabi';
import { PROGRAM_CURRICULA } from '../../shared/programCurricula';
import { verifiedProgramPriceRows } from '../../marketing/src/data/programPriceList';
import {
  PROGRAMS as MARKETING_PROGRAMS,
  partnerBadge,
} from '../../marketing/src/data/programs';

const EXPECTED_CURRICULA = {
  'certified-production-technician-cpt': ['Certified Production Technician (CPT)', 160, 8],
  'certified-logistics-technician-clt': ['Certified Logistics Technician (CLT)', 160, 8],
} as const;

const OFFICIAL_CLA_CLT_DOMAINS = [
  'Global supply chain logistics life cycle',
  'Logistics environment',
  'Material handling equipment',
  'Safety principles',
  'Safe material handling and equipment operation',
  'Quality control principles',
  'Workplace communications',
  'Teamwork and workplace behavior to solve problems',
  'Using computers',
  'Product receiving',
  'Product storage',
  'Order processing',
  'Packaging and shipment',
  'Inventory control',
  'Safe handling of hazmat materials',
  'Evaluation of transportation modes',
  'Dispatch and tracking',
  'Measurements and metric conversions',
] as const;

const OWNER_PENDING_DURATION = 'Hours and delivery format pending owner verification';

describe('MSSC curriculum (CPT, CLT)', () => {
  it('covers exactly the two in-house authored programs', () => {
    expect(Object.keys(PROGRAM_CURRICULA)).toEqual(Object.keys(EXPECTED_CURRICULA));
  });

  it('never overlaps the source-locked TWC syllabus transcriptions', () => {
    for (const slug of Object.keys(PROGRAM_CURRICULA)) {
      expect(PROGRAM_SYLLABI).not.toHaveProperty(slug);
    }
  });

  it.each(Object.entries(EXPECTED_CURRICULA))(
    '%s declares hours that add up and class content that is filled in',
    (slug, [title, totalHours, courseCount]) => {
      const curriculum = PROGRAM_CURRICULA[slug];
      expect(curriculum.title).toBe(title);
      expect(curriculum.totalHours).toBe(totalHours);
      expect(curriculum.courses).toHaveLength(courseCount);
      expect(curriculum.courses.reduce((sum, course) => sum + course.hours, 0)).toBe(totalHours);
      expect(curriculum.clockHours + curriculum.labHours).toBe(totalHours);
      expect(curriculum.courses.every((course) => course.description.trim().length > 0)).toBe(true);
      expect(curriculum.courses.every((course) => course.kind === 'workforceap')).toBe(true);
      expect(curriculum.courses.every((course) => course.certificationAlignment.length > 0)).toBe(true);
      expect(curriculum.certificationTargets.length).toBeGreaterThan(0);
      expect(curriculum.status).toBe('draft-pending-owner-verification');
    },
  );

  it.each(Object.keys(EXPECTED_CURRICULA))(
    '%s course content is identical in the Next and Astro catalogs',
    (slug) => {
      const curriculum = PROGRAM_CURRICULA[slug];
      const nextProgram = PROGRAMS.find((program) => program.slug === slug);
      const marketingProgram = MARKETING_PROGRAMS.find((program) => program.slug === slug);

      for (const program of [nextProgram, marketingProgram]) {
        expect(program?.curriculum).toEqual(curriculum);
        expect(program?.syllabus).toBeUndefined();
        expect(program?.duration).toBe(OWNER_PENDING_DURATION);
        expect(
          program?.courses.map(({ name, estimatedHours, description, kind }) => ({
            name,
            estimatedHours,
            description,
            kind,
          })),
        ).toEqual(
          curriculum.courses.map((course) => ({
            name: course.name,
            estimatedHours: course.hours,
            description: course.description,
            kind: 'workforceap',
          })),
        );
      }
      expect(partnerBadge(marketingProgram!)).toBe(curriculum.providers);
    },
  );

  it.each(Object.keys(EXPECTED_CURRICULA))(
    '%s keeps the course slugs that skill missions and checkpoints unlock from',
    (slug) => {
      const nextProgram = PROGRAMS.find((program) => program.slug === slug);
      const marketingProgram = MARKETING_PROGRAMS.find((program) => program.slug === slug);
      const expectedSlugs = PROGRAM_CURRICULA[slug].courses.map(
        (_, index) => `${slug}-course-${index + 1}`,
      );

      expect(nextProgram?.courses.map((course) => course.slug)).toEqual(expectedSlugs);
      expect(marketingProgram?.courses.map((course) => course.slug)).toEqual(expectedSlugs);
    },
  );

  it('gives every internal course a stable local module route and no provider identity', () => {
    for (const slug of Object.keys(EXPECTED_CURRICULA)) {
      const program = PROGRAMS.find((p) => p.slug === slug);
      expect(program).toBeDefined();

      for (const course of program!.courses) {
        expect(course.kind).toBe('workforceap');
        expect(course.courseraCourseId).toBeUndefined();
        expect(course.courseraSlug).toBeUndefined();
        const href = workforceApCourseHref(course.slug, slug);
        expect(href).toBe(`/dashboard/learning/modules/${course.slug}?program=${slug}`);
        expect(href.toLowerCase()).not.toContain('coursera');
      }
    }
  });

  it('uses the exact official CLA and CLT assessment-domain set', () => {
    const curriculum = PROGRAM_CURRICULA['certified-logistics-technician-clt'];
    expect(curriculum.certificationTargets).toEqual(OFFICIAL_CLA_CLT_DOMAINS);

    const mappedDomains = new Set(
      curriculum.courses.flatMap((course) => course.certificationAlignment),
    );
    expect([...mappedDomains].sort()).toEqual([...OFFICIAL_CLA_CLT_DOMAINS].sort());
    for (const course of curriculum.courses) {
      expect(course.certificationAlignment.every((domain) =>
        OFFICIAL_CLA_CLT_DOMAINS.includes(domain as typeof OFFICIAL_CLA_CLT_DOMAINS[number]),
      )).toBe(true);
    }
  });

  it('source-locks the CLT domain manifest and materially covers metric conversions', () => {
    const curriculum = PROGRAM_CURRICULA['certified-logistics-technician-clt'];
    expect(curriculum.certificationReference).toEqual({
      title: 'Certified Logistics Technician — Critical Work Functions Covered by MSSC Courses and Assessments',
      url: 'https://www.msscusa.org/wp-content/uploads/2015/11/CLT-Key-Activities.pdf',
      verifiedOn: '2026-08-30',
    });

    const technologyCourse = curriculum.courses.find(
      (course) => course.name === 'Supply Chain Technology and SAP',
    );
    expect(technologyCourse?.certificationAlignment).toContain(
      'Measurements and metric conversions',
    );
    expect(technologyCourse?.description).toMatch(/inches to millimeters/i);
    expect(technologyCourse?.description).toMatch(/pounds to kilograms/i);
    expect(technologyCourse?.description).toMatch(/cubic feet to cubic meters/i);
    expect(technologyCourse?.description).toMatch(/Fahrenheit to Celsius/i);
  });

  it('maps the formerly missing CLA domains into substantive courses, not only exam review', () => {
    const curriculum = PROGRAM_CURRICULA['certified-logistics-technician-clt'];
    const expectedCourseByDomain = {
      'Material handling equipment': 'Warehouse Operations',
      'Safety principles': 'Warehouse Operations',
      'Quality control principles': 'Inventory Management and Control',
      'Workplace communications': 'Introduction to Supply Chain Management',
      'Teamwork and workplace behavior to solve problems': 'Introduction to Supply Chain Management',
      'Using computers': 'Supply Chain Technology and SAP',
    } as const;

    for (const [domain, courseName] of Object.entries(expectedCourseByDomain)) {
      const course = curriculum.courses.find((candidate) => candidate.name === courseName);
      expect(course?.certificationAlignment).toContain(domain);
      expect(course?.name).not.toBe('CLT Certification Preparation');
    }
  });

  it('fails closed on pending facts in public detail and official price-list templates', () => {
    const detailTemplate = readFileSync(
      join(process.cwd(), 'marketing/src/pages/programs/[slug].astro'),
      'utf8',
    );
    const priceListTemplate = readFileSync(
      join(process.cwd(), 'marketing/src/pages/programs/price-list.astro'),
      'utf8',
    );

    expect(detailTemplate).toContain("program.curriculum?.status === 'owner-verified'");
    expect(detailTemplate).toContain('No program-owner-supplied syllabus is on file for this program.');
    expect(detailTemplate).toMatch(/are not\s+published here as verified program facts/);
    expect(detailTemplate).toContain('Certification this training prepares you to pursue.');
    expect(detailTemplate).toContain('program.curriculum.deliveryFormat');
    expect(detailTemplate).toContain('program.curriculum.totalHoursLabel');
    expect(detailTemplate).toContain('program.curriculum.tuitionAndFees');
    const officialSlugs = verifiedProgramPriceRows(MARKETING_PROGRAMS).map((row) => row.slug);
    for (const slug of Object.keys(EXPECTED_CURRICULA)) expect(officialSlugs).not.toContain(slug);
    expect(priceListTemplate).toMatch(/are not\s+published as official price-list facts/);
    expect(priceListTemplate).toContain("const CONTENT_VERIFIED = 'August 30, 2026'");
  });
});
