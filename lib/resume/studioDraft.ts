export const STUDIO_DRAFT_KEY_PREFIX = 'wap:resume-studio:draft:';
export const PREVIEW_RESUME_DRAFT_OWNER = 'preview-member';
export const STUDIO_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const STUDIO_DRAFT_CHANGED_EVENT = 'wa:resume-studio-draft-changed';
export const STUDIO_DRAFT_SESSION_ENDED_EVENT = 'wa:resume-studio-session-ended';

export type StudioDraftView = 'score' | 'rewrite';
export type ScoreDraft = { resume: string };
export type RewriteDraft = ScoreDraft & {
  jobTarget: string;
  targetSalary: string;
  targetLocation: string;
  language: 'en' | 'es' | 'fr' | 'pt';
  tone: 'professional' | 'conversational' | 'executive';
  atsOptimize: boolean;
};
export type StudioDraft = {
  version: 1;
  ownerToken: string;
  savedAt: number;
  lastView: StudioDraftView;
  score?: ScoreDraft;
  rewrite?: RewriteDraft;
};

export function studioDraftKey(ownerToken: string) {
  return `${STUDIO_DRAFT_KEY_PREFIX}${ownerToken}`;
}

const stringWithin = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

/** Reject stale/corrupt/foreign copies before any editor or Home UI consumes them. */
export function parseStudioDraft(raw: string, ownerToken: string, now = Date.now()): StudioDraft | null {
  if (raw.length > 250_000) return null;
  try {
    const value = JSON.parse(raw) as StudioDraft;
    if (!value || value.version !== 1 || value.ownerToken !== ownerToken
      || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)
      || now - value.savedAt > STUDIO_DRAFT_MAX_AGE_MS || value.savedAt > now + 60_000
      || !['score', 'rewrite'].includes(value.lastView)) return null;
    if (value.score && !stringWithin(value.score.resume, 100_000)) return null;
    const rewrite = value.rewrite;
    if (rewrite && (!stringWithin(rewrite.resume, 100_000)
      || !stringWithin(rewrite.jobTarget, 500) || !stringWithin(rewrite.targetSalary, 100)
      || !stringWithin(rewrite.targetLocation, 500)
      || !['en', 'es', 'fr', 'pt'].includes(rewrite.language)
      || !['professional', 'conversational', 'executive'].includes(rewrite.tone)
      || typeof rewrite.atsOptimize !== 'boolean')) return null;
    if (!value[value.lastView]) return null;
    return {
      version: 1, ownerToken, savedAt: value.savedAt, lastView: value.lastView,
      ...(value.score ? { score: { resume: value.score.resume } } : {}),
      ...(rewrite ? { rewrite: {
        resume: rewrite.resume, jobTarget: rewrite.jobTarget,
        targetSalary: rewrite.targetSalary, targetLocation: rewrite.targetLocation,
        language: rewrite.language, tone: rewrite.tone, atsOptimize: rewrite.atsOptimize,
      } } : {}),
    };
  } catch {
    return null;
  }
}

export function readStudioDraft(storage: Pick<Storage, 'getItem' | 'removeItem'>, ownerToken: string): StudioDraft | null {
  const key = studioDraftKey(ownerToken);
  const raw = storage.getItem(key);
  if (!raw) return null;
  const draft = parseStudioDraft(raw, ownerToken);
  if (!draft) storage.removeItem(key);
  return draft;
}
