export const REFERRAL_SOURCE_OTHER_PARTNER = 'Other Partner (write in)';
export const REFERRAL_SOURCE_COMMUNITY_AMBASSADOR = 'Community Ambassador (write in)';

/**
 * Partner / referral organisations in the order ops asked for on the 9/2/26
 * change list (PurposeWorks first, then LPJC, the two Capital Area boards,
 * Community Ambassador, then the alphabetical partner list, "Other Partner"
 * last). Generic non-partner channels follow in GENERIC_REFERRAL_CHANNELS.
 */
export const PARTNER_REFERRAL_SOURCES = [
  'PurposeWorks / Job Seekers Network',
  'Launch Pad Job Club (LPJC)',
  'Workforce Solutions Capital Area',
  'Workforce Solutions Rural Capital Area',
  REFERRAL_SOURCE_COMMUNITY_AMBASSADOR,
  'ACC (Austin Community College)',
  'African American Youth Harvest Foundation (AAYHF)',
  'AISD',
  'Austin Area Urban League (AAUL)',
  'Austin Career Institute',
  'Austin Free-Net',
  'Austin Public Health (APH)',
  'Big Austin',
  'Boys and Girls Clubs',
  'Building Promise',
  'Capital Idea',
  'City of Austin',
  'Concordia College',
  'Concordia High School',
  'Community First (Mobile Loaves and Fishes)',
  'EGBI',
  'Gary Job Corps',
  'Goodwill Central Texas',
  'Latinitas',
  'LifeAnew',
  'Lifeworks',
  'MSRW Management',
  'North East High School (Reagan)',
  'Southern Careers Institute',
  'State of Texas',
  'Texas Empowerment Academy',
  'Universal Tech Movement (UTM)',
  'Veterans Affairs (VA)',
  'Workforce Solutions Alamo',
  'Workforce Solutions Central Texas',
  'Workforce Solutions Greater Dallas',
  'Workforce Solutions Gulf Coast',
  'Workforce Solutions (Other)',
  'YMCA',
  '100 Black Men of Austin',
  REFERRAL_SOURCE_OTHER_PARTNER,
] as const;

/** Non-partner ways people hear about WorkforceAP; kept after the partner list. */
export const GENERIC_REFERRAL_CHANNELS = [
  'Texas Workforce Commission (TWC)',
  '211 Texas',
  'Community organization',
  'Church or faith community',
  'Flyer or brochure',
  'Friend or family',
  'Google / web search',
  'Social media',
  'WorkforceAP counselor or team member',
  'Other / write in',
] as const;

export const CENTRAL_TEXAS_REFERRAL_SOURCES = [
  ...PARTNER_REFERRAL_SOURCES,
  ...GENERIC_REFERRAL_CHANNELS,
] as const;

// `CENTRAL_TEXAS_REFERRAL_SOURCES` is both the public/member intake option list
// and the fallback when the referral-sources API cannot reach the database.

/**
 * Regional workforce board names requested on the 9/2/26 list (WAP-54). Each is
 * an alternate or formal name of a board that is already a selectable row, so
 * they are accepted and normalised onto that row rather than added as rows.
 *
 * Evidence (public records, 2026-09-20):
 * - "Capital Area Workforce Development Board" is the Texas Workforce
 *   Commission board-area name for the board operating as Workforce Solutions
 *   Capital Area (TWC board directory: Workforce Solutions Capital Area serves
 *   Travis County; legal entity on GuideStar EIN 74-2327454, formerly branded
 *   WorkSource). One organisation, one row.
 * - "Travis County Workforce Development Board" is not an incorporated board.
 *   TWC assigns Travis County to the Capital Area board, and Travis County's
 *   own "Workforce Development Task Force" is a county planning body, not a
 *   referral partner. Treated as a descriptive alias of the Capital Area board.
 * - "Rural Capital Area Workforce Development Board, Inc." (EIN 74-2487795) is
 *   the legal name doing business as Workforce Solutions Rural Capital Area
 *   (nine counties: Bastrop, Blanco, Burnet, Caldwell, Fayette, Hays, Lee,
 *   Llano, Williamson).
 */
export const REGIONAL_BOARD_NAME_ALIASES = [
  'Capital Area Workforce Development Board',
  'Travis County Workforce Development Board',
  'Rural Capital Area Workforce Development Board',
] as const;

