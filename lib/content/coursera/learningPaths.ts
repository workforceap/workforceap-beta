/**
 * Coursera Learning Paths ("collections") that carry WorkforceAP programs.
 *
 * Coursera For Business exposes one umbrella program for the org ("Workforce
 * Advancement Project"). Every WAP program lives inside it as a Learning Path.
 * The enrollmentReports feed reports that path in two ways:
 *
 *   - as its own row, whose `contentId` is the path's 22-character id and whose
 *     `overallProgress` is Coursera's program-level completion; and
 *   - on every course row, as `collectionId` / `collectionName`, naming the path
 *     the learner took that course under.
 *
 * Neither fact was used before this registry existed: path rows landed in the
 * umbrella program as "unknown courses", and shared courses were attributed by
 * guessing among the programs that list them. This module is the one place
 * that knows path → WAP program. It is pure so ingestion code and `node --test`
 * can import it without the Prisma / `server-only` chain.
 *
 * Provenance: path ids come from `courseraDiscoveredCatalog.ts`
 * (`learningPathId`, captured from Coursera admin URLs). Collection ids and
 * display names for all sixteen collections come from the org's Curriculum
 * download of 2026-09-17 (`curatedCollections.generated.ts`), which also lists
 * each collection's courses; the six collections seen on the live enrollment
 * feed the same day agree with it exactly. Coursera path slugs came from a
 * read-only pass over the admin UI. `unverified` marks a path whose id has not
 * yet appeared on the live feed. Update this list when a path is created or
 * renamed in the Coursera admin UI, and regenerate the curated collections
 * module from a fresh Curriculum download in the same change.
 */
import { normalizeCourseraCourseId } from '@/lib/content/programCurriculumManifest';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

export type CourseraLearningPath = {
  /**
   * Path id as enrollmentReports `contentId` and the admin URL report it.
   * Null for a collection the Curriculum download lists but whose path id has
   * not been captured yet; such an entry is reachable by collection only.
   */
  learningPathId: string | null;
  /** Display name as Coursera exports it and as B4B reports it on the path's own row. */
  name: string;
  /** Other spellings B4B or WAP have used for the same path. */
  aliases?: readonly string[];
  /** Canonical WAP program slug, or null while the path has no WAP home. */
  programSlug: string | null;
  /** Short collection id, as enrollment rows and the Curriculum download carry it. */
  collectionId: string;
  /** Coursera URL slug of the path, from the admin UI. */
  courseraSlug?: string;
  /** True when the path id has not yet been observed on the live enrollment feed. */
  unverified?: boolean;
  note?: string;
};

