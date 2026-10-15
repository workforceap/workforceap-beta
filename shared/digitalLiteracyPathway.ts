/**
 * Workforce AP Digital Literacy Course — an attributed DigitalLearn.org pathway.
 *
 * The ten stable WorkforceAP module identities come from the Executive
 * Director's supplied sequence. Provider destinations and labels were manually
 * verified against current DigitalLearn pages on 2026-09-12. WorkforceAP links
 * out; it does not iframe, copy, or rehost DigitalLearn videos.
 */

export const DIGITAL_LITERACY_PROGRAM_SLUG = 'digital-literacy-empowerment-class';
export const DIGITAL_LITERACY_PROGRAM_TITLE = 'Workforce AP Digital Literacy Course';

/**
 * Digital literacy is the only program a signed-in member may open and
 * complete without a CourseEnrollment. Nearby slugs (aliases, category
 * labels) stay gated so an accidental rename cannot ungate other catalogs.
 */
export function isUngatedDigitalLiteracyProgram(programSlug: string): boolean {
  return programSlug === DIGITAL_LITERACY_PROGRAM_SLUG;
}
export const DIGITAL_LITERACY_FIRST_COURSE_SLUG = `${DIGITAL_LITERACY_PROGRAM_SLUG}-course-1`;
export const DIGITALLEARN_HOME_URL = 'https://www.digitallearn.org/';
export const DIGITALLEARN_COURSES_URL = 'https://www.digitallearn.org/courses';
export const DIGITALLEARN_PROVIDER_NAME = 'DigitalLearn.org';
export type DigitalLiteracyLanguage = 'en' | 'es';

/**
 * Supported by DigitalLearn's HomeController#language_toggle, including its
 * current SPA. Native links must send no referrer so its redirect_back uses
 * the provider's own catalog root. See the provider contract in the KB.
 */
export function digitalLiteracyProviderCatalogHref(
  language: DigitalLiteracyLanguage,
  provider: 'att' | 'digitallearn' = 'att',
): string {
  const host = provider === 'att' ? 'att.digitallearn.org' : 'www.digitallearn.org';
  return `https://${host}/home_language_toggle?lang=${language}`;
}

/** AT&T's curated catalog omits the supplementary productivity/job topics. */
export function digitalLiteracyModuleCatalogProvider(moduleKey: string): 'att' | 'digitallearn' {
  return [
    'computer-basics', 'internet-basics', 'email-basics', 'accounts-and-passwords',
    'video-conferencing-basics', 'cybersecurity-basics',
  ].includes(moduleKey) ? 'att' : 'digitallearn';
}

export const DIGITALLEARN_VERIFIED_ON = '2026-09-12';
export const DIGITALLEARN_TERMS_URL = 'https://training.digitallearn.org/terms_of_use';
export const DIGITALLEARN_LICENSE_NAME = 'CC BY-NC-SA 4.0';
export const DIGITALLEARN_LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';

export const DIGITALLEARN_PROVIDER = {
  name: DIGITALLEARN_PROVIDER_NAME,
  url: DIGITALLEARN_COURSES_URL,
  verifiedOn: DIGITALLEARN_VERIFIED_ON,
  accessNote: 'Course pages can be opened without signing in; a DigitalLearn account is optional.',
  languageNote: 'DigitalLearn provides an English/Español control.',
  attribution: 'Linked course content and materials are provided by DigitalLearn.org. WorkforceAP does not imply DigitalLearn endorsement.',
  license: {
    name: DIGITALLEARN_LICENSE_NAME,
    url: DIGITALLEARN_LICENSE_URL,
    termsUrl: DIGITALLEARN_TERMS_URL,
  },
} as const;

export type DigitalLiteracyDestinationKind =
  | 'verified-course'
  | 'course-materials-fallback'
  | 'course-details-with-materials-fallback';

export interface DigitalLiteracyLesson {
  title: string;
  minutes: number;
  /** Current provider page or current course-materials fallback. */
  url: string;
  destinationKind: DigitalLiteracyDestinationKind;
  verificationLabel: string;
  /** Optional provider materials page when the course details page has no playable rows. */
  fallbackUrl?: string;
  fallbackLabel?: string;
}

export interface DigitalLiteracyModule {
  /** Stable key; also used as the module's course slug suffix. */
  key: string;
  name: string;
  /** One-sentence member-facing summary. */
  summary: string;
  lessons: DigitalLiteracyLesson[];
  /** What the member practises in this module. */
  topics: string[];
}

