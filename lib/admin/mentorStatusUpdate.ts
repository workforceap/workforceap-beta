import { prisma } from '@/lib/db/prisma';
import { getResend } from '@/lib/email';
import { escapeHtml } from '@/lib/email/escapeHtml';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';

export type MentorAdminAction = 'approve' | 'deactivate' | 'activate';

/**
 * Shared mentor approve / activate / deactivate logic for admin API and server actions.
 */
export async function runMentorStatusUpdate(
  mentorId: string,
  action: MentorAdminAction
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mentor = await prisma.mentor.findUnique({
    where: { id: mentorId },
    include: { user: { select: { email: true } } },
  });
  if (!mentor) return { ok: false, error: 'Not found' };

  if (action === 'approve') {
    await prisma.mentor.update({
      where: { id: mentorId },
      data: { isActive: true, approvedAt: new Date() },
    });
    const resend = getResend();
    if (resend) {
      await sendBrandedEmailOrThrowOnSkip(resend, {
        from: process.env.EMAIL_FROM || 'noreply@workforceap.org',
        to: mentor.user.email,
        subject: 'WorkforceAP — You are approved as a mentor',
        html: `<p>Hi ${escapeHtml(mentor.fullName)},</p><p>You are approved as a WorkforceAP mentor. Thank you for volunteering your expertise.</p><p>Open your mentor dashboard: <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org'}/dashboard/mentor">Mentor Portal</a></p>`,
      });
    }
    return { ok: true };
  }

  if (action === 'deactivate') {
    await prisma.mentor.update({ where: { id: mentorId }, data: { isActive: false } });
    return { ok: true };
  }

  if (action === 'activate') {
    await prisma.mentor.update({ where: { id: mentorId }, data: { isActive: true } });
    return { ok: true };
  }

  return { ok: false, error: 'Invalid action' };
}