export const COURSERA_LEARNING_PATHS: readonly CourseraLearningPath[] = Object.freeze([
  {
    learningPathId: 'vjCRy6uOReCwkcurjsXg3Q',
    name: 'AI Practitioner Professional Certificate',
    programSlug: 'ai-practitioner-professional-certificate-aws',
    collectionId: '0TmQl',
    courseraSlug: 'ai-practitioner-professional-learning-path-z271k',
    note:
      'Distinct from the IBM "AI and Software Developer" path (16 courses each; they share only "Introduction to Artificial Intelligence (AI)"). The WAP program row is still titled "AI Professional Developer Certificate (IBM)"; that title belongs to the other path.',
  },
  {
    learningPathId: 'fT-1P-CkT6q_tT_gpM-qJw',
    name: 'AI and Software Developer Professional Certificate (IBM)',
    programSlug: 'software-developer-professional-certificate-ibm',
    collectionId: '6m4yZ',
    courseraSlug: 'software-developer-professional-certificate-ibm-drln2',
    note: 'The WAP identifier drops the leading "AI and"; Coursera keeps it.',
  },
  {
    learningPathId: 'o9PJJ-ReQ_KTySfkXuPyHw',
    name: 'IT Support Professional Certificate (IBM)',
    programSlug: 'it-support-professional-certificate-ibm',
    collectionId: '0lodU',
  },
  {
    learningPathId: 'vaH4UkrHSKSh-FJKxxik4Q',
    name: 'Project Management Professional Certificate (Microsoft)',
    programSlug: 'project-management-professional-certificate-microsoft',
    collectionId: '1cvGr',
  },
  {
    learningPathId: 'iMhjZsGTRkSIY2bBk-ZEhA',
    // "Heath" is Coursera's spelling in both the export and the live feed; keep
    // it so exact-name matches on `collectionName` succeed.
    name: 'Medical Billing, Coding, and Heath Information Technician Certificate (MBCHIT)',
    aliases: ['Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)'],
    programSlug: 'health-information-technology-mchit',
    collectionId: 'CRbEJ',
  },
  {
    learningPathId: 'gCtwKvPFS36rcCrzxSt-Yg',
    name: 'Networking and Cybersecurity Professional Certificate (CompTIA Net+,Sec+)',
    aliases: [
      'Cybersecurity and Networking Professional Certificate (Net+,Sec+)',
      'Networking and Cybersecurity Professional Certificate (Net+, Sec+)',
    ],
    // WAP sells this combined path as its own program: the Curriculum download
    // shows the collection holding all eight Google Cybersecurity courses plus
    // ten networking courses, and thirteen of the WAP syllabus's fourteen
    // course names appear in it. Coursera runs separate Network+ (LVE2h) and
    // Security+ (sxbNZ) collections for the two single-certificate programs.
    programSlug: 'cybersecurity-professional-certificate-google',
    collectionId: '81uci',
  },
  {
    learningPathId: 'C-5mIgyaSLGuZiIMmrixWg',
    name: 'CompTIA A+ Professional Certificate (CompTIA A+)',
    aliases: ['CompTIA A+ Professional Certificate'],
    programSlug: 'comptia-a-professional-certificate',
    collectionId: 'JpPZG',
    courseraSlug: 'comptia-a-professional-certificate-pathway-b0aco',
    unverified: true,
  },
  {
    learningPathId: 'Wj6KdjQrQfm-inY0K6H5xg',
    name: 'Data Science and Database Administrative (DBA) Professional Certificate (IBM)',
    aliases: ['Data Science Professional Certificate (IBM)', 'Database Administrator (DBA) Professional Certificate (IBM)'],
    programSlug: 'data-science-professional-certificate-ibm',
    collectionId: 'pWA8u',
    unverified: true,
    note:
      'This is the live learner collection (legacy-v1). The board-approved 2026-approved-v2 curriculum for the same WAP program is a different course set with no Coursera collection yet; see docs/plans/2026-08-30-approved-coursera-curriculum-v2.md.',
  },
  {
    learningPathId: 'Dz4BBgGAS1i-AQYBgLtYgA',
    name: 'Management and Data Analyst Professional Certificate (Google/IBM)',
    aliases: [
      'Data Analytics Professional Certificate (Google)',
      'Management Analyst & Business Intelligence Professional Certificate',
    ],
    programSlug: 'data-analytics-professional-certificate-google',
    collectionId: 'Qa9KU',
    unverified: true,
    note: 'Live learner collection (legacy-v1); the approved v2 curriculum has no Coursera collection yet.',
  },
  {
    learningPathId: 'Xvd7I_wBSNO3eyP8AXjTfA',
    name: 'Digital Marketing & E-Commerce Professional Certificate (Google)',
    programSlug: 'digital-marketing-e-commerce-google',
    collectionId: 'pzskj',
    unverified: true,
  },
  {
    learningPathId: 'rrX4ZPagR5K1-GT2oGeS9Q',
    name: 'UX Design Professional Certificate (Google)',
    aliases: ['User Experience & Interface Design Professional Certificate'],
    programSlug: 'ux-design-professional-certificate-google',
    collectionId: 'h0Rk9',
    unverified: true,
    note: 'Live learner collection (legacy-v1); the approved v2 curriculum has no Coursera collection yet.',
  },
  {
    learningPathId: 'q5z39pYDSM6c9_aWA4jOLw',
    name: 'AWS Cloud Technology Professional Certificate (AWS)',
    aliases: ['AWS Cloud Technology (Amazon)', 'AWS Cloud Technology Certificate'],
    programSlug: 'aws-cloud-technology-amazon',
    collectionId: '61iuX',
    unverified: true,
  },
  {
    learningPathId: 'QnQ2KKmHTmu0Niiphy5rsQ',
    name: 'IT Automation with Python Professional Certificate (Google)',
    aliases: ['IT Automation with Python (Google)', 'IT Automation with Python Certificate (Google)'],
    programSlug: 'it-automation-with-python-google',
    collectionId: '54ljP',
    unverified: true,
  },
  {
    learningPathId: 'Qkse5-KHSUyLHufih3lMPg',
    name: 'CompTIA Network+ Professional Certificate (CompTIA Net+)',
    aliases: ['CompTIA Network+ Professional Certificate', 'CompTIA Net+ Professional Certificate (CompTIA Net+)'],
    programSlug: 'comptia-network-professional-certificate',
    collectionId: 'LVE2h',
    unverified: true,
    note: 'Shares seven networking courses with the combined Net+/Sec+ collection; the row\'s collection id decides which program a shared course counts toward.',
  },
  {
    learningPathId: 'p4o8q6jBSOOKPKuowQjjFw',
    name: 'CompTIA Security+ Professional Certificate (CompTIA Sec+)',
    aliases: ['CompTIA Security+ Professional Certificate', 'CompTIA Sec+ Professional Certificate (CompTIA Sec+)'],
    programSlug: 'comptia-security-professional-certificate',
    collectionId: 'sxbNZ',
    unverified: true,
  },
  {
    // The Curriculum download lists this collection, but no admin URL for its
    // path has been captured yet, so it is reachable by collection id only.
    // Capture the id from `/admin/content/<program>/learning-path/<id>` and
    // fill it in; nothing else needs to change.
    learningPathId: null,
    name: 'IT Support and Entry-Level Cybersecurity Professional Certificate (IBM)',
    aliases: ['IT Support and Entry-level Cybersecurity Certificate (IBM)'],
    programSlug: 'it-support-and-entry-level-cyber-security-certificate',
    collectionId: 'tEMYo',
    unverified: true,
    note: 'Path id not yet captured; the WAP program has no courseraDiscoveredCatalog entry, so its course rows stay program-level until one is added.',
  },
]);