const course = (slug: string) => `https://www.digitallearn.org/courses/${slug}`;
const verifiedCourse = (title: string, minutes: number, slug: string): DigitalLiteracyLesson => ({
  title,
  minutes,
  url: course(slug),
  destinationKind: 'verified-course',
  verificationLabel: `Verified public course page · ${DIGITALLEARN_VERIFIED_ON}`,
});

const FILE_MANAGEMENT_MATERIALS_URL =
  'https://training.digitallearn.org/courses/computer-basics-windows-10-87e0526c-b9a9-4d0b-9af2-e8db08ac85c0';
const VIDEO_CONFERENCING_MATERIALS_URL =
  'https://training.digitallearn.org/courses/video-conferencing-basics';

export const DIGITAL_LITERACY_MODULES: readonly DigitalLiteracyModule[] = [
  {
    key: 'computer-basics',
    name: 'Computer Basics',
    summary: 'Get comfortable with a computer: the parts, the mouse and keyboard, the desktop, and everyday computer use.',
    lessons: [verifiedCourse('Getting Started on a Computer', 21, 'getting-started-on-a-computer')],
    topics: [
      'What is a computer',
      'Getting started on a computer',
      'Computer components',
      'Mouse and keyboard use',
      'Desktop navigation',
      'Opening and closing programs',
      'Copy, paste, save and print',
    ],
  },
  {
    key: 'file-management-basics',
    name: 'File Management Basics',
    summary: 'Keep digital information organised: create, name, move, find, save, and delete files and folders.',
    lessons: [
      {
        title: 'Files and Folders; Saving and Closing; Deleting Files',
        minutes: 9,
        url: FILE_MANAGEMENT_MATERIALS_URL,
        destinationKind: 'course-materials-fallback',
        verificationLabel: `Verified course-materials fallback; no current self-paced deep link · ${DIGITALLEARN_VERIFIED_ON}`,
      },
      verifiedCourse('Introduction: How to Begin to Create Documents', 4, 'microsoft-word'),
      verifiedCourse('Add a Picture', 1, 'microsoft-word'),
    ],
    topics: [
      'Creating files and folders',
      'Naming, moving and deleting files',
      'Locating saved documents',
      'Uploading and downloading files',
      'Organizing digital information',
    ],
  },
  {
    key: 'internet-basics',
    name: 'Internet Basics',
    summary: 'Get online with confidence: browsers, moving around a website, searching well, and judging what you find.',
    lessons: [
      verifiedCourse('Basic Search', 7, 'basic-search'),
      verifiedCourse('Navigating a Website', 6, 'navigating-a-website'),
    ],
    topics: [
      'Connecting to the internet',
      'Using web browsers',
      'Navigating websites',
      'Using search engines',
      'Evaluating online information',
    ],
  },
  {
    key: 'email-basics',
    name: 'Email Basics',
    summary: 'Set up and run an email account: write, reply, attach, organise, and spot suspicious messages.',
    lessons: [
      verifiedCourse('Intro to Email', 15, 'intro-to-email'),
      verifiedCourse('Intro to Email 2: Beyond the Basics', 28, 'intro-to-email-2-beyond-the-basics'),
    ],
    topics: [
      'Creating an email account',
      'Writing and sending messages',
      'Reply, Reply All, CC and BCC',
      'Sending attachments',
      'Opening and downloading attachments',
      'Organizing and deleting emails',
      'Recognizing suspicious messages',
    ],
  },
  {
    key: 'accounts-and-passwords',
    name: 'Accounts and Passwords',
    summary: 'Create online accounts safely, choose strong passwords, recover access, and turn on multi-factor authentication.',
    lessons: [
      {
        title: 'Accounts and Passwords',
        minutes: 20,
        url: course('accounts-and-passwords'),
        destinationKind: 'course-details-with-materials-fallback',
        verificationLabel: `Course details and text copies verified; no playable lesson rows observed · ${DIGITALLEARN_VERIFIED_ON}`,
      },
    ],
    topics: [
      'Creating online accounts',
      'Developing secure passwords',
      'Password recovery',
      'Multi-factor authentication',
      'Protecting personal information',
    ],
  },
  {
    key: 'video-conferencing-basics',
    name: 'Video Conferencing Basics',
    summary: 'Join and host video meetings: camera, microphone, chat, screen sharing, and professional meeting habits.',
    lessons: [
      {
        title: 'Basics of Video Conferencing',
        minutes: 21,
        url: course('basics-of-video-conferencing'),
        destinationKind: 'course-details-with-materials-fallback',
        verificationLabel: `Course details verified; no playable lesson rows observed · ${DIGITALLEARN_VERIFIED_ON}`,
        fallbackUrl: VIDEO_CONFERENCING_MATERIALS_URL,
        fallbackLabel: 'Open DigitalLearn course materials instead',
      },
    ],
    topics: [
      'Setting up and using video conferencing',
      'Joining and hosting meetings',
      'Camera and microphone controls',
      'Chat and screen-sharing functions',
      'Professional video-meeting practices',
    ],
  },
  {
    key: 'cybersecurity-basics',
    name: 'Cybersecurity Basics: Online Scams and Fraud',
    summary: 'Recognise phishing and scams, avoid malware and unsafe downloads, browse safely, and protect your devices and privacy.',
    lessons: [verifiedCourse('Online Frauds and Scams (2025)', 28, 'online-frauds-and-scams-2025')],
    topics: [
      'Phishing and online scams',
      'Malware and unsafe downloads',
      'Safe browsing',
      'Internet privacy',
      'Protecting devices and personal information',
    ],
  },
  {
    key: 'cloud-storage',
    name: 'Cloud Storage',
    summary: 'Save files online, upload and download documents, share them, manage access, and collaborate.',
    lessons: [verifiedCourse('Cloud Storage', 22, 'cloud-storage')],
    topics: [
      'Saving files online',
      'Uploading and downloading documents',
      'Sharing files',
      'Managing access permissions',
      'Collaborating online',
    ],
  },
  {
    key: 'microsoft-word-basics',
    name: 'Microsoft Word Basics',
    summary: 'Create and edit documents in Word: format text, then save, download, and print.',
    lessons: [verifiedCourse('Microsoft Word', 17, 'microsoft-word')],
    topics: ['Creating and editing documents', 'Formatting text', 'Saving, downloading and printing documents'],
  },
  {
    key: 'online-job-searching',
    name: 'Online Job Searching and Applications',
    summary: 'Search for jobs online, create and upload a résumé, complete online applications, and communicate professionally.',
    lessons: [
      verifiedCourse('Online Job Searching', 22, 'online-job-searching'),
      verifiedCourse('Applying for Jobs Online', 14, 'applying-for-jobs-online'),
    ],
    topics: [
      'Searching for employment',
      'Creating and uploading résumés',
      'Completing online applications',
      'Communicating professionally with employers',
    ],
  },
];

