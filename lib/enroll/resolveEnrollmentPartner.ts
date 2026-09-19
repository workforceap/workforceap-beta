import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { normalizePartnerRef } from '@/lib/partner/sponsoredEnrollment';
import { enrollmentPathForSlug } from '@/lib/enroll/enrollmentPath';

export { enrollmentPathForSlug, enrollmentPathSegment } from '@/lib/enroll/enrollmentPath';

export type EnrollmentProgramCard = {
  slug: string;
  title: string;
  category: string;
  categoryColor: string;
  icon: string;
  duration: string;
  partner: string;
  skills: string[];
  featured: boolean;
  note: string | null;
};

export type EnrollmentPageModel = {
  partnerId: string;
  name: string;
  slug: string;
  referralCode: string;
  enrollmentPath: string;
  headline: string;
  blurb: string;
  schoolDistrict: string | null;
  termLabel: string;
  costSentence: string;
  programs: EnrollmentProgramCard[];
};

/** Public directory entry for partner enrollment landings (soft 404 picker). */
export type EnrollmentPartnerLink = {
  name: string;
  slug: string;
  enrollmentPath: string;
  schoolDistrict: string | null;
};

function candidateKeys(school: string): string[] {
  const key = normalizePartnerRef(school);
  if (!key) return [];
  const keys = new Set<string>([key]);
  if (!key.endsWith('-high-school')) keys.add(`${key}-high-school`);
  return [...keys];
}

function buildCostSentence(name: string, termLabel: string): string {
  return (
    `Career training and certifications offered at no cost to ${name} students for ${termLabel}` +
    ` — sponsored through the WorkforceAP–${name.replace(/ High School$/i, '')} partnership.`
  );
}

export async function resolveEnrollmentPartner(school: string): Promise<EnrollmentPageModel | null> {
  const keys = candidateKeys(school);
  if (keys.length === 0) return null;

  const partner = await prisma.partner.findFirst({
    where: {
      active: true,
      enrollmentPageEnabled: true,
      OR: [{ slug: { in: keys } }, { referralCode: { in: keys } }],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      referralCode: true,
      enrollmentHeadline: true,
      enrollmentBlurb: true,
      schoolDistrict: true,
      sponsorshipTermLabel: true,
      programCatalog: {
        orderBy: { displayOrder: 'asc' },
        select: { programSlug: true, featured: true, note: true },
      },
    },
  });
  if (!partner?.referralCode) return null;

  const programs: EnrollmentProgramCard[] = [];
  for (const row of partner.programCatalog) {
    const program = getProgramBySlug(row.programSlug);
    if (!program) continue;
    programs.push({
      slug: program.slug,
      title: program.title,
      category: program.categoryLabel,
      categoryColor: program.categoryColor,
      icon: program.icon,
      duration: program.duration,
      partner: program.partner,
      skills: program.skills.slice(0, 3),
      featured: row.featured,
      note: row.note,
    });
  }
  if (programs.length === 0) return null;

  const termLabel = partner.sponsorshipTermLabel?.trim() || new Date().getUTCFullYear().toString();
  return {
    partnerId: partner.id,
    name: partner.name,
    slug: partner.slug,
    referralCode: partner.referralCode,
    enrollmentPath: enrollmentPathForSlug(partner.slug),
    headline: partner.enrollmentHeadline?.trim() || `${partner.name} students: launch your career with an industry certification`,
    blurb: partner.enrollmentBlurb?.trim() || buildCostSentence(partner.name, termLabel),
    schoolDistrict: partner.schoolDistrict,
    termLabel,
    costSentence: buildCostSentence(partner.name, termLabel),
    programs,
  };
}

export function enrollPageCopyIsStakeSafe(text: string): boolean {
  return !/\bfree\b/i.test(text);
}

/** Humanize a URL segment for soft-404 copy (`unknown-school` → `unknown school`). */
export function humanizeEnrollmentSchoolKey(school: string): string {
  const key = normalizePartnerRef(school) || school.trim().toLowerCase();
  if (!key) return 'that school';
  return key.replace(/-/g, ' ');
}

/**
 * Active partners with a live `/enroll/[school]` page (catalog has at least one
 * known program). Used when an unknown school slug needs a recovery picker.
 */
export async function listPublicEnrollmentPartners(): Promise<EnrollmentPartnerLink[]> {
  const partners = await prisma.partner.findMany({
    where: {
      active: true,
      enrollmentPageEnabled: true,
    },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      slug: true,
      schoolDistrict: true,
      programCatalog: {
        select: { programSlug: true },
      },
    },
  });

  const links: EnrollmentPartnerLink[] = [];
  for (const partner of partners) {
    const hasProgram = partner.programCatalog.some((row) => Boolean(getProgramBySlug(row.programSlug)));
    if (!hasProgram) continue;
    links.push({
      name: partner.name,
      slug: partner.slug,
      enrollmentPath: enrollmentPathForSlug(partner.slug),
      schoolDistrict: partner.schoolDistrict,
    });
  }
  return links;
}
