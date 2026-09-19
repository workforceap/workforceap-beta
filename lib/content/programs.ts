/**
 * App-side program list for enrollment, dashboard training, and curriculum
 * versioning. Not the only catalog: marketing/src/data/programs.ts feeds the
 * public/TWC hours list; OrganizationProgramCatalog gates tenant enrollability;
 * Prisma Course / B4B lists are runtime course evidence. See
 * docs/knowledge-base/architecture.md (redundant sources).
 * Icons are Lucide icon names — rendered by components that import from lucide-react.
 */

import {
  DISCOVERED_COURSERA_PROGRAMS,
  type CourseraDiscoveredCourse,
} from '@/lib/content/courseraDiscoveredCatalog';
import { getCacheOrFetch, invalidateCache } from '@/lib/cache';
import {
  PROGRAM_SLUG_ALIASES,
  canonicalizeProgramSlug,
} from '@/lib/content/programSlug';
export { PROGRAM_SLUG_ALIASES } from '@/lib/content/programSlug';
import {
  getProgramSyllabus,
  type ProgramSyllabus,
} from '../../shared/programSyllabi';
import {
  getProgramCurriculum,
  type ProgramCurriculum,
} from '../../shared/programCurricula';
import {
  DIGITALLEARN_PROVIDER_NAME,
  DIGITAL_LITERACY_DURATION_LABEL,
  DIGITAL_LITERACY_MODULES,
  DIGITAL_LITERACY_PROGRAM_SLUG,
  DIGITAL_LITERACY_PROGRAM_TITLE,
  digitalLiteracyCatalogCourses,
} from '../../shared/digitalLiteracyPathway';
import {
  getProgramCurriculumManifest,
  isApprovedCurriculumReadyForAssignment,
} from './programCurriculumManifest';

export const FUNDING_SOURCES = [
  'WIOA',
  'Grant',
  'Partners',
  'Employer',
  'Donation',
] as const;
export type FundingSource = typeof FUNDING_SOURCES[number];

export type LanguageSupportLevel = 'full' | 'subtitles' | 'ai-subtitles' | 'none';

export interface LanguageSupport {
  es: LanguageSupportLevel;
  pt: LanguageSupportLevel;
  fr: LanguageSupportLevel;
}

/** Public-facing label for program funding badges (stakeholder copy uses WIOA/Grant). */
export function formatFundingSourceLabel(source?: string): string {
  if (!source || source === 'WIOA') return 'WIOA/Grant';
  return source;
}