export function digitalLiteracyModuleMinutes(module: DigitalLiteracyModule): number {
  return module.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
}

export const DIGITAL_LITERACY_TOTAL_MINUTES = DIGITAL_LITERACY_MODULES.reduce(
  (sum, module) => sum + digitalLiteracyModuleMinutes(module),
  0,
);

/** Quarter-hour catalog estimates keep both catalogs deterministic. */
export function digitalLiteracyModuleHours(module: DigitalLiteracyModule): number {
  return Math.max(0.25, Math.round((digitalLiteracyModuleMinutes(module) / 60) * 4) / 4);
}

export const DIGITAL_LITERACY_DURATION_LABEL = `Online, self-paced — ${DIGITAL_LITERACY_MODULES.length} modules, about ${Math.round(DIGITAL_LITERACY_TOTAL_MINUTES / 60)} hours of linked learning (${DIGITALLEARN_PROVIDER_NAME})`;

export const DIGITAL_LITERACY_DESCRIPTION =
  'A free, beginner-friendly, online and self-paced pathway for members who are new to computers, smartphones, or the internet. Ten WorkforceAP modules link to current DigitalLearn.org course pages or clearly labeled course-material fallbacks. DigitalLearn provides an English/Español control and does not require sign-in to open course pages. Return to WorkforceAP after each module to record completion, points, and counselor-visible progress; provider-side activity and certificates are not synced or promised.';

/** Catalog course shape shared by the Next and Astro program catalogs. */
export function digitalLiteracyCatalogCourses(programSlug: string = DIGITAL_LITERACY_PROGRAM_SLUG) {
  return DIGITAL_LITERACY_MODULES.map((module, index) => ({
    slug: `${programSlug}-course-${index + 1}`,
    name: module.name,
    estimatedHours: digitalLiteracyModuleHours(module),
    description: `${module.summary} Covers: ${module.topics.join('; ')}.`,
    kind: 'workforceap' as const,
    lessons: module.lessons,
    topics: module.topics,
    provider: DIGITALLEARN_PROVIDER,
  }));
}
