import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import { updateCoachMemory, type CoachTurn } from '@/lib/coach/memory';
import { prisma } from '@/lib/db/prisma';
import { getVoiceCoachTranscriptRecipients, sendVoiceCoachTranscriptEmail } from '@/lib/email';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { checkAIToolRateLimit } from '@/lib/rate-limit';

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

function buildHistoryOutput(transcript: TranscriptTurn[]) {
  const lines: string[] = [];
  lines.push('Career and business coach transcript');
  lines.push('');
  lines.push('Transcript');
  lines.push('----------');
  transcript.forEach((turn) => {
    lines.push(`${turn.role === 'agent' ? 'Coach' : 'Member'}: ${turn.text}`);
  });
  return lines.join('\n').slice(0, 16000);
}export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const body = await readJsonObjectBody<{ transcript?: unknown; sessionId?: string }>(req);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const transcript = normalizeTranscript(body.transcript);
    if (transcript.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }
  
    try {
      await ensureUserInDb(user);
      await saveAIToolResult(
        user.id,
        'career_counselor',
        'Career and business coach voice session',
        buildHistoryOutput(transcript)
      );

      // The memory update is a paid model call on every POST. Meter it in its own
      // bucket so it never spends the member's AI tool quota; skip it when over.
      const lim = await checkAIToolRateLimit(`coach-memory:${user.id}`).catch(() => ({ success: false }));
      if (lim.success) {
        void updateCoachMemory({ userId: user.id, recentTurns: transcript as CoachTurn[] }).catch((err) => {
          console.error('[career-business-coach completion] coach memory update failed:', err);
        });
      }

      try {
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
            coachLabel: 'Career and Business Coach',
            transcriptTurns: transcript,
            sessionId: body.sessionId?.trim() || null,
          });
        }
      } catch (emailErr) {
        console.error('[career-business-coach completion] transcript email error', emailErr);
      }
  
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error('[career-business-coach completion] failed', error);
      return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/career-business-coach/completion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
