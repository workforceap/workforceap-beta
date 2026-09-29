import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import {
  normalizeResumeCoachTranscript,
  parseResumeCoachSuggestionsFromTranscript,
} from '@/lib/ai/parseResumeCoachSuggestions';
import { prisma } from '@/lib/db/prisma';
import { updateCoachMemory, type CoachTurn } from '@/lib/coach/memory';
import { getVoiceCoachTranscriptRecipients, sendVoiceCoachTranscriptEmail } from '@/lib/email';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { checkAIToolRateLimit } from '@/lib/rate-limit';

const MAX_HISTORY_CHARS = 16000;

type ResumeTranscriptTurn = { speaker: 'agent' | 'user'; text: string };

function buildHistoryOutput(transcript: ResumeTranscriptTurn[], suggestions: Array<{ original?: string; suggested: string; context: string }>): string {
  const lines: string[] = [];
  lines.push('Resume voice coach transcript');
  lines.push('');
  lines.push(`Suggestions detected: ${suggestions.length}`);
  lines.push('');
  if (suggestions.length > 0) {
    lines.push('Suggestions');
    lines.push('-----------');
    suggestions.forEach((s, i) => {
      const original = s.original?.trim();
      if (original) {
        lines.push(`${i + 1}. Replace "${original}" with "${s.suggested}"`);
      } else {
        lines.push(`${i + 1}. Add "${s.suggested}"`);
      }
      lines.push(`   Why: ${s.context}`);
    });
    lines.push('');
  }
  lines.push('Transcript');
  lines.push('----------');
  transcript.forEach((turn) => {
    lines.push(`${turn.speaker === 'agent' ? 'Coach' : 'Member'}: ${turn.text}`);
  });
  return lines.join('\n').slice(0, MAX_HISTORY_CHARS);
}export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const body = await readJsonObjectBody<{ transcript?: Array<{ speaker: string; text: string }> }>(req);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const { transcript: rawTranscript } = body;
  
    const transcript = normalizeResumeCoachTranscript(rawTranscript ?? []);
    if (!transcript?.length) {
      return NextResponse.json({ suggestions: [] });
    }
  
    const suggestions = await parseResumeCoachSuggestionsFromTranscript(transcript);
  
    try {
      await ensureUserInDb(user);
      const inputSummary = `Resume Helper voice session (${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'})`;
      const output = buildHistoryOutput(transcript, suggestions);
      await saveAIToolResult(user.id, 'resume_rewriter', inputSummary, output);

      const coachTranscript: CoachTurn[] = transcript.map((turn) => ({
        role: turn.speaker === 'agent' ? 'agent' : 'user',
        text: turn.text,
      }));
      // The memory update is a paid model call on every POST. Meter it in its own
      // bucket so it never spends the member's AI tool quota; skip it when over.
      const lim = await checkAIToolRateLimit(`coach-memory:${user.id}`).catch(() => ({ success: false }));
      if (lim.success) {
        void updateCoachMemory({ userId: user.id, recentTurns: coachTranscript }).catch((err) => {
          console.error('[parse-suggestions] coach memory update failed:', err);
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
            coachLabel: 'Resume Coach',
            transcriptTurns: transcript.map((turn) => ({
              role: turn.speaker === 'agent' ? 'agent' : 'user',
              text: turn.text,
            })),
            highlights: suggestions.map((suggestion) => {
              const original = suggestion.original?.trim();
              if (original) return `Replace "${original}" with "${suggestion.suggested}". Why: ${suggestion.context}`;
              return `Add "${suggestion.suggested}". Why: ${suggestion.context}`;
            }),
          });
        }
      } catch (emailErr) {
        console.error('[parse-suggestions] failed to email session transcript', emailErr);
      }
    } catch (saveErr) {
      console.error('[parse-suggestions] failed to persist session transcript', saveErr);
    }
  
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('/member/resume-coach/parse-suggestions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
