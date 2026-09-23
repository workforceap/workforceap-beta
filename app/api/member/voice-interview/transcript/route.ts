import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { prisma } from '@/lib/db/prisma';
import { getVoiceCoachTranscriptRecipients, sendVoiceCoachTranscriptEmail } from '@/lib/email';
import { completeCareerOsInterviewActions } from '@/lib/workflows/completeCareerOsActions';
import { updateCoachMemory, type CoachTurn } from '@/lib/coach/memory';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { persistEvent } from '@/lib/events/track';

type TranscriptTurn = { role: 'agent' | 'user'; text: string };

function normalizeTranscript(input: unknown): TranscriptTurn[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((turn): TranscriptTurn => ({
      role: turn && typeof turn === 'object' && 'speaker' in turn && turn.speaker === 'agent' ? 'agent' :
        turn && typeof turn === 'object' && 'role' in turn && turn.role === 'agent' ? 'agent' : 'user',
      text: turn && typeof turn === 'object' && 'text' in turn && typeof turn.text === 'string' ? turn.text.trim() : '',
    }))
    .filter((turn) => turn.text.length > 0);
}

function hasMeaningfulUserPractice(transcript: TranscriptTurn[]) {
  const userTurns = transcript.filter((turn) => turn.role === 'user');
  const meaningfulTurns = userTurns.filter((turn) => turn.text.trim().length >= 20);
  const totalUserChars = userTurns.reduce((sum, turn) => sum + turn.text.trim().length, 0);
  return meaningfulTurns.length >= 1 && totalUserChars >= 40;
}export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const body = await readJsonObjectBody<{
      transcript?: unknown;
      sessionId?: string;
      role?: string;
      interviewType?: string;
    }>(req);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const transcript = normalizeTranscript(body.transcript);
    if (transcript.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }
  
    const sessionId = body.sessionId?.trim() || null;
    const meaningfulPractice = hasMeaningfulUserPractice(transcript);
  
    try {
      if (meaningfulPractice) {
        let alreadyRecorded = false;
        if (sessionId) {
          const existing = await prisma.$transaction((tx) => tx.memberEvent.findFirst({
            where: {
              userId: user.id,
              eventName: 'career_os.interview_practice_completed',
              entityType: 'voice_interview_session',
              entityId: sessionId,
            },
            select: { id: true },
          }));
          alreadyRecorded = !!existing;
        }
  
        if (!alreadyRecorded) {
          await prisma.$transaction((tx) => persistEvent({
            userId: user.id,
            eventName: 'career_os.interview_practice_completed',
            entityType: 'voice_interview_session',
            entityId: sessionId ?? `voice-interview-${Date.now()}`,
            sourcePage: '/api/member/voice-interview/transcript',
            metadata: {
              role: body.role?.trim() || null,
              interviewType: body.interviewType?.trim() || null,
              userTurnCount: transcript.filter((turn) => turn.role === 'user').length,
            },
          }, tx));
        }
  
        await completeCareerOsInterviewActions(user.id).catch((error) => {
          console.error('[voice-interview transcript] completeCareerOsInterviewActions failed', error);
        });
      }
  
      // The memory update is a paid model call on every POST. Meter it in its own
      // bucket so it never spends the member's AI tool quota; skip it when over.
      const lim = await checkAIToolRateLimit(`coach-memory:${user.id}`).catch(() => ({ success: false }));
      if (lim.success) {
        void updateCoachMemory({ userId: user.id, recentTurns: transcript as CoachTurn[] }).catch((err) => {
          console.error('[voice-interview transcript] coach memory update failed:', err);
        });
      }

      const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
        where: { id: user.id },
        select: { fullName: true, email: true },
      }));

      const recipients = getVoiceCoachTranscriptRecipients();
      if (recipients.length > 0) {
        await sendVoiceCoachTranscriptEmail({
          to: recipients,
          memberName: dbUser?.fullName?.trim() || user.email || 'WorkforceAP member',
          memberEmail: dbUser?.email?.trim() || user.email || null,
          coachLabel: `Voice Interview${body.role?.trim() ? ` (${body.role.trim()})` : ''}`,
          transcriptTurns: transcript,
          highlights: [
            body.interviewType?.trim() ? `Interview type: ${body.interviewType.trim()}` : '',
          ].filter(Boolean),
          sessionId,
        });
      }
  
      auditLog({ actorUserId: user.id, action: 'member.voiceInterview.transcriptSaved', targetType: 'VoiceInterviewTranscript', targetId: user.id }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'VoiceInterviewTranscript', id: user.id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error('[voice-interview transcript] failed', error);
      return NextResponse.json({ error: 'Failed to email transcript' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/voice-interview/transcript:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
