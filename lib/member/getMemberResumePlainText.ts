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
  opts?: { preferOriginal?: boolean; originalOnly?: boolean; enhancedOnly?: boolean; readOnlyAudit?: boolean }
): Promise<string> {
  if (opts?.readOnlyAudit) return '';
  const profile = await prisma.profile.findUnique({
    where: { userId },
  });
  if (!profile) return '';

  const paths = (opts?.originalOnly
    ? [profile.resumeOriginalPath]
    : opts?.enhancedOnly
      ? [profile.resumeEnhancedPath]
    : opts?.preferOriginal
      ? [profile.resumeOriginalPath, profile.resumeEnhancedPath]
      : [profile.resumeEnhancedPath, profile.resumeOriginalPath]
  ).filter((p): p is string => Boolean(p) && isResumeObjectPathOwnedByUser(userId, p as string));
  if (paths.length === 0) return '';

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) return '';

  for (const path of paths) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) continue;

      const buf = Buffer.from(await data.arrayBuffer());
      const ext = extFromPath(path);
      const text = sanitizeResumePlainText(await extractTextFromResumeBuffer(buf, ext));
      if (hasSubstantiveResumeText(text)) {
        return text.slice(0, maxChars);
      }
    } catch (err) {
      // Storage or extraction failures are best-effort too: try the next path.
      console.warn('[getMemberResumePlainText] resume read failed', path, err);
    }
  }

  return '';
}
