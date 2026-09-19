import { APPLY_FLOW_DRAFT_KEY, APPLY_PROGRAM_RANKED_KEY, APPLY_PROGRAM_SLUG_KEY, type ApplyFlowDraftV1 } from './applyProgramStorage';
import { getProgramBySlug } from '@/lib/content/programs';

export const APPLY_STORAGE_KEY = 'apply_eligibility';
export const APPLY_ACCOUNT_DRAFT_KEY = 'apply_account_draft';
export const APPLY_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export type EligibilityPanel = 'funding' | 'contact' | 'background';
export type ApplyDraft = ApplyFlowDraftV1 & { panel?: EligibilityPanel };
export type SavedEligibility = Omit<Partial<ApplyFlowDraftV1>, 'version'> & {
  firstName: string; lastName: string; email: string; phone: string;
  qualifies: boolean; yesCount?: number; schoolApply?: boolean;
};

const textFields = ['firstName', 'lastName', 'email', 'phone', 'ageGroup', 'city', 'state', 'zip', 'county', 'primaryBarrier', 'layoffCompany', 'hearAbout', 'hearAboutOther', 'partnerAmbassadorReferral', 'gradeLevel', 'parentGuardianName', 'parentGuardianEmail', 'parentGuardianPhone', 'schoolName'] as const;
const answerFields = ['q1', 'q2', 'q3', 'receivingUnemployment', 'exhaustedUnemployment', 'snapWic'] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const answer = (value: unknown) => value === 'yes' || value === 'no' || value === null;
function fieldsValid(value: Record<string, unknown>): boolean {
  return textFields.every((key) => value[key] === undefined || typeof value[key] === 'string') &&
    answerFields.every((key) => value[key] === undefined || answer(value[key])) &&
    (value.primaryBarriers === undefined || (Array.isArray(value.primaryBarriers) && value.primaryBarriers.every((item) => typeof item === 'string'))) &&
    (value.ageGroup === undefined || ['', 'under_18', '18_24', '25_50', '50_plus'].includes(value.ageGroup as string));
}
function freshTimestamp(value: unknown, now: number): boolean {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 5 * 60 * 1000 && now - time <= APPLY_DRAFT_TTL_MS;
}
export function parseApplyDraft(value: unknown, now = Date.now()): ApplyDraft | null {
  if (!record(value) || value.version !== 1 || !freshTimestamp(value.updatedAt, now) || !fieldsValid(value)) return null;
  if (!['firstName', 'lastName', 'email', 'phone'].every((key) => typeof value[key] === 'string')) return null;
  if (!answer(value.q1) || !answer(value.q2)) return null;
  if (value.panel !== undefined && !['funding', 'contact', 'background'].includes(value.panel as string)) return null;
  return value as ApplyDraft;
}
export function parseSavedEligibility(value: unknown, now = Date.now()): SavedEligibility | null {
  if (!record(value) || !fieldsValid(value) || typeof value.qualifies !== 'boolean') return null;
  if (!['firstName', 'lastName', 'email', 'phone'].every((key) => typeof value[key] === 'string' && (value[key] as string).trim())) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email as string) || (value.phone as string).replace(/\D/g, '').length < 10) return null;
  if (value.schoolApply !== undefined && typeof value.schoolApply !== 'boolean') return null;
  if (value.yesCount !== undefined && (typeof value.yesCount !== 'number' || !Number.isInteger(value.yesCount) || value.yesCount < 0 || value.yesCount > 3)) return null;
  // Older completed records had no timestamp. New records expire like the v1 draft.
  if (value.updatedAt !== undefined && !freshTimestamp(value.updatedAt, now)) return null;
  if (value.schoolApply !== true && !['q1', 'q2'].every((key) => value[key] === 'yes' || value[key] === 'no')) return null;
  return value as SavedEligibility;
}

type BrowserStore = 'sessionStorage' | 'localStorage';
function readValue<T>(key: string, parse: (value: unknown) => T | null, stores: BrowserStore[]): T | null {
  if (typeof window === 'undefined') return null;
  for (const name of stores) {
    try {
      const raw = window[name].getItem(key);
      if (raw !== null) { const value = parse(JSON.parse(raw)); if (value !== null) return value; }
    } catch { /* One unavailable or corrupt store must not hide the other. */ }
  }
  return null;
}
export const readApplyDraft = () => readValue(APPLY_FLOW_DRAFT_KEY, parseApplyDraft, ['localStorage']);
export const readSavedEligibility = () => readValue(APPLY_STORAGE_KEY, parseSavedEligibility, ['sessionStorage', 'localStorage']);
export function writeBrowserValue(key: string, value: unknown, stores: BrowserStore[] = ['sessionStorage', 'localStorage']): boolean {
  if (typeof window === 'undefined') return false;
  let saved = false;
  for (const name of stores) {
    try { window[name].setItem(key, JSON.stringify(value)); saved = true; } catch { /* Report failure if neither store succeeds. */ }
  }
  return saved;
}
export function writeApplyDraft(payload: Omit<ApplyDraft, 'version' | 'updatedAt'>): boolean {
  return writeBrowserValue(APPLY_FLOW_DRAFT_KEY, { ...payload, version: 1, updatedAt: new Date().toISOString() }, ['localStorage']);
}
export function saveEligibilityForNextStep(payload: SavedEligibility): boolean {
  return writeBrowserValue(APPLY_STORAGE_KEY, payload) && JSON.stringify(readSavedEligibility()) === JSON.stringify(payload);
}
/** Browser-only ownership binding, not an authorization token. Keep the exact
 * completed eligibility snapshot attached to each new program selection. */