/**
 * `contentType` values B4B uses for a path-level enrollment row. Compared
 * case-insensitively; a course row reports `Course`.
 */
export const LEARNING_PATH_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'specialization',
  'learningpath',
  'learning_path',
  'learning-path',
  's12n',
]);

export function isLearningPathContentType(contentType: string | null | undefined): boolean {
  if (typeof contentType !== 'string') return false;
  return LEARNING_PATH_CONTENT_TYPES.has(contentType.trim().toLowerCase());
}

/** Exact-name matching tolerates case and whitespace only; spelling is data. */
export function normalizeLearningPathName(name: string | null | undefined): string {
  return typeof name === 'string' ? name.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

export type LearningPathIndex = {
  byId: Map<string, CourseraLearningPath>;
  byCollectionId: Map<string, CourseraLearningPath>;
  byName: Map<string, CourseraLearningPath>;
};

export function buildLearningPathIndex(
  paths: readonly CourseraLearningPath[] = COURSERA_LEARNING_PATHS,
): LearningPathIndex {
  const index: LearningPathIndex = {
    byId: new Map(),
    byCollectionId: new Map(),
    byName: new Map(),
  };
  for (const path of paths) addLearningPathToIndex(index, path);
  return index;
}

export function addLearningPathToIndex(index: LearningPathIndex, path: CourseraLearningPath): void {
  const id = normalizeCourseraCourseId(path.learningPathId);
  const collectionId = path.collectionId.trim();
  if (!id && !collectionId) return;
  if (id) index.byId.set(id, path);
  if (collectionId) index.byCollectionId.set(collectionId, path);
  for (const name of [path.name, ...(path.aliases ?? [])]) {
    const key = normalizeLearningPathName(name);
    if (key && !index.byName.has(key)) index.byName.set(key, path);
  }
}

export function cloneLearningPathIndex(index: LearningPathIndex): LearningPathIndex {
  return {
    byId: new Map(index.byId),
    byCollectionId: new Map(index.byCollectionId),
    byName: new Map(index.byName),
  };
}

/** Look a path up by its content id, tolerating `Course~` / `Specialization~` prefixes. */
export function findLearningPathById(
  contentId: string | null | undefined,
  index: LearningPathIndex = DEFAULT_INDEX,
): CourseraLearningPath | null {
  const id = normalizeCourseraCourseId(contentId);
  return id ? index.byId.get(id) ?? null : null;
}

/** Resolve the path a course row was taken under: collection id first, then exact name. */
export function findLearningPathByCollection(
  collection: { collectionId?: string | null; collectionName?: string | null },
  index: LearningPathIndex = DEFAULT_INDEX,
): CourseraLearningPath | null {
  const collectionId = collection.collectionId?.trim();
  if (collectionId) {
    const byId = index.byCollectionId.get(collectionId);
    if (byId) return byId;
  }
  const nameKey = normalizeLearningPathName(collection.collectionName);
  return nameKey ? index.byName.get(nameKey) ?? null : null;
}

/** The canonical WAP program a path belongs to, or null while unresolved. */
export function learningPathProgramSlug(path: CourseraLearningPath | null | undefined): string | null {
  const slug = path?.programSlug?.trim();
  return slug ? canonicalizeProgramSlug(slug) : null;
}

/** Every registered path id, for SQL exclusions and seeder guards. Collection-only entries have none. */
/**
 * The shared Coursera Business B4B program every WorkforceAP learner is
 * enrolled through. It names the umbrella, never a course.
 */
export const COURSERA_UMBRELLA_PROGRAM_ID = 'TpIlAogTQ8-SJQKIE8PP9w';

export function isUmbrellaB4BProgramId(id: string | null | undefined): boolean {
  const normalized = id?.trim() ?? '';
  if (!normalized) return false;
  const configuredUmbrellaId = process.env.COURSERA_ORG_PROGRAM_ID?.trim() ?? '';
  return (
    normalized === COURSERA_UMBRELLA_PROGRAM_ID ||
    (configuredUmbrellaId.length > 0 && normalized === configuredUmbrellaId)
  );
}

/**
 * A Coursera id that names program-level progress (a registered Learning
 * Path or the B4B umbrella) can never be a course. A canonical mapping row or
 * a local progress row that carries one is stale data, not a binding:
 * honouring it would write Coursera's path percentage onto whichever syllabus
 * slot it points at (it once pointed the IBM path at "Lab, Project, and Test
 * Preparation").
 */
export function isProgramLevelCourseraId(id: string | null | undefined): boolean {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!trimmed) return false;
  return isUmbrellaB4BProgramId(trimmed) || findLearningPathById(trimmed) !== null;
}

export const KNOWN_LEARNING_PATH_IDS: readonly string[] = Object.freeze(
  COURSERA_LEARNING_PATHS.flatMap((path) => (path.learningPathId ? [path.learningPathId] : [])),
);

/** Every registered collection id; the Curriculum download must list each one. */
export const KNOWN_LEARNING_PATH_COLLECTION_IDS: readonly string[] = Object.freeze(
  COURSERA_LEARNING_PATHS.map((path) => path.collectionId),
);

const DEFAULT_INDEX = buildLearningPathIndex();
