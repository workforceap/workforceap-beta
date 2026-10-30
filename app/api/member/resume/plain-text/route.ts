import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { completeCareerOsResumeActions } from '@/lib/workflows/completeCareerOsActions';
import { prisma } from '@/lib/db/prisma';
import {
  hasSubstantiveResumeText,
  RESUME_PLAIN_TEXT_MAX_CHARS,
  RESUME_TEXT_SAVE_ERROR,
  sanitizeResumePlainText,
} from '@/lib/resume/extractionQuality';
import {
  isResumeProfileConflict,
  saveEnhancedResumeText,
} from '@/lib/resume/resumeProfileStorage';
import { getResumeProfileRevision } from '@/lib/resume/resumeProfileRevision';
import { checkResumeDraftSaveRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { success: withinSaveLimit } = await checkResumeDraftSaveRateLimit(user.id);
    if (!withinSaveLimit) {
      return NextResponse.json(
        { error: 'Resume save limit reached. Wait a moment, then save again.' },
        { status: 429 },
      );
    }

    const body = await readJsonObjectBody<{ plainText?: unknown; resumeRevision?: unknown }>(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const raw = typeof body.plainText === 'string' ? body.plainText : '';
    const safeText = sanitizeResumePlainText(raw);
    const plainText = safeText.length > RESUME_PLAIN_TEXT_MAX_CHARS
      ? safeText.slice(0, RESUME_PLAIN_TEXT_MAX_CHARS)
      : safeText;
    if (!hasSubstantiveResumeText(plainText)) {
      return NextResponse.json({ error: RESUME_TEXT_SAVE_ERROR }, { status: 400 });
    }

    const profile = await prisma.$transaction((tx) => tx.profile.findUnique({
      where: { userId: user.id },
      select: { resumeOriginalPath: true, resumeEnhancedPath: true },
    }));
    const expectedPaths = {
      resumeOriginalPath: profile?.resumeOriginalPath ?? null,
      resumeEnhancedPath: profile?.resumeEnhancedPath ?? null,
    };
    const currentRevision = getResumeProfileRevision(
      expectedPaths.resumeOriginalPath,
      expectedPaths.resumeEnhancedPath,
    );
    if (typeof body.resumeRevision !== 'string' || body.resumeRevision !== currentRevision) {
      return NextResponse.json(
        { error: 'Your resume changed in another session. Reload and try again.' },
        { status: 409 },
      );
    }

    let path: string;
    try {
      path = await saveEnhancedResumeText(user.id, plainText, expectedPaths);
    } catch (error) {
      if (isResumeProfileConflict(error)) {
        return NextResponse.json(
          { error: 'Your resume changed in another session. Reload and try again.' },
          { status: 409 },
        );
      }
      throw error;
    }

    if (plainText.trim().length >= 40) {
      await completeCareerOsResumeActions(user.id).catch((error) => {
        console.error('[member/resume/plain-text] completeCareerOsResumeActions failed:', error);
      });
    }

    auditLog({ actorUserId: user.id, action: 'member.resume.savePlainText', targetType: 'Resume', targetId: user.id }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'Resume', id: user.id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({
      ok: true,
      path,
      resumeRevision: getResumeProfileRevision(expectedPaths.resumeOriginalPath, path),
    });
  } catch (e) {
    console.error('[member/resume/plain-text] error:', e);
    return NextResponse.json({ error: 'Failed to save resume text' }, { status: 500 });
  }
});
