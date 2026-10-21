import { Buffer } from 'node:buffer';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { extractTextFromResumeBuffer } from '@/lib/resume/extractTextFromResumeBuffer';
import {
  hasSubstantiveResumeText,
  sanitizeResumePlainText,
} from '@/lib/resume/extractionQuality';
import { isResumeObjectPathOwnedByUser } from '@/lib/resume/atomicResumeObjectSwap';

const BUCKET = 'member-resumes';

let warnedAdminUnavailable = false;

/**
 * The service-role client is optional for this best-effort reader: when the
 * deployment has no `SUPABASE_SERVICE_ROLE_KEY`, member pages must still
 * render (without resume text) rather than fall into the route error boundary.
 * Logged once per process so the misconfiguration is visible but not noisy.
 */
function tryGetSupabaseAdmin(): ReturnType<typeof getSupabaseAdmin> | null {
  try {
    return getSupabaseAdmin();
  } catch (err) {
    if (!warnedAdminUnavailable) {
      warnedAdminUnavailable = true;
      console.error(
        '[getMemberResumePlainText] Supabase admin client unavailable; resume text skipped:',
        err instanceof Error ? err.message : String(err),
      );
    }
    return null;
  }
}

/** Test-only: forget that the missing-client warning was already emitted. */
export function __resetAdminUnavailableWarningForTests(): void {
  warnedAdminUnavailable = false;
}

function extFromPath(path: string): string {
  const base = path.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1) : 'txt';
}

type ResumeReadOptions = {
  preferOriginal?: boolean;
  originalOnly?: boolean;
  enhancedOnly?: boolean;
  readOnlyAudit?: boolean;
};

export type MemberResumeLoadResult =
  | { status: 'available'; text: string }
  | { status: 'absent' | 'unavailable' | 'audit-suppressed' };

export type MemberResumeLoadStatus = MemberResumeLoadResult['status'];

/**
 * Best-effort plain text from the member's stored resume.
 * By default prefers enhanced resume (for voice/context consumers).
 * Pass `opts.preferOriginal = true` to try the original first while retaining
 * the alternate fallback. Generation must use `originalOnly` so a legacy AI
 * draft never becomes the source for another AI draft. A caller that has
 * already tried originalOnly can use `enhancedOnly` for context without
 * downloading/parsing the same failed original twice.
 */
export async function getMemberResumePlainText(
  userId: string,
  maxChars = 8000,
  opts?: ResumeReadOptions,
): Promise<string> {
  const result = await getMemberResumeLoadResult(userId, maxChars, opts);
  return result.status === 'available' ? result.text : '';
}

/**
 * The same owned-object reader with an explicit outcome for member-facing UI.
 * Only an empty metadata result confirms absence. A stored but unreadable or
 * unowned reference is unavailable; audit suppression never implies absence.
 * Database errors still propagate so existing callers retain their retry policy.
 * No storage paths or provider errors are returned to the client.
 */
export async function getMemberResumeLoadResult(
  userId: string,
  maxChars = 8000,
  opts?: ResumeReadOptions,
): Promise<MemberResumeLoadResult> {
  if (opts?.readOnlyAudit) return { status: 'audit-suppressed' };
  const profile = await prisma.profile.findUnique({
    where: { userId },
  });
  if (!profile) return { status: 'absent' };

  const candidates = (opts?.originalOnly
    ? [profile.resumeOriginalPath]
    : opts?.enhancedOnly
      ? [profile.resumeEnhancedPath]
    : opts?.preferOriginal
      ? [profile.resumeOriginalPath, profile.resumeEnhancedPath]
      : [profile.resumeEnhancedPath, profile.resumeOriginalPath]
  ).filter((p): p is string => Boolean(p));
  if (candidates.length === 0) return { status: 'absent' };
  const paths = candidates.filter((path) => isResumeObjectPathOwnedByUser(userId, path));
  if (paths.length === 0) return { status: 'unavailable' };

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) return { status: 'unavailable' };

  for (const path of paths) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) continue;

      const buf = Buffer.from(await data.arrayBuffer());
      const ext = extFromPath(path);
      const text = sanitizeResumePlainText(await extractTextFromResumeBuffer(buf, ext));
      if (hasSubstantiveResumeText(text)) {
        return { status: 'available', text: text.slice(0, maxChars) };
      }
    } catch (err) {
      // Storage or extraction failures are best-effort too: try the next path.
      console.warn('[getMemberResumePlainText] resume read failed', path, err);
    }
  }

  return { status: 'unavailable' };
}
