import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import { awardPoints } from '@/lib/member/points';
import { claudeChat } from '@/lib/ai/anthropicChat';
import { updateCoachMemory, type CoachTurn } from '@/lib/coach/memory';
import { cleanSpokenLine } from '@/lib/ai/postProcess';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getVoiceCoachTranscriptRecipients, sendVoiceCoachTranscriptEmail } from '@/lib/email';
import { checkAIToolRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';

interface FeedbackBody {
  transcript: { role: 'agent' | 'user'; text: string }[];
}

type TranscriptTurn = { role: 'agent' | 'user'; text: string };

const FALLBACK_STEPS = [
  'Update your resume with your most recent experience and skills',
  'Research 3 job listings that match your background and save them',
  'Reach out to one person in your network this week to let them know you are looking',
];

function normalizeTranscript(transcript: { role: 'agent' | 'user'; text: string }[]): TranscriptTurn[] {
  return transcript
    .map((turn): TranscriptTurn => ({
      role:
        (turn as { role?: string; speaker?: string }).role === 'agent' ||
        (turn as { role?: string; speaker?: string }).speaker === 'agent'
          ? 'agent'
          : 'user',
      text: typeof turn.text === 'string' ? turn.text.trim() : '',
    }))
    .filter((turn) => turn.text.length > 0);
}

function buildHistoryOutput(transcript: TranscriptTurn[], steps: string[]) {
  const lines: string[] = [];
  lines.push('Lilley career-coaching transcript');
  lines.push('');
  if (steps.length > 0) {
    lines.push('Action plan');
    lines.push('-----------');
    steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    lines.push('');
  }
  lines.push('Transcript');
  lines.push('----------');
  transcript.forEach((turn) => {
    lines.push(`${turn.role === 'agent' ? 'Coach' : 'Member'}: ${turn.text}`);
  });
  return lines.join('\n').slice(0, 16000);
}

async function generateActionPlan(transcript: { role: 'agent' | 'user'; text: string }[]): Promise<string[]> {
  const conversation = transcript
    .map((t) => `${t.role === 'agent' ? 'Lilley' : 'Member'}: ${t.text}`)
    .join('\n');

  const systemPrompt = `You are Lilley, a student-facing AI career coach who just finished a voice session with a WorkforceAP member.
Based on the conversation, generate exactly 3 concrete, specific action steps the member can take TODAY or THIS WEEK.
Each step should be actionable and directly tied to what they shared.
Be warm, specific, and encouraging — not generic.
Respond with ONLY a JSON array of 3 strings. Example: ["Step one", "Step two", "Step three"]`;

  const userPrompt = `Here is the conversation transcript:\n\n${conversation}\n\nGenerate 3 specific next steps.`;

  const text = await claudeChat(systemPrompt, userPrompt, { maxTokens: 400, temperature: 0.4 });
  if (text) {
    try {
      const steps = JSON.parse(text) as string[];
      if (Array.isArray(steps) && steps.length > 0) {
        return steps.slice(0, 3).map((step) => cleanSpokenLine(step));
      }
    } catch { /* fall through */ }
  }

  throw new Error('No AI provider configured — set ANTHROPIC_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY');
}export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ saved: false, error: 'Unauthorized' }, { status: 401 });
    const { success: aiRateOk } = await checkAIToolRateLimit(user.id);
    if (!aiRateOk) {
      return NextResponse.json(
        { saved: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
      );
    }

    let body: FeedbackBody;
    try {
      body = await req.json() as FeedbackBody;
    } catch {
      return NextResponse.json({ saved: false, error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ saved: false, error: 'Invalid JSON' }, { status: 400 });
    }
  
    const transcript = normalizeTranscript(Array.isArray(body.transcript) ? body.transcript : []);
  
    if (transcript.length === 0) {
      return NextResponse.json(
        {
          saved: false,
          steps: [],
          error: 'No conversation transcript was captured, so nothing was saved. Please start a new session and try again.',
        },
        { status: 422 },
      );
    }
  
    try {
      let steps = FALLBACK_STEPS;
      try {
        const generatedSteps = await generateActionPlan(transcript);
        if (generatedSteps.length > 0) {
          steps = generatedSteps;
        }
      } catch (planErr) {
        console.error('Lilley action-plan generation failed, using fallback steps:', planErr);
      }
  
      const output = buildHistoryOutput(transcript, steps);
  
      await ensureUserInDb(user);
      const resultId = await saveAIToolResult(
        user.id,
        'career_counselor',
        'Lilley career-coaching session',
        output
      );
  
      awardPoints(user.id, 'counselor_session', resultId).catch(() => {});

      void updateCoachMemory({ userId: user.id, recentTurns: transcript as CoachTurn[] }).catch((err) => {
        console.error('[counselor/feedback] coach memory update failed:', err);
      });

      try {
        const orgId = await getActorOrganizationId(user.id);
        const dbUser = await withTenantScope(orgId, (db) =>
          db.user.findFirst({
            where: { id: user.id },
            select: { fullName: true, email: true },
          }),
        );
  
        const recipients = getVoiceCoachTranscriptRecipients();
        if (recipients.length > 0) {
          await sendVoiceCoachTranscriptEmail({
            to: recipients,
            subjectMemberId: user.id,
            memberName: dbUser?.fullName?.trim() || user.email || 'WorkforceAP member',
            memberEmail: dbUser?.email?.trim() || user.email || null,
            coachLabel: 'Lilley Career Coach',
            transcriptTurns: transcript,
            highlights: steps,
          });
        }
      } catch (emailErr) {
        console.error('Lilley transcript email error:', emailErr);
      }
  
      return NextResponse.json({ saved: true, steps });
    } catch (err) {
      console.error('Lilley feedback persistence error:', err);
      return NextResponse.json(
        {
          saved: false,
          error: 'Your transcript could not be saved, so no action plan was created. Please try again.',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('/counselor/feedback:', error);
    return NextResponse.json(
      {
        saved: false,
        error: 'Your transcript could not be saved, so no action plan was created. Please try again.',
      },
      { status: 500 },
    );
  }
});