function eligibilitySnapshot(value: SavedEligibility): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}
export function sameEligibility(a: SavedEligibility | null, b: SavedEligibility | null): boolean {
  return Boolean(a && b && eligibilitySnapshot(a) === eligibilitySnapshot(b));
}
export function saveSelectedPrograms(slugs: string[], eligibility = readSavedEligibility()): boolean {
  if (!eligibility || !sameEligibility(eligibility, readSavedEligibility())) return false;
  const selection = { version: 1, slugs, eligibilitySnapshot: eligibilitySnapshot(eligibility) };
  return writeBrowserValue(APPLY_PROGRAM_RANKED_KEY, selection) && JSON.stringify(readSelectedPrograms(eligibility)) === JSON.stringify(slugs);
}
export function removeApplyDraft(): void {
  try { window.localStorage.removeItem(APPLY_FLOW_DRAFT_KEY); } catch { /* Best-effort cleanup after confirmed storage. */ }
}
export function clearApplyBrowserState(): void {
  if (typeof window === 'undefined') return;
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    for (const key of [APPLY_FLOW_DRAFT_KEY, APPLY_STORAGE_KEY, APPLY_ACCOUNT_DRAFT_KEY, APPLY_PROGRAM_RANKED_KEY, APPLY_PROGRAM_SLUG_KEY]) {
      try { window[name].removeItem(key); } catch { /* A storage cleanup failure must not undo a successful signup. */ }
    }
  }
}
function validProgramSlugs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3 || !value.every((slug) => typeof slug === 'string' && !!getProgramBySlug(slug))) return null;
  return [...new Set(value as string[])];
}
export function readSelectedPrograms(eligibility = readSavedEligibility()): string[] | null {
  if (typeof window === 'undefined' || !eligibility) return null;
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    try {
      const raw = window[name].getItem(APPLY_PROGRAM_RANKED_KEY);
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* A valid legacy single choice may still be present. */ }
      if (record(parsed) && parsed.version === 1 && parsed.eligibilitySnapshot === eligibilitySnapshot(eligibility)) {
        const slugs = validProgramSlugs(parsed.slugs);
        if (slugs) return slugs;
      }
      // Before paired records, choices lived only in sessionStorage. Preserve
      // that flow only with its matching, untimestamped same-session eligibility.
      // Raw local choices and a different session identity are not ownership proof.
      const legacyEligible = name === 'sessionStorage' && eligibility.updatedAt === undefined &&
        sameEligibility(eligibility, readValue(APPLY_STORAGE_KEY, parseSavedEligibility, [name]));
      if (legacyEligible) {
        const slugs = validProgramSlugs(parsed);
        if (slugs) return slugs;
        const slug = window[name].getItem(APPLY_PROGRAM_SLUG_KEY);
        if (slug && getProgramBySlug(slug)) return [slug];
      }
    } catch { /* An unavailable or corrupt store cannot prove choice ownership. */ }
  }
  return null;
}
export type AccountDraft = Partial<Record<'firstName' | 'lastName' | 'email' | 'phone' | 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'zip', string>> & { smsOptIn?: boolean; contactConsent?: boolean };
function parseAccountFields(value: unknown): AccountDraft | null {
  if (!record(value)) return null;
  const strings = ['firstName', 'lastName', 'email', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'zip'];
  if (!strings.every((key) => value[key] === undefined || typeof value[key] === 'string')) return null;
  if (!['smsOptIn', 'contactConsent'].every((key) => value[key] === undefined || typeof value[key] === 'boolean')) return null;
  return value as AccountDraft;
}
export function readAccountDraft(eligibility = readSavedEligibility()): AccountDraft | null {
  if (!eligibility) return null;
  return readValue(APPLY_ACCOUNT_DRAFT_KEY, (value): AccountDraft | null => {
    if (!record(value)) return null;
    if (value.version === 1 && value.eligibilitySnapshot === eligibilitySnapshot(eligibility)) return parseAccountFields(value.fields);
    // Legacy drafts have no revision binding. Only a matching same-session
    // applicant can establish ownership; unprovable edits are not prefilled.
    const fields = parseAccountFields(value);
    if (value.version !== undefined || !fields || eligibility.updatedAt !== undefined ||
      !sameEligibility(eligibility, readValue(APPLY_STORAGE_KEY, parseSavedEligibility, ['sessionStorage']))) return null;
    const matchesIdentity = fields.email?.trim().toLowerCase() === eligibility.email.trim().toLowerCase() &&
      fields.phone?.replace(/\D/g, '') === eligibility.phone.replace(/\D/g, '');
    return matchesIdentity ? fields : null;
  }, ['sessionStorage']);
}
export function writeAccountDraft(fields: AccountDraft, eligibility: SavedEligibility | null): boolean {
  if (!eligibility || !sameEligibility(eligibility, readSavedEligibility())) return false;
  return writeBrowserValue(APPLY_ACCOUNT_DRAFT_KEY, { version: 1, fields, eligibilitySnapshot: eligibilitySnapshot(eligibility) }, ['sessionStorage']);
}
