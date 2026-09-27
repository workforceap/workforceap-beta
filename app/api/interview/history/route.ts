import { NextRequest, NextResponse } from 'next/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import { claudeChat } from '@/lib/ai/anthropicChat';
import { updateCoachMemory, type CoachTurn } from '@/lib/coach/memory';
import { prisma } from '@/lib/db/prisma';
import { sendVoiceInterviewTranscriptEmail } from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { checkAIToolRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const ALLOWED_TYPES = ['technical', 'behavioral', 'general'] as const;
type InterviewType = (typeof ALLOWED_TYPES)[number];

interface HistoryBody {
  sessionId?: string;
  answers?: string[];
  questions?: string[];
  role?: string;
  interviewType?: string;
  transcriptTurns?: { role: 'agent' | 'user'; text: string }[];
}

async function generateFeedback(params: {
  role: string;
  interviewType: InterviewType;
  answers: string[];
  questions: string[];
}): Promise<string> {
  const transcript = params.answers
    .map((answer, index) => {
      const question = params.questions[index] ?? `Question ${index + 1}`;
      return `Q${index + 1}: ${question}\nA${index + 1}: ${answer}`;
    })
    .join('\n\n');

  const systemPrompt = 'You are an interview coach. Provide concise, actionable feedback with clear strengths and improvements.';
  const userPrompt = [
    `Role: ${params.role}`,
    `Interview type: ${params.interviewType}`,
    'Review this interview transcript and provide:',
    '1) A brief overall assessment',
    '2) Top 3 strengths',
    '3) Top 3 areas to improve',
    '4) One concrete next-step action',
    '',
    transcript,
  ].join('\n');

  const feedback = await claudeChat(systemPrompt, userPrompt, { maxTokens: 900, temperature: 0.3 });
  if (feedback) return feedback;

  throw new Error('No AI provider configured — set ANTHROPIC_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY');
}async function _GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const limit = parseInt(new URL(req.url).searchParams.get('limit') ?? '10') || 10;
  
    const results = await prisma.$transaction((tx) => tx.aIToolResult.findMany({
      where: { userId: user.id, toolType: 'interview_coach' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: { id: true, inputSummary: true, output: true, createdAt: true },
    }));
  
    const sessions = results.map(r => {
      try {
        const data = JSON.parse(r.output) as {
          role?: string;
          interviewType?: string;
          feedback?: string;
          questions?: string[];
          answers?: string[];
          sessionId?: string;
          transcriptTurns?: { role: 'agent' | 'user'; text: string }[];
        };
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          role: data.role || r.inputSummary,
          interviewType: data.interviewType || 'behavioral',
          feedback: data.feedback || '',
          questions: data.questions || [],
          answers: data.answers || [],
          sessionId: data.sessionId || r.id,
          transcriptTurns: Array.isArray(data.transcriptTurns) ? data.transcriptTurns : [],
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('/interview/history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { success: aiRateOk } = await checkAIToolRateLimit(user.id);
    if (!aiRateOk) return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });

    const body = await readJsonObjectBody<HistoryBody>(req);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  
    const rateLimitResult = await checkAIToolRateLimit(user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again in an hour.' }, { status: 429 });
    }

    const role = (body.role?.trim() ?? '').slice(0, 200);
    const interviewTypeRaw = body.interviewType?.trim().toLowerCase() ?? '';
    const sessionId = body.sessionId?.trim() ?? '';
  
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
  
    if (!role) {
      return NextResponse.json({ error: 'role is required' }, { status: 400 });
    }
  
    if (!ALLOWED_TYPES.includes(interviewTypeRaw as InterviewType)) {
      return NextResponse.json({ error: 'interviewType must be Technical, Behavioral, or General' }, { status: 400 });
    }
  
    const answers = Array.isArray(body.answers)
      ? body.answers.slice(0, 20).map((answer) => String(answer).trim().slice(0, 3000)).filter((answer) => answer.length > 0)
      : [];
    if (answers.length === 0) {
      return NextResponse.json({ error: 'answers are required' }, { status: 400 });
    }
  
    const questions = Array.isArray(body.questions)
      ? body.questions.slice(0, 20).map((question) => String(question).trim().slice(0, 1000)).filter((question) => question.length > 0)
      : [];
    const transcriptTurns: { role: 'agent' | 'user'; text: string }[] = Array.isArray(body.transcriptTurns)
      ? body.transcriptTurns
          .map((turn): { role: 'agent' | 'user'; text: string } => ({
            role: turn?.role === 'agent' ? 'agent' : 'user',
            text: typeof turn?.text === 'string' ? turn.text.trim() : '',
          }))
          .filter((turn) => turn.text.length > 0)
      : [];
  
    const interviewType = interviewTypeRaw as InterviewType;
  
    try {
      const feedback = await generateFeedback({ role, interviewType, answers, questions });
  
      await ensureUserInDb(user);
      await saveAIToolResult(
        user.id,
        'interview_coach',
        `${interviewType} interview feedback for ${role}`,
        JSON.stringify({ sessionId, role, interviewType, answers, questions, transcriptTurns, feedback })
      );

      const memoryTranscript: CoachTurn[] =
        transcriptTurns.length > 0
          ? transcriptTurns
          : answers.flatMap((answer, index) => [
              { role: 'agent' as const, text: questions[index] ?? `Question ${index + 1}` },
              { role: 'user' as const, text: answer },
            ]);

      void updateCoachMemory({ userId: user.id, recentTurns: memoryTranscript }).catch((err) => {
        console.error('[interview/history] coach memory update failed:', err);
      });

      try {
        const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
          where: { id: user.id },
          select: { fullName: true, email: true },
        }));
  
        const adminUsers = await prisma.$transaction((tx) => tx.user.findMany({
          where: {
            profile: {
              is: {
                role: { in: ['admin', 'super_admin'] },
              },
            },
          },
          select: { email: true },
          take: 100,
        }));
  
        const configuredRecipients = (process.env.VOICE_INTERVIEW_TRANSCRIPT_EMAILS ?? '')
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean);
  
        const defaultRecipients = ['Michael.brown@workforceap.org', 'michael.brown2@workforceap.org', 'interviews@workforceap.org'];
  
        const recipientEmails = Array.from(
          new Set([
            ...defaultRecipients,
            ...configuredRecipients,
            ...adminUsers.map((entry) => entry.email).filter(Boolean),
          ])
        );
  
        if (recipientEmails.length > 0) {
          await sendVoiceInterviewTranscriptEmail({
            to: recipientEmails,
            subjectMemberId: user.id,
            memberName: dbUser?.fullName?.trim() || user.email || 'WorkforceAP member',
            memberEmail: dbUser?.email?.trim() || user.email || null,
            role,
            interviewType,
            transcriptTurns,
            feedback,
            sessionId,
          });
        }
      } catch (emailErr) {
        captureApiError(emailErr, { route: 'interview/history transcript email' });
      }
  
      return NextResponse.json({ feedback });
    } catch (error) {
      captureApiError(error, { route: 'interview/history' });
      return NextResponse.json({ error: 'Failed to generate feedback' }, { status: 500 });
    }
  } catch (error) {
    console.error('/interview/history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
