import {
  hasSubstantiveResumeText,
  sanitizeResumePlainText,
} from '@/lib/resume/extractionQuality';
import { STUDIO_DRAFT_KEY_PREFIX } from '@/lib/resume/studioDraft';

export interface PendingResumeDraft {
  text: string;
  resumeRevision: string;
  ownerToken: string;
}

export const PENDING_RESUME_DRAFT_KEY_PREFIX = 'wap:resume-coach:pending-draft:';
export const LEGACY_PENDING_RESUME_DRAFT_KEY = 'wap:resume-coach:pending-draft';

interface DraftStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Logout boundary: resume PII must not survive into another account session. */
export function purgePendingResumeDrafts(storage: DraftStorage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key === LEGACY_PENDING_RESUME_DRAFT_KEY
      || key?.startsWith(PENDING_RESUME_DRAFT_KEY_PREFIX)
      || key?.startsWith(STUDIO_DRAFT_KEY_PREFIX)) {
      storage.removeItem(key);
    }
  }
}

export function serializePendingResumeDraft(draft: PendingResumeDraft): string {
  return JSON.stringify(draft);
}

/** Recover only a draft owned by this authenticated member and exact profile revision. */
export function parsePendingResumeDraft(
  raw: string,
  expectedOwnerToken: string,
  expectedResumeRevision: string,
): PendingResumeDraft | null {
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof PendingResumeDraft, unknown>>;
    if (value.ownerToken !== expectedOwnerToken
      || value.resumeRevision !== expectedResumeRevision
      || typeof value.text !== 'string') {
      return null;
    }
    const text = sanitizeResumePlainText(value.text);
    return hasSubstantiveResumeText(text)
      ? { text, ownerToken: expectedOwnerToken, resumeRevision: expectedResumeRevision }
      : null;
  } catch {
    return null;
  }
}
