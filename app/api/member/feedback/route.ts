import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { trackEvent } from '@/lib/events/track';
import { captureApiError } from '@/lib/observability/captureApiError';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const feedbackSchema = z.object({
  type: z.enum(['training', 'counselor', 'platform', 'program', 'general']),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const DEFAULT_SOURCE_PAGE = '/dashboard';
// Member portal paths only (e.g. /dashboard/help, /dashboard/profile): no
// query, hash, host or dot segments, so analytics never stores arbitrary input.
const SOURCE_PAGE_PATTERN = /^\/dashboard(?:\/[a-z0-9][a-z0-9-]*){0,4}$/;

/**
 * The member page the dialog was opened from. The body field is optional and
 * client-supplied, so anything that is not a plain member portal path falls
 * back to `/dashboard` instead of failing the submission.
 */
function resolveSourcePage(body: unknown): string {
  const raw = body && typeof body === 'object' ? (body as { sourcePage?: unknown }).sourcePage : undefined;
  return typeof raw === 'string' && raw.length <= 120 && SOURCE_PAGE_PATTERN.test(raw) ? raw : DEFAULT_SOURCE_PAGE;
}

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
    }

    const { type, rating, comment, metadata } = parsed.data;

    try {
      await ensureUserInDb(user);
      const feedback = await prisma.memberFeedback.create({
        data: {
          userId: user.id,
          type,
          rating,
          comment: comment?.trim() || null,
          metadata: metadata as unknown as Prisma.InputJsonValue ?? null,
        },
      });

      await trackEvent({
        userId: user.id,
        eventName: 'feedback_submitted',
        entityType: 'member_feedback',
        entityId: feedback.id,
        metadata: { type, rating },
        sourcePage: resolveSourcePage(body),
      });

      auditLog({ actorUserId: user.id, action: 'member.feedback.submit', targetType: 'MemberFeedback', targetId: feedback.id }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'MemberFeedback', id: feedback.id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({ feedback });
    } catch (err) {
      captureApiError(err, { route: 'member/feedback POST' });
      return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/feedback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