export const FUNDING_COLORS: Record<FundingSource, { bg: string; text: string; border: string }> = {
  WIOA:        { bg: 'rgba(43,123,185,0.18)',  text: '#6bb3f0', border: 'rgba(43,123,185,0.35)' },
  Grant:       { bg: 'rgba(74,155,79,0.18)',   text: '#6dd372', border: 'rgba(74,155,79,0.35)' },
  Partners:    { bg: 'rgba(139,74,155,0.18)',  text: '#c47fd4', border: 'rgba(139,74,155,0.35)' },
  Employer:    { bg: 'rgba(255,187,0,0.18)',   text: '#ffd966', border: 'rgba(255,187,0,0.35)' },
  Donation:    { bg: 'rgba(156,163,175,0.18)', text: '#c4c8cf', border: 'rgba(156,163,175,0.35)' },
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface ProgramCourse {
  slug: string;
  name: string;
  estimatedHours: number;
  description?: string;
  /** Explicit delivery boundary for versioned curricula. Undefined legacy rows are provider-backed by default. */
  kind?: 'coursera' | 'workforceap';
  courseraCourseId?: string;
  /** Official Coursera /learn slug supplied by the approved syllabus. */
  courseraSlug?: string;
  /** In-platform module content (Digital Literacy): attributed provider destinations. */
  lessons?: ReadonlyArray<{
    title: string;
    minutes: number;
    url: string;
    destinationKind?: 'verified-course' | 'course-materials-fallback' | 'course-details-with-materials-fallback';
    verificationLabel?: string;
    fallbackUrl?: string;
    fallbackLabel?: string;
  }>;
  /** What the member practises in this module. */
  topics?: readonly string[];
  /** External provider provenance shown alongside linked materials. */
  provider?: {
    name: string;
    url: string;
    verifiedOn?: string;
    accessNote?: string;
    languageNote?: string;
    attribution?: string;
    license?: { name: string; url: string; termsUrl?: string };
  };
}

export interface Program {
  slug: string;
  title: string;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  borderColor: string;
  icon: string;
  duration: string;
  /** @deprecated Historical unsourced catalog field; never publish or rank by it. Use occupational research. */
  salary: string;
  skills: string[];
  courses: ProgramCourse[];
  partner: string;
  /**
   * Funding source that makes this program available at no cost to members.
   */
  fundingSource?: string;
  /**
   * Coursera For Business program id (returned by `listPrograms()`). When
   * set, `getOrgScopedProgramUrl` resolves the org-scoped learner URL via
   * `idx.byId.get(courseraB4BProgramId)` directly, ahead of name matching.
   *
   * Populate from `/admin/coursera` → "List B4B programs" → copy the
   * row's `id` for the matching program. Leave undefined to fall back to
   * automatic name matching against `program.title`.
   */
  courseraB4BProgramId?: string;
  languagesSupported?: LanguageSupport;
  /** Exact TWC syllabus transcription when one has been supplied. */
  syllabus?: ProgramSyllabus;
  /**
   * WorkforceAP-authored class content for programs outside the TWC
   * submission (CPT, CLT). Never set at the same time as `syllabus`.
   */
  curriculum?: ProgramCurriculum;
  /** Exact syllabus description for regulated programs. */
  description?: string;
  /**
   * True when the approved public syllabus has changed but existing member
   * progress still belongs to the previously assigned Coursera curriculum.
   * Keep new assignments dormant until the exact versioned external track is
   * validated; existing enrollments retain their immutable legacy version.
   */
  curriculumMigrationPending?: boolean;
  /**
   * Direct link to a one-stop external course (no Coursera provisioning).
   * When set, every "enroll" / "launch" CTA for this program opens this URL
   * instead of the apply form or the Coursera launch route.
   */
  externalCourseUrl?: string;
}

function normalizeDiscoveredProgramTitle(title: string): string {
  return title.replace('Heath Information', 'Health Information').trim();
}

export function getDiscoveredProgram(program: Program | string) {
  const slug = typeof program === 'string' ? program : program.slug;
  return DISCOVERED_COURSERA_PROGRAMS[slug];
}

function inferDiscoveredPartnerLabel(program: Program | string): string | null {
  const discovered = getDiscoveredProgram(program);
  if (!discovered) return null;

  const title = normalizeDiscoveredProgramTitle(discovered.courseraCollectionTitle ?? discovered.title ?? '');
  const brandedSuffix = title.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
  const recognizedCredentialBrands = new Set(['Google', 'IBM', 'Amazon Web Services', 'Microsoft', 'CompTIA']);
  if (brandedSuffix && recognizedCredentialBrands.has(brandedSuffix)) return brandedSuffix;
  if (title.startsWith('CompTIA ')) return 'CompTIA';

  const partners = Array.from(
    new Set(
      discovered.courses
        .map((course: CourseraDiscoveredCourse) => course.partner)
        .filter((p): p is string => Boolean(p))
    )
  );
  if (partners.length === 1) return partners[0] ?? null;

  return 'Coursera partners';
}

export function getProgramDisplayTitle(program: Program | string): string {
  const syllabus = getProgramSyllabus(typeof program === 'string' ? program : program.slug);
  if (syllabus) return syllabus.title;
  const discovered = getDiscoveredProgram(program);
  if (!discovered) return typeof program === 'string' ? program : program.title;
  return normalizeDiscoveredProgramTitle(discovered.courseraCollectionTitle ?? discovered.title ?? '');
}

export function getProgramDisplayPartner(program: Program | string): string {
  if (typeof program === 'string') {
    return inferDiscoveredPartnerLabel(program) ?? program;
  }
  return inferDiscoveredPartnerLabel(program) ?? program.partner;
}

export const PROGRAM_CATEGORY_COLORS: Record<string, string> = {
  'digital-literacy': '#666',
  'it-cyber': '#ad2c4d',
  'ai-software': '#8b4a9b',
  business: '#a47f38',
  'cloud-data': '#2b7bb9',
  healthcare: '#4a9b4f',
  manufacturing: '#1a1a1a',
};

type OperationalCourseSnapshot = {
  name: string;
  hours: number;
  description: string;
};

/**
 * Frozen operational snapshots for repurposed program slugs.
 *
 * The August 2026 EDvera amendments replaced these public curricula. Existing
 * CourseProgress rows and Enterprise Coursera assignments still use the course
 * keys below, so changing them in place would make progress disappear and can
 * launch an unrelated legacy course by array index. Public marketing reads the
 * approved syllabus directly; the portal stays on this snapshot until the
 * curriculum-version migration and B4B assignment are completed together.
 */
const LEGACY_OPERATIONAL_COURSES: Readonly<Record<string, readonly OperationalCourseSnapshot[]>> = {
  'data-analytics-professional-certificate-google': [
    { name: 'Introduction to Management Consulting', hours: 5, description: 'What management consultants do and how to implement these skills in an organizational setting.' },
    { name: 'Introduction to Business Analysis', hours: 13, description: 'Learn the fundamentals of business analysis and its significance within organizations.' },
    { name: 'Introduction to Data Analytics', hours: 11, description: 'Understand the fundamentals of the management and data process, including gathering, cleaning, analyzing, and sharing data.' },
    { name: 'Foundations: Data, Data, Everywhere', hours: 12, description: 'Introduction to the world of data analytics through hands-on curriculum developed by Google.' },
    { name: 'Ask Questions to Make Data-Driven Decisions', hours: 15, description: "Build on your understanding of data analytics — ask effective questions, make data-driven decisions, and meet stakeholders' needs." },
    { name: 'Prepare Data for Exploration', hours: 18, description: 'Use tools like spreadsheets and SQL to extract and use the right data, and learn how to organize and protect data.' },
    { name: 'Retrieve and prep data', hours: 1, description: 'Retrieve and prepare data for analysis using structured tools and workflows.' },
    { name: 'Process Data from Dirty to Clean', hours: 16, description: 'Check and clean your data using spreadsheets and SQL, and verify and report your data cleaning results.' },
    { name: 'Analyze Data to Answer Questions', hours: 25, description: "Apply everything you've learned to make sense of the data you've collected." },
    { name: 'Share Data through the Art of Visualization', hours: 18, description: 'Visualize and present your data findings — including how visual dashboards bring data to life.' },
    { name: 'Google Data Analytics Capstone: Complete a Case Study', hours: 10, description: 'Complete a case study to prepare for your data analytics job hunt — commonly used by employers to assess analytical skills.' },
    { name: 'Business Analysis: Preparation Exam for ECBA Certification', hours: 3, description: 'Prepare for the Entry Certificate in Business Analysis (ECBA) exam offered by the IIBA.' },
    { name: 'Management and Data Analytics Lab and workforce readiness', hours: 13, description: 'Applied lab, project work, and workforce-readiness preparation to consolidate management and data analytics skills.' },
  ],
  'data-science-professional-certificate-ibm': [
    { name: 'What is Data Science?', hours: 12, description: "Introduces the field of data science, explaining its significance in today's data-driven world." },
    { name: 'Introduction to Data Engineering', hours: 14, description: 'Foundations of data engineering — the data-engineering lifecycle, data platforms and pipelines, and choosing the right data store for the job.' },
    { name: 'Python for Data Science, AI & Development', hours: 24, description: 'Develop core Python skills used by data scientists, AI engineers, and developers.' },
    { name: 'Databases and SQL for Data Science with Python', hours: 18, description: 'Comprehensive intro to SQL (Structured Query Language) and its application in data science.' },
    { name: 'Data Analysis with Python', hours: 16, description: 'Essential skills for analyzing data using Python, aimed at aspiring Data Scientists and Analysts.' },
    { name: 'Data Visualization with Python', hours: 19, description: 'Focuses on the essential skill of visualizing data to tell compelling stories.' },
    { name: 'Machine Learning with Python', hours: 20, description: 'Equips learners with essential skills in machine learning using Python.' },
    { name: 'Relational Database Administration (DBA)', hours: 21, description: 'Administer relational databases — access control and security, backup and recovery, monitoring, automation, and performance tuning across MySQL, PostgreSQL, and IBM Db2.' },
    { name: 'Relational Database Administration Capstone Project', hours: 16, description: 'Apply database administration skills end to end in a portfolio-ready capstone — design, ETL, security, optimization, and day-to-day database operations.' },
  ],
};

function mkProgram(
  title: string,
  category: string,
  categoryLabel: string,
  categoryColor: string,
  icon: string,
  duration: string,
  salary: string,
  skills: string[],
  courseNames: string[],
  partner: string,
  defaultHours = 10,
  /** Preserve slug when display title changes (URLs, enrollments). */
  slugOverride?: string,
  fundingSource: string = 'WIOA',
  languagesSupported?: LanguageSupport
): Program {
  const slug = slugOverride ?? slugify(title);
  const canonicalCategoryColor = PROGRAM_CATEGORY_COLORS[category] ?? categoryColor;
  const discoveredCourses = DISCOVERED_COURSERA_PROGRAMS[slug]?.courses;
  const catalogCourses: ProgramCourse[] = discoveredCourses?.length
    ? discoveredCourses.map((course: CourseraDiscoveredCourse) => ({
        slug: course.slug,
        name: course.name,
        estimatedHours: course.estimatedHours ?? defaultHours,
        courseraCourseId: course.courseId,
      }))
    : courseNames.map((name, i) => ({
        slug: `${slug}-course-${i + 1}`,
        name,
        estimatedHours: defaultHours,
      }));

  const syllabus = getProgramSyllabus(slug);
  // A program is either a TWC transcription or an in-house curriculum, never
  // both: the syllabus is the regulated source and always wins. The frozen
  // operational snapshot outranks both — see LEGACY_OPERATIONAL_COURSES.
  const curriculum = syllabus ? undefined : getProgramCurriculum(slug);
  const legacyOperationalCourses = LEGACY_OPERATIONAL_COURSES[slug];
  const operationalCourses = legacyOperationalCourses ?? syllabus?.courses;
  const normalizeCourseName = (name: string) =>
    name
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\bw\//g, 'with ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const courses: ProgramCourse[] = operationalCourses
    ? operationalCourses.map((course, index) => {
        const discovered = catalogCourses.find(
          (candidate) => normalizeCourseName(candidate.name) === normalizeCourseName(course.name),
        );
        const officialCourseraSlug =
          'courseraSlug' in course && typeof course.courseraSlug === 'string'
            ? course.courseraSlug
            : undefined;
        return {
          slug:
            discovered?.slug
            ?? officialCourseraSlug
            ?? `${slug}-course-${index + 1}`,
          name: course.name,
          estimatedHours: course.hours,
          description: course.description,
          courseraCourseId: discovered?.courseraCourseId,
          courseraSlug: discovered?.slug ?? officialCourseraSlug,
        };
      })
    : curriculum
      ? curriculum.courses.map((course, index) => {
          return {
            // In-house curricula use stable local keys even if a provider
            // discovery row later happens to share the same display name.
            slug: `${slug}-course-${index + 1}`,
            name: course.name,
            estimatedHours: course.hours,
            description: course.description,
            kind: course.kind,
          };
        })
      : catalogCourses;
  return {
    slug,
    title: syllabus?.title ?? title,
    category,
    categoryLabel,
    categoryColor: canonicalCategoryColor,
    borderColor: canonicalCategoryColor,
    icon,
    duration: syllabus
      ? `${syllabus.totalHours} hours • ${syllabus.deliveryFormat}`
      : curriculum
        ? curriculum.status === 'owner-verified'
          ? `${curriculum.totalHours} hours • ${curriculum.deliveryFormat}`
          : 'Hours and delivery format pending owner verification'
        : duration,
    salary,
    skills,
    courses,
    partner,
    fundingSource,
    courseraB4BProgramId: 'TpIlAogTQ8-SJQKIE8PP9w',
    languagesSupported,
    syllabus,
    curriculum,
    description: syllabus?.description,
    // Every regulated program with a frozen approved manifest stays dormant
    // until its exact external Coursera track is validated. This must not
    // depend on whether its legacy course keys happened to change: UX keeps
    // stable keys but still cannot accept new assignments while its approved
    // provider set is incomplete.
    curriculumMigrationPending:
      Boolean(getProgramCurriculumManifest(slug))
      && !isApprovedCurriculumReadyForAssignment(slug),
  };
}

/**
 * Ops (9/3/26): Digital Literacy is the free DigitalLearn.org pathway, opened
 * module by module inside the member portal. See shared/digitalLiteracyPathway.ts.
 */
const DIGITAL_LITERACY_PROGRAM_DURATION = DIGITAL_LITERACY_DURATION_LABEL;

export const PROGRAMS: Program[] = [
  {
    ...mkProgram(DIGITAL_LITERACY_PROGRAM_TITLE, 'digital-literacy', 'Digital Literacy', '#666', '💻', DIGITAL_LITERACY_PROGRAM_DURATION, 'Starting salary: $38K-$52K', ['Digital literacy', 'Email', 'Online safety', 'Video meetings', 'Cloud storage', 'Microsoft Word', 'Online job applications'], DIGITAL_LITERACY_MODULES.map((module) => module.name), DIGITALLEARN_PROVIDER_NAME, 1, DIGITAL_LITERACY_PROGRAM_SLUG, 'Grant', { es: 'full', pt: 'none', fr: 'none' }),
    // The ten DigitalLearn modules are WorkforceAP in-platform modules
    // (kind: 'workforceap'), so the member launch route opens the portal
    // module page with the linked lessons instead of Coursera.
    courses: digitalLiteracyCatalogCourses(DIGITAL_LITERACY_PROGRAM_SLUG),
  },
  mkProgram('IT Support Professional Certificate (IBM)', 'it-cyber', 'IT & Cybersecurity', '#ad2c4d', '💻', '3-5 months, 10 hrs/week', 'Starting salary: $55K-$72K', ['Help desk', 'Hardware', 'Software', 'Customer service'], ['Introduction to Technical Support', 'Introduction to Hardware and Operating Systems', 'Introduction to Software, Programming, and Databases', 'Introduction to Networking and Storage', 'Introduction to Cybersecurity Essentials', 'Introduction to Cloud Computing', 'Technical Support Case Studies and Capstone Project'], 'IBM', 10, undefined, 'WIOA', { es: 'ai-subtitles', pt: 'full', fr: 'ai-subtitles' }),
  mkProgram('IT Support and Entry-level Cybersecurity Certificate (IBM)', 'it-cyber-entry', 'IT & Cybersecurity', '#ad2c4d', '🛡️', '3-5 months, 10 hrs/week', 'Starting salary: $60K-$88K', ['Help desk', 'Networking', 'Security fundamentals', 'Incident response'], ['IT Support Foundations', 'Computer Hardware and Operating Systems', 'Networking Fundamentals', 'Cybersecurity Essentials', 'Entry-Level Security Operations', 'Career Preparation for IT and Cybersecurity'], 'IBM', 10, 'it-support-and-entry-level-cyber-security-certificate', 'WIOA', { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('AI Practitioner Professional Certificate (AWS)', 'ai-software', 'AI & Software Dev', '#8b4a9b', '🤖', '3-5 months, 10 hrs/week', 'Starting salary: $85K-$135K', ['AI/ML', 'Generative AI', 'AI ethics', 'NLP'], ['Introduction to Artificial Intelligence (AI)', 'Artificial Intelligence: An Overview', 'Introduction to Digital Transformation Part 1', 'AI For All', 'AI Concepts and Strategy', 'Generative AI for Everyone', 'Machine Learning for All', 'AI Ethics and Governance', 'Natural Language Processing', 'Computer Vision Fundamentals', 'AI for Healthcare', 'AI Product Management', 'Reinforcement Learning', 'AI Capstone Project', 'AI Practitioner Cert Prep', 'Emerging AI Technologies'], 'Amazon Web Services', 10, 'ai-practitioner-professional-certificate-aws', 'WIOA', { es: 'ai-subtitles', pt: 'full', fr: 'none' }),
  mkProgram('AI and Software Developer Professional Certificate (IBM)', 'ai-software', 'AI & Software Dev', '#8b4a9b', '🤖', '3-5 months, 10 hrs/week', 'Starting salary: $85K-$135K', ['Software engineering', 'Python', 'React', 'Cloud'], ['Introduction to Software Engineering', 'Introduction to HTML, CSS, & JavaScript', 'Getting Started with Git and GitHub', 'Python for Data Science, AI & Development', 'Developing Front-End Apps with React', 'Developing Back-End Apps with Node.js and Express', 'Django Application Development with SQL and Databases', 'Introduction to Containers w/ Docker, Kubernetes & OpenShift', 'Application Development using Microservices and Serverless', 'Software Developer Career Guide and Interview Preparation'], 'IBM', 10, 'software-developer-professional-certificate-ibm', 'WIOA', { es: 'ai-subtitles', pt: 'full', fr: 'none' }),
  mkProgram('Project Management Professional Certificate (Microsoft)', 'business', 'Business', '#a47f38', '💼', '3-5 months, 10 hrs/week', 'Starting salary: $82K-$112K', ['Agile', 'Scrum', 'MS Project', 'Risk management'], ['Project Management Foundations', 'Initiating and Planning Projects', 'Project Scheduling and Cost Management', 'Managing Project Risks, Changes and Stakeholders', 'Project Leadership, Communication and Stakeholder Management', 'Agile Project Management', 'Microsoft Project & Power BI for Project Managers', 'Project Management Capstone'], 'Microsoft', 10, undefined, 'WIOA', { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('Management Analyst & Business Intelligence Professional Certificate', 'cloud-data', 'Cloud & Data', '#a47f38', '📊', '3-5 months, 10 hrs/week', 'Starting salary: $72K-$102K', ['Management consulting', 'Business analysis', 'Strategy', 'Financial analysis', 'Data-driven decisions'], ['Foundations: Data, Data, Everywhere', 'Ask Questions to Make Data-Driven Decisions', 'Prepare Data for Exploration', 'Process Data from Dirty to Clean', 'Analyze Data to Answer Questions', 'Share Data Through the Art of Visualization', 'Data Analysis with R Programming', 'Google Data Analytics Capstone'], 'Google & IBM', 10, 'data-analytics-professional-certificate-google', 'WIOA', { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('Database Administrator (DBA) Professional Certificate (IBM)', 'cloud-data', 'Cloud & Data', '#a47f38', '📊', '3-5 months, 10 hrs/week', 'Starting salary: $88K-$130K', ['SQL', 'Database administration', 'Data engineering', 'Backup & recovery'], ['What is Data Science?', 'Tools for Data Science', 'Data Science Methodology', 'Python for Data Science, AI & Development', 'Python Project for Data Science', 'Databases and SQL for Data Science with Python', 'Data Analysis with Python', 'Data Visualization with Python', 'Machine Learning with Python', 'Applied Data Science Capstone'], 'IBM', 10, 'data-science-professional-certificate-ibm', 'WIOA', { es: 'ai-subtitles', pt: 'full', fr: 'ai-subtitles' }),
  mkProgram('AWS Cloud Technology Certificate', 'cloud-data', 'Cloud & Data', '#2b7bb9', '☁️', '3-5 months, 10 hrs/week', 'Starting salary: $95K-$145K', ['AWS', 'Cloud architecture', 'DevOps', 'Python'], ['Introduction to Information Technology and AWS Cloud', 'Providing Technical Support for AWS Workloads', 'Developing Applications in Python on AWS', 'Skills for Working as an AWS Cloud Consultant', 'DevOps on AWS and Project Management', 'Automation in the AWS Cloud', 'Data Analytics and Databases on AWS', 'Capstone: Following the AWS Well Architected Framework'], 'Amazon Web Services', 10, 'aws-cloud-technology-amazon', 'WIOA', { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('IT Automation with Python Certificate (Google)', 'it-cyber', 'IT & Cybersecurity', '#ad2c4d', '💻', '3-5 months, 10 hrs/week', 'Starting salary: $78K-$98K', ['Python', 'Git', 'Bash', 'APIs', 'IT automation'], ['Crash Course on Python', 'Using Python to Interact with the Operating System', 'Introduction to Git and GitHub', 'Troubleshooting and Debugging Techniques', 'Configuration Management and the Cloud', 'Automating Real-World Tasks with Python'], 'Google', 10, 'it-automation-with-python-google', 'WIOA', { es: 'full', pt: 'full', fr: 'ai-subtitles' }),
  mkProgram('CompTIA A+ Professional Certificate (CompTIA A+)', 'it-cyber', 'IT & Cybersecurity', '#ad2c4d', '🛡️', '3-5 months, 10 hrs/week', 'Starting salary: $55K-$78K', ['Hardware', 'Networking', 'Security', 'OS'], ['IT Fundamentals and Hardware Essentials', 'Networking, Peripherals, and Wireless Technologies', 'Advanced Networking, Virtualization, and IT Security', 'Foundations of Computer Hardware and Storage', 'Operating Systems and Networking Fundamentals', 'Advanced Networking, Security, and IT Operations', 'Practice Exams for CompTIA A+ Core 1 & Core 2'], 'CompTIA', 10, 'comptia-a-professional-certificate', 'WIOA', { es: 'subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('CompTIA Net+ Professional Certificate (CompTIA Net+)', 'it-cyber', 'IT & Cybersecurity', '#ad2c4d', '🛡️', '3-5 months, 10 hrs/week', 'Starting salary: $60K-$88K', ['Networking', 'TCP/IP', 'Cisco', 'Wireless'], ['Introduction to Networking', 'Networking Fundamentals', 'Introduction to Contemporary Operating Systems and Hardware', 'Introduction to Networking and Storage', 'Basics of Cisco Networking', 'CCNA Foundations', 'TCP/IP and Advanced Topics', 'Operating Systems and Networking Fundamentals', 'Network Foundations and Addressing'], 'CompTIA', 10, 'comptia-network-professional-certificate', 'WIOA', { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('CompTIA Sec+ Professional Certificate (CompTIA Sec+)', 'it-cyber', 'IT & Cybersecurity', '#ad2c4d', '🛡️', '3-5 months, 10 hrs/week', 'Starting salary: $72K-$108K', ['Network security', 'Risk management', 'Cryptography'], ['Network Security', 'Introduction to Network Security', 'System and Network Security', 'Computer Networks and Network Security'], 'CompTIA', 10, 'comptia-security-professional-certificate', 'WIOA', { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('Networking and Cybersecurity Professional Certificate (CompTIA Net+, Sec+)', 'it-cyber', 'IT & Cybersecurity', '#ad2c4d', '🛡️', '3-5 months, 10 hrs/week (164 contact hours total)', 'Starting salary: $75K-$112K', ['Networking', 'Network security', 'Incident response', 'SIEM'], ['Introduction to Networking', 'Networking Fundamentals', 'Network Foundations and Addressing', 'CCNA Foundations: Networking Basics and Cisco IOS Essentials', 'TCP/IP and Advanced Topics', 'Basics of Cisco Networking', 'Networking, Peripherals, and Wireless Technologies', 'Networking in Google Cloud: Network Security', 'Foundations of Cybersecurity', 'Connect and Protect: Networks and Network Security', 'Play It Safe: Manage Security Risks', 'Assets, Threats, and Vulnerabilities', 'Sound the Alarm: Detection and Response', 'Put It to Work: Prepare for Cybersecurity Jobs', 'CompTIA Network+ and Security+ Exam Practice'], 'Google', 10, 'cybersecurity-professional-certificate-google', 'WIOA', { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('Digital Marketing & E-Commerce Professional Certificate (Google)', 'business', 'Business', '#a47f38', '💼', '3-5 months, 10 hrs/week', 'Starting salary: $62K-$78K', ['SEO', 'SEM', 'Email marketing', 'Analytics'], ['Foundations of Digital Marketing and E-commerce', 'Attract and Engage Customers with Digital Marketing', 'From Likes to Leads: Interact with Customers Online', 'Think Outside the Inbox: Email Marketing', 'Assess for Success: Marketing Analytics and Measurement', 'Make the Sale: Build, Launch, and Manage E-commerce Stores', 'Satisfaction Guaranteed: Develop Customer Loyalty Online'], 'Google', 10, 'digital-marketing-e-commerce-google', 'WIOA', { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram('User Experience & Interface Design Professional Certificate', 'business', 'Business', '#a47f38', '💼', '3-5 months, 10 hrs/week', 'Starting salary: $88K-$120K', ['User research', 'Wireframing', 'Figma', 'Prototyping'], ['Foundations of User Experience (UX) Design', 'Start the UX Design Process: Empathize, Define, and Ideate', 'Build Wireframes and Low-Fidelity Prototypes', 'Conduct UX Research and Test Early Concepts', 'Create High-Fidelity Designs and Prototypes in Figma', 'Build Dynamic User Interfaces (UI) for Websites', 'Design a User Experience for Social Good & Prepare for Jobs', 'Lab, Project, and Test Preparation'], 'Google', 10, 'ux-design-professional-certificate-google', 'WIOA', { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' }),
  mkProgram(
    'Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)',
    'healthcare',
    'Healthcare',
    '#4a9b4f',
    '❤️',
    '3-5 months, 10 hrs/week',
    'Starting salary: $52K-$72K',
    ['Medical coding', 'EHR', 'HIPAA', 'ICD-10'],
    [
      'Medical Terminology, Anatomy, and Physiology Fundamentals',
      'Register Patients & Validate Data',
      'Revenue Cycle, Billing, and Coding',
      'The Billing and Collection Process',
      'Medical Billing and Coding Essentials',
      'Healthcare Communication and Compliance',
      'Health Information Management',
      'Medical Coding: ICD-10-CM',
      'Medical Coding: CPT & HCPCS',
      'Healthcare Reimbursement',
      'Electronic Health Records',
      'Medical Coding Capstone',
      'Healthcare Privacy and Security',
      'Medical Office Administration',
      'Medical Billing & Coding Practicum',
    ],
    'Healthcare Career Pathway',
    10,
    'health-information-technology-mchit',
    'WIOA',
    { es: 'none', pt: 'none', fr: 'none' }
  ),
  mkProgram('Certified Production Technician (CPT)', 'manufacturing', 'Manufacturing', '#1a1a1a', '🏭', '3-5 months, 10 hrs/week', 'Starting salary: $48K-$70K', ['Safety', 'Quality practices', 'Manufacturing processes', 'Maintenance awareness'], ['Introduction to Manufacturing', 'Blueprint Reading and Technical Drawing', 'Machining and CNC Operations', 'Welding Fundamentals', 'Quality Control and Inspection', 'Safety and OSHA Compliance', 'Lean Manufacturing Principles', 'Production Technology Capstone'], 'MSSC / NAM', 10, undefined, 'WIOA', { es: 'none', pt: 'none', fr: 'none' }),
  mkProgram('Certified Logistics Technician (CLT)', 'manufacturing', 'Manufacturing', '#1a1a1a', '🏭', '3-5 months, 10 hrs/week', 'Starting salary: $55K-$78K', ['Logistics fundamentals', 'Safety', 'Inventory', 'Material handling', 'Transportation'], ['Introduction to Supply Chain Management', 'Inventory Management and Control', 'Transportation and Distribution', 'Warehouse Operations', 'Procurement and Vendor Management', 'Supply Chain Technology and SAP', 'Global Supply Chain and Trade', 'CLT Certification Preparation'], 'MSSC / NAM', 10, undefined, 'WIOA', { es: 'none', pt: 'none', fr: 'none' }),
  mkProgram('Core Construction', 'manufacturing', 'Construction & Trades', '#1a1a1a', '🏗️', '5 hours per section', 'Starting salary: $48K-$68K', ['OSHA-10', 'Blueprint reading', 'Construction fundamentals'], ['Introduction to Construction Industry', 'Blueprint Reading and Construction Math', 'Construction Safety and OSHA-10', 'Hand and Power Tools', 'Concrete and Masonry Fundamentals', 'Carpentry and Framing Basics', 'Electrical and Plumbing Basics', 'Construction Readiness Capstone'], 'OSHA-10 / Grant', 10, 'core-construction-training-certificate', 'WIOA', { es: 'none', pt: 'none', fr: 'none' }),
];

/** Canonical number of training tracks in the public catalog (keep stats + hero aligned). */
export const WORKFORCEAP_PROGRAM_CATALOG_SIZE = PROGRAMS.length;

/**
 * Maps each program slug to skill scores across the 6 modern radar axes.
 * Scores 0–100 reflect how much the program builds competency on each axis.
 * Used by Skill Mapper to recommend programs that close skill gaps.
 */
export const PROGRAM_AXIS_MAP: Record<string, Record<string, number>> = {
  // Digital Literacy
  'digital-literacy-empowerment-class': {
    Analytics: 20, Engineering: 20, Design: 15, Strategy: 15, Ethics: 35, Research: 20,
  },
  // AI & Software Dev
  'ai-practitioner-professional-certificate-aws': {
    Analytics: 75, Engineering: 85, Design: 20, Strategy: 25, Ethics: 35, Research: 60,
  },
  'software-developer-professional-certificate-ibm': {
    Analytics: 40, Engineering: 90, Design: 35, Strategy: 25, Ethics: 25, Research: 35,
  },
  // Cloud & Data
  'aws-cloud-technology-amazon': {
    Analytics: 55, Engineering: 90, Design: 15, Strategy: 45, Ethics: 30, Research: 35,
  },
  'data-analytics-professional-certificate-google': {
    Analytics: 90, Engineering: 45, Design: 40, Strategy: 35, Ethics: 25, Research: 60,
  },
  'data-science-professional-certificate-ibm': {
    Analytics: 90, Engineering: 60, Design: 25, Strategy: 30, Ethics: 25, Research: 75,
  },
  // IT & Cybersecurity
  'comptia-a-professional-certificate': {
    Analytics: 40, Engineering: 80, Design: 10, Strategy: 25, Ethics: 35, Research: 30,
  },
  'comptia-network-professional-certificate': {
    Analytics: 45, Engineering: 85, Design: 10, Strategy: 25, Ethics: 30, Research: 30,
  },
  'comptia-security-professional-certificate': {
    Analytics: 55, Engineering: 75, Design: 10, Strategy: 40, Ethics: 65, Research: 40,
  },
  'it-support-professional-certificate-ibm': {
    Analytics: 30, Engineering: 70, Design: 10, Strategy: 20, Ethics: 45, Research: 25,
  },
  'it-support-and-entry-level-cyber-security-certificate': {
    Analytics: 35, Engineering: 70, Design: 15, Strategy: 20, Ethics: 35, Research: 30,
  },
  'it-automation-with-python-google': {
    Analytics: 45, Engineering: 85, Design: 10, Strategy: 30, Ethics: 25, Research: 35,
  },
  'cybersecurity-professional-certificate-google': {
    Analytics: 55, Engineering: 75, Design: 10, Strategy: 35, Ethics: 70, Research: 45,
  },
  // Business
  'project-management-professional-certificate-microsoft': {
    Analytics: 40, Engineering: 25, Design: 15, Strategy: 90, Ethics: 40, Research: 35,
  },
  'digital-marketing-e-commerce-google': {
    Analytics: 55, Engineering: 20, Design: 60, Strategy: 65, Ethics: 30, Research: 45,
  },
  'ux-design-professional-certificate-google': {
    Analytics: 35, Engineering: 25, Design: 90, Strategy: 30, Ethics: 35, Research: 55,
  },
  // Healthcare
  'health-information-technology-mchit': {
    Analytics: 50, Engineering: 30, Design: 10, Strategy: 25, Ethics: 75, Research: 55,
  },
  // Manufacturing
  'certified-production-technician-cpt': {
    Analytics: 35, Engineering: 70, Design: 15, Strategy: 30, Ethics: 45, Research: 25,
  },
  'certified-logistics-technician-clt': {
    Analytics: 55, Engineering: 40, Design: 10, Strategy: 65, Ethics: 30, Research: 30,
  },
  'core-construction-training-certificate': {
    Analytics: 25, Engineering: 55, Design: 20, Strategy: 25, Ethics: 60, Research: 20,
  },
};

export type RadarAxis = 'Analytics' | 'Engineering' | 'Design' | 'Strategy' | 'Service' | 'Research';
export const RADAR_AXES: RadarAxis[] = ['Analytics', 'Engineering', 'Design', 'Strategy', 'Service', 'Research'];

export interface ProgramRecommendation {
  program: Program;
  /** Which gap axis this program primarily addresses */
  primaryAxis: string;
  /** How much the program boosts the gap axis (0–100) */
  axisScore: number;
  /** Human-readable reason */
  reason: string;
  /** Total relevance score across all gap axes */
  relevance: number;
}

/**
 * Given a member skill profile and an optional target profile, recommend programs
 * that best close the member's skill gaps.
 */
export function recommendProgramsForGaps(
  memberProfile: { axis: string; value: number }[],
  targetProfile?: { axis: string; value: number }[],
  maxResults = 4,
): ProgramRecommendation[] {
  // Compute gap per axis (value is 0–1 scale)
  const gaps: { axis: string; gap: number; memberVal: number; targetVal: number }[] = RADAR_AXES.map((axis) => {
    const memberVal = memberProfile.find((p) => p.axis === axis)?.value ?? 0;
    const targetVal = targetProfile
      ? (targetProfile.find((p) => p.axis === axis)?.value ?? 0)
      : 0.7; // Default target: 70% if no occupation selected
    const gap = Math.max(0, targetVal - memberVal);
    return { axis, gap, memberVal, targetVal };
  }).filter((g) => g.gap > 0.1) // Only axes with >10% gap
    .sort((a, b) => b.gap - a.gap);

  if (gaps.length === 0) return [];

  // Score each program by how well it addresses the top gaps
  const scored: ProgramRecommendation[] = [];
  for (const program of PROGRAMS) {
    const axisMap = PROGRAM_AXIS_MAP[program.slug];
    if (!axisMap) continue;

    let totalRelevance = 0;
    let bestAxis = '';
    let bestScore = 0;

    for (const gap of gaps) {
      const programScore = axisMap[gap.axis] ?? 0;
      // Weight by gap magnitude — bigger gaps matter more
      const weighted = (programScore / 100) * gap.gap;
      totalRelevance += weighted;
      if (programScore > bestScore) {
        bestScore = programScore;
        bestAxis = gap.axis;
      }
    }

    if (totalRelevance > 0 && bestScore >= 40) {
      scored.push({
        program,
        primaryAxis: bestAxis,
        axisScore: bestScore,
        reason: `Builds ${bestAxis} skills (${bestScore}%)`,
        relevance: Math.round(totalRelevance * 100),
      });
    }
  }

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, maxResults);
}

export const PROGRAM_TITLES = PROGRAMS.map((p) => p.title) as readonly string[];

/**
 * Legacy / alternate program slugs that older enrollment / progress rows in
 * production may carry. These must resolve to canonical catalog slugs so a
 * stale `User.enrolledProgram` doesn't strand the member at /dashboard/program
 * (the picker) when their data is otherwise sound.
 *
 * If you rename a program slug in PROGRAMS, add the OLD slug here pointing at
 * the new one. The map is checked AFTER direct + slugified-title matches so
 * canonical lookups stay zero-cost.
 *
 * Legacy production enrollments can contain slugs that predate the current
 * static catalog. Keep them resolvable until the data backfill has shipped and
 * compatibility has been retained for at least one release.
 */
/** Exact historical labels already stored before the August 2026 rename. */
export const LEGACY_PROGRAM_TITLE_VALUES = [
  'Management and Data Analyst Professional Certificate (Google/IBM)',
  'Data Analytics Professional Certificate (Google)',
  'Data Science and Database Administrator (DBA) Professional Certificate (IBM)',
  'Data Science Professional Certificate (IBM)',
  'UX Design Professional Certificate (Google)',
] as const;

/**
 * Every value that can be stored on a supported production enrollment.
 * Rollups intentionally retain the stored value, so SQL cohort queries must
 * include canonical slugs, full titles, and compatibility aliases.
 */
export const SUPPORTED_PROGRAM_STORAGE_VALUES = Array.from(
  new Set([
    ...PROGRAMS.flatMap((program) => [program.slug, program.title]),
    ...Object.keys(PROGRAM_SLUG_ALIASES),
    ...LEGACY_PROGRAM_TITLE_VALUES,
  ]),
);

export const CURRICULUM_MIGRATION_PENDING_CODE = 'CURRICULUM_MIGRATION_PENDING' as const;
export const CURRICULUM_MIGRATION_PENDING_MESSAGE =
  'This program is accepting applications, but training assignment is temporarily paused while its updated Coursera curriculum is activated.';

/**
 * Public applications may keep selecting an amended program while its new
 * Enterprise Coursera curriculum is being activated. Training writers must
 * call this guard before creating or changing an enrollment so a new learner
 * is never placed into the retired curriculum retained for existing progress.
 */
export function isCurriculumMigrationPending(programValue: string | null | undefined): boolean {
  if (!programValue?.trim()) return false;
  return getProgramByInterestValue(programValue)?.curriculumMigrationPending === true;
}

/** Resolve program from stored interest (slug or full title from apply/signup lists). */
export function getProgramByInterestValue(interest: string): Program | undefined {
  const trimmed = interest.trim();
  if (!trimmed) return undefined;
  const bySlug = PROGRAMS.find((p) => p.slug === canonicalizeProgramSlug(trimmed));
  if (bySlug) return bySlug;
  const slugGuess = slugify(trimmed);
  const bySlugGuess = PROGRAMS.find((p) => p.slug === slugGuess);
  if (bySlugGuess) return bySlugGuess;
  const aliasedSlug = PROGRAM_SLUG_ALIASES[trimmed] ?? PROGRAM_SLUG_ALIASES[slugGuess];
  if (aliasedSlug) {
    const byAlias = PROGRAMS.find((p) => p.slug === aliasedSlug);
    if (byAlias) return byAlias;
  }
  return PROGRAMS.find((p) => p.title === trimmed);
}

/**
 * Resolve a catalog program from a slug or other stored label (e.g. `enrolledProgram` may be a
 * canonical slug or a full program title). Prefer this over matching `slug` alone.
 */
export function getProgramBySlug(slug: string): Program | undefined {
  return getProgramByInterestValue(slug);
}

/** Return all programs (cached 1 hour). */
export async function getAllPrograms(): Promise<Program[]> {
  return getCacheOrFetch('programs:all', () => Promise.resolve(PROGRAMS), 3600);
}

/** Invalidate all program caches. Call after catalog mutations. */
export async function invalidateProgramCache(): Promise<void> {
  await invalidateCache('programs:*');
}