/** Historical admin values remain accepted so stale tabs and older records keep working. */
const LEGACY_ADMIN_REFERRAL_SOURCE_OPTIONS = [
  'Workforce Solutions',
  // Requested regional board names: accepted for imports and stale clients,
  // collapsed onto the canonical Workforce Solutions rows in every menu.
  ...REGIONAL_BOARD_NAME_ALIASES,
  // Pre-9/2/26 spellings of rows that were renamed on the ops list.
  'Purpose Works / Job Seekers Network',
  'Launch Pad Job Club',
  'African American Youth Harvest Foundation',
  'Austin Area Urban League',
  '100 Black Men',
  'Community Organization',
  'Flyer or Brochure',
  'WorkforceAP Counselor',
  'Referral',
  'Community Event',
  'Social Media',
  'Church',
] as const;

export const ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES = [
  ...CENTRAL_TEXAS_REFERRAL_SOURCES,
  ...LEGACY_ADMIN_REFERRAL_SOURCE_OPTIONS,
] as const;

const REFERRAL_SOURCE_SEMANTIC_ALIASES: Readonly<Record<string, string>> = {
  // Ops list spellings that mean the same organisation as an existing option.
  'launch pad job club': 'launch pad job club (lpjc)',
  lpjc: 'launch pad job club (lpjc)',
  'purpose works / job seekers network': 'purposeworks / job seekers network',
  purposeworks: 'purposeworks / job seekers network',
  'purpose works': 'purposeworks / job seekers network',
  'workforce capital area': 'workforce solutions capital area',
  'workforce rural capital area': 'workforce solutions rural capital area',
  // Regional board names (WAP-54) — see REGIONAL_BOARD_NAME_ALIASES.
  'capital area workforce development board': 'workforce solutions capital area',
  'capital area workforce development board, inc.': 'workforce solutions capital area',
  'capital area workforce board': 'workforce solutions capital area',
  'workforce solutions capital area workforce board': 'workforce solutions capital area',
  'wfs capital area': 'workforce solutions capital area',
  'travis county workforce development board': 'workforce solutions capital area',
  'travis county workforce board': 'workforce solutions capital area',
  'rural capital area workforce development board': 'workforce solutions rural capital area',
  'rural capital area workforce development board, inc.': 'workforce solutions rural capital area',
  'rural capital area workforce board': 'workforce solutions rural capital area',
  'wfs rural capital area': 'workforce solutions rural capital area',
  'workforce solutions': 'workforce solutions (other)',
  'community ambassador': 'community ambassador (write in)',
  'other partner': 'other partner (write in)',
  acc: 'acc (austin community college)',
  'austin community college': 'acc (austin community college)',
  'african american youth harvest foundation': 'african american youth harvest foundation (aayhf)',
  aayhf: 'african american youth harvest foundation (aayhf)',
  'austin area urban league': 'austin area urban league (aaul)',
  aaul: 'austin area urban league (aaul)',
  'universal tech movement': 'universal tech movement (utm)',
  utm: 'universal tech movement (utm)',
  'north east high school': 'north east high school (reagan)',
  'reagan high school': 'north east high school (reagan)',
  '100 black men': '100 black men of austin',
  'mobile loaves and fishes': 'community first (mobile loaves and fishes)',
  'community first': 'community first (mobile loaves and fishes)',
  'veterans affairs': 'veterans affairs (va)',
  va: 'veterans affairs (va)',
  'austin public health': 'austin public health (aph)',
  aph: 'austin public health (aph)',
  'community organization': 'community organization',
  'flyer or brochure': 'flyer or brochure',
  'social media': 'social media',
  'workforceap counselor': 'workforceap counselor or team member',
  church: 'church or faith community',
};

/** Case/whitespace-insensitive identity used only to remove duplicate menu rows. */
export function normalizedReferralSourceKey(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  return REFERRAL_SOURCE_SEMANTIC_ALIASES[normalized] ?? normalized;
}

export function uniqueReferralSourceOptions(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizedReferralSourceKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Admin create-member menu: preserve every distinct historical choice while
 * collapsing only true semantic aliases and case/whitespace duplicates. */
export const ADMIN_REFERRAL_SOURCE_OPTIONS = uniqueReferralSourceOptions(
  [...CENTRAL_TEXAS_REFERRAL_SOURCES, ...LEGACY_ADMIN_REFERRAL_SOURCE_OPTIONS],
);
