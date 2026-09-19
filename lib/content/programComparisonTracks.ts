/**
 * Featured comparison tracks — slugs tie to lib/content/programs.ts.
 * Duration comes from the canonical program record. Historical salary bands
 * are not evidence of member outcomes and are excluded.
 *
 * Covers the 15 career-track programs. Excludes Digital Literacy (on-ramp)
 * and trades programs (CPT, CLT, OSHA-10) — those live on /programs.
 */

import { getProgramBySlug } from './programs';
import type { LanguageSupport, Program } from './programs';
import { getProgramExtra } from './programExtras';

export type ComparisonTrack = {
  /** Short label for dense tables */
  shortName: string;
  slug: string;
  duration: string;
  difficulty: string;
  demand: 'High' | 'Very High';
  certs: string;
  categoryLabel: string;
  categoryOrder: number;
  /** Coursera language support from the canonical program record (English always available). */
  languagesSupported?: LanguageSupport;
};

type FeaturedEntry = {
  slug: string;
  shortName: string;
  demand: 'High' | 'Very High';
  certs: string;
  categoryLabel: string;
  categoryOrder: number;
};

export const PROGRAM_COMPARISON_FEATURED: FeaturedEntry[] = [
  // IT & Cybersecurity
  {
    slug: 'it-support-professional-certificate-ibm',
    shortName: 'IT Support',
    demand: 'High',
    certs: 'IBM IT Support',
    categoryLabel: 'IT & Cybersecurity',
    categoryOrder: 1,
  },
  {
    slug: 'comptia-a-professional-certificate',
    shortName: 'CompTIA A+',
    demand: 'High',
    certs: 'CompTIA A+ Core 1 & Core 2',
    categoryLabel: 'IT & Cybersecurity',
    categoryOrder: 1,
  },
  {
    slug: 'comptia-network-professional-certificate',
    shortName: 'CompTIA Network+',
    demand: 'High',
    certs: 'CompTIA Network+',
    categoryLabel: 'IT & Cybersecurity',
    categoryOrder: 1,
  },
  {
    slug: 'comptia-security-professional-certificate',
    shortName: 'CompTIA Security+',
    demand: 'Very High',
    certs: 'CompTIA Security+',
    categoryLabel: 'IT & Cybersecurity',
    categoryOrder: 1,
  },
  {
    slug: 'cybersecurity-professional-certificate-google',
    shortName: 'Cybersecurity (Google)',
    demand: 'Very High',
    certs: 'Google Cybersecurity',
    categoryLabel: 'IT & Cybersecurity',
    categoryOrder: 1,
  },
  {
    slug: 'it-automation-with-python-google',
    shortName: 'IT Automation',
    demand: 'High',
    certs: 'Google IT Automation',
    categoryLabel: 'IT & Cybersecurity',
    categoryOrder: 1,
  },
  // Cloud & Data
  {
    slug: 'aws-cloud-technology-amazon',
    shortName: 'Cloud (AWS)',
    demand: 'Very High',
    certs: 'AWS-focused professional cert path',
    categoryLabel: 'Cloud & Data',
    categoryOrder: 2,
  },
  {
    slug: 'data-analytics-professional-certificate-google',
    shortName: 'Management Analyst & Business Intelligence Professional Certificate',
    demand: 'Very High',
    certs: 'Google/IBM Management Analysis & BI pathway',
    categoryLabel: 'Cloud & Data',
    categoryOrder: 2,
  },
  {
    slug: 'data-science-professional-certificate-ibm',
    shortName: 'Database Administrator (DBA) Professional Certificate (IBM)',
    demand: 'Very High',
    certs: 'IBM Database Administration pathway',
    categoryLabel: 'Cloud & Data',
    categoryOrder: 2,
  },
  // AI & Software Dev
  {
    slug: 'ai-practitioner-professional-certificate-aws',
    shortName: 'AI Practitioner (AWS)',
    demand: 'Very High',
    certs: 'AWS AI Practitioner',
    categoryLabel: 'AI & Software Dev',
    categoryOrder: 3,
  },
  {
    slug: 'software-developer-professional-certificate-ibm',
    shortName: 'AI & Software Dev (IBM)',
    demand: 'Very High',
    certs: 'IBM Software Developer',
    categoryLabel: 'AI & Software Dev',
    categoryOrder: 3,
  },
  // Business
  {
    slug: 'project-management-professional-certificate-microsoft',
    shortName: 'Project Management',
    demand: 'High',
    certs: 'PM foundations, Agile / Scrum',
    categoryLabel: 'Business',
    categoryOrder: 4,
  },
  {
    slug: 'digital-marketing-e-commerce-google',
    shortName: 'Digital Marketing',
    demand: 'High',
    certs: 'Google Digital Marketing & E-Commerce',
    categoryLabel: 'Business',
    categoryOrder: 4,
  },
  {
    slug: 'ux-design-professional-certificate-google',
    shortName: 'User Experience & Interface Design Professional Certificate',
    demand: 'High',
    certs: 'Google UX Design',
    categoryLabel: 'Business',
    categoryOrder: 4,
  },
  // Healthcare
  {
    slug: 'health-information-technology-mchit',
    shortName: 'Medical Billing & Health IT',
    demand: 'High',
    certs: 'ICD-10 / CPT, EHR fundamentals',
    categoryLabel: 'Healthcare',
    categoryOrder: 5,
  },
];

function difficultyStars(program: Program): string {
  const extra = getProgramExtra(program.slug);
  const d = extra?.difficulty;
  if (d === 1) return '⭐';
  if (d === 2) return '⭐⭐';
  if (d === 3) return '⭐⭐⭐';
  if (program.category === 'digital-literacy') return '⭐';
  if (program.category === 'manufacturing' || program.category === 'healthcare') return '⭐⭐';
  return '⭐⭐⭐';
}

export function getProgramComparisonTracks(): ComparisonTrack[] {
  return PROGRAM_COMPARISON_FEATURED.map(({ slug, shortName, demand, certs, categoryLabel, categoryOrder }) => {
    const program = getProgramBySlug(slug);
    if (!program) {
      throw new Error(`programComparisonTracks: missing program for slug "${slug}"`);
    }
    return {
      shortName,
      slug,
      duration: program.duration.replace(/, 10 hrs\/week/i, '').replace(/10 hrs\/week/i, '~10 hrs/wk').trim(),
      difficulty: difficultyStars(program),
      demand,
      certs,
      categoryLabel,
      categoryOrder,
      languagesSupported: program.languagesSupported,
    };
  });
}
