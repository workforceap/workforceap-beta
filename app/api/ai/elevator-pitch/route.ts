import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { chatCompletion } from '@/lib/ai/groq';
import { ifAiUnconfigured } from '@/lib/ai/aiUnavailableResponse';
import { cleanSpokenLine } from '@/lib/ai/postProcess';
import { aiResponseLanguageInstruction, normalizeAIResponseLanguage } from '@/lib/ai/responseLanguage';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import { prefillElevatorPitch } from '@/lib/ai/prefillFromMemberState';
import { loadCoachContextBlock } from '@/lib/ai/coachContextBlock';
import { resolveActOnBehalf } from '@/lib/auth/actAsSubject';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';

import {
  getVoiceCoachTranscriptRecipients,
  sendElevatorSpeechEmail,
  sendVoiceCoachArtifactEmail,
} from '@/lib/email';

/** Minimum words for a usable 10–20 second pitch (target is 40–60). */
const MIN_PITCH_WORDS = 25;
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const unconfigured = ifAiUnconfigured();
    if (unconfigured) return unconfigured;
  
    const { success } = await checkAIToolRateLimit(user.id);
    if (!success) return NextResponse.json({ error: 'Rate limit exceeded. Please try again in a few minutes.' }, { status: 429 });
  
    let body: Record<string, string>;
    try { body = await request.json() as Record<string, string>; }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    // Body-size cap. The Record<string,string> shape has no field-level
    // schema, so user could submit megabytes of free text that all flow
    // into the Anthropic prompt (~$0.015 / 1k tokens). Cap total
    // serialized body at 32KB — more than enough for the largest
    // legitimate elevator pitch input.
    try {
      const bodyBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
      if (bodyBytes > 32_768) {
        return NextResponse.json({ error: 'Input too large' }, { status: 413 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const { name, targetRole, strengths, certifications, industry, language, subjectMemberId, sessionId } = body;
    // Fields arrive as an untyped Record — never call .trim() on them directly
    // below this point; use the `final*` values (a missing targetRole used to
    // throw inside the persist block and silently drop the saved pitch).

  
    const onBehalf = await resolveActOnBehalf(user.id, subjectMemberId ?? undefined);
    if (!onBehalf.ok) return NextResponse.json({ error: onBehalf.error }, { status: onBehalf.status });
  
    // Prefill from member state if fields missing
    let prefill: Awaited<ReturnType<typeof prefillElevatorPitch>> | null = null;
    if (!name?.trim() || !targetRole?.trim()) {
      try {
        prefill = await prefillElevatorPitch(onBehalf.subjectUserId);
      } catch (prefillErr) {
        console.error('[elevator-pitch] prefill failed', prefillErr);
      }
    }
  
    const finalName = name?.trim() || prefill?.name || '';
    const finalTargetRole = targetRole?.trim() || prefill?.targetRole || '';
    if (!finalName || !finalTargetRole) {
      return NextResponse.json(
        { error: 'Name and target role are required. Try uploading a resume or completing the career quiz so we can prefill these for you.' },
        { status: 400 }
      );
    }
  
    const finalStrengths = strengths?.trim() || prefill?.strengths || '';
    const finalCertifications = certifications?.trim() || prefill?.certifications || '';
    const finalIndustry = industry?.trim() || prefill?.industry || '';
    const normalizedLanguage = normalizeAIResponseLanguage(language as 'en' | 'es' | 'fr' | 'pt');
  
    const prompt = `Write a powerful, natural-sounding 10-20 second elevator pitch (spoken out loud) for someone with these details:
  
  Name: ${finalName}
  Target position / job title: ${finalTargetRole}
  Key strengths / what they excel at: ${finalStrengths || 'not specified'}
  Certifications / credentials: ${finalCertifications || 'not specified'}
  Target industry: ${finalIndustry || 'not specified'}
  
  Requirements:
  - ${aiResponseLanguageInstruction(normalizedLanguage)}
  - Conversational, confident tone — sounds like a real person, not a resume
  - Includes who they are, what they do best, and what they're looking for
  - Ends with a clear connection hook (e.g. "I'd love to bring this to [industry]")
  - Exactly 40-60 words when spoken at a natural pace
  - First person ("I am…", "I excel at…")
  - No corporate buzzwords or clichés
  
  Return ONLY the pitch text — no labels, no quotes, no explanation.`;
  
    const coachContextBlock = await loadCoachContextBlock(onBehalf.subjectUserId);

    try {
      const systemPrompt = `You write concise, natural elevator pitches for job seekers. ${aiResponseLanguageInstruction(normalizedLanguage)} Return only the pitch, nothing else.${coachContextBlock}`;
      let pitch = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 260, temperature: 0.7 }
      );

      // Guard against truncated / one-line output ("My name is …" and nothing
      // else). A real 10–20 second pitch is 40–60 words; retry once with an
      // explicit reminder before giving the member something unusable.
      if (pitch && countWords(cleanSpokenLine(pitch)) < MIN_PITCH_WORDS) {
        console.warn('[elevator-pitch] short output, retrying', { words: countWords(pitch) });
        // A failed retry must not throw away the pitch we already have —
        // chatCompletion throws when every provider fails (e.g. a 429 on the
        // immediate second call), so keep the first result in that case.
        let retry: string | null = null;
        try {
          retry = await chatCompletion(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `${prompt}\n\nIMPORTANT: Your previous attempt was too short. Write the COMPLETE pitch as one spoken paragraph of 40-60 words covering who they are, what they do best, and what they are looking for.` },
            ],
            { maxTokens: 260, temperature: 0.7 }
          );
        } catch (retryErr) {
          console.warn('[elevator-pitch] retry failed, keeping first result', retryErr);
        }
        if (retry && countWords(cleanSpokenLine(retry)) > countWords(cleanSpokenLine(pitch))) pitch = retry;
      }
  
      if (!pitch) return NextResponse.json({ error: 'Could not generate pitch. Try again.' }, { status: 500 });
  
      /* Strip wrapping quotes / smart quotes / common typos before persisting or returning. */
      const cleanedPitch = cleanSpokenLine(pitch);
  
      try {
        await ensureUserInDb(user);
        const trimmedPitch = cleanedPitch;
  
        await saveAIToolResult(
          onBehalf.subjectUserId,
          'career_counselor',
          `AI elevator speech for ${finalTargetRole}`,
          trimmedPitch,
          { actorUserId: onBehalf.actorUserId, actorName: onBehalf.actorName, sessionId }
        );
  
        try {
          const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
            where: { id: onBehalf.subjectUserId },
            select: { fullName: true, email: true },
          }));
  
          const recipients = getVoiceCoachTranscriptRecipients();
          if (recipients.length > 0) {
            await sendVoiceCoachArtifactEmail({
              to: recipients,
              memberName: dbUser?.fullName?.trim() || user.email || finalName || 'WorkforceAP member',
              memberEmail: dbUser?.email?.trim() || user.email || null,
              coachLabel: 'Elevator Pitch Builder',
              artifactTitle: 'Generated pitch',
              artifactBody: trimmedPitch,
              highlights: [
                `Target role: ${finalTargetRole}`,
                finalIndustry ? `Industry: ${finalIndustry}` : '',
              ].filter(Boolean),
            });
          }
        } catch (emailError) {
          console.error('[elevator-pitch] failed to email artifact', emailError);
        }
      } catch (persistError) {
        console.error('[elevator-pitch] failed to persist result', persistError);
      }
  
      let emailSent = false;
      let emailError: string | undefined;
  
      try {
        const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
          where: { id: onBehalf.subjectUserId },
          select: { fullName: true, email: true },
        }));
  
        const recipient = dbUser?.email?.trim() || (onBehalf.subjectUserId === user.id ? user.email : null) || '';
        if (recipient) {
          const emailResult = await sendElevatorSpeechEmail({
            to: recipient,
            recipientUserId: onBehalf.subjectUserId,
            memberName: dbUser?.fullName?.trim() || finalName || recipient,
            targetRole: finalTargetRole,
            strengths: finalStrengths || null,
            certifications: finalCertifications || null,
            industry: finalIndustry || null,
            pitch: cleanedPitch,
          });
          emailSent = emailResult.ok;
          emailError = emailResult.error;
        } else {
          emailError = 'No email address found for this member';
        }
      } catch (emailErr) {
        console.error('[elevator-pitch] failed to email result', emailErr);
        emailError = emailErr instanceof Error ? emailErr.message : 'Failed to send email';
      }
  
      return NextResponse.json({ pitch: cleanedPitch, emailSent, emailError });
    } catch (e) {
      console.error('[elevator-pitch] generation failed', e);
      return NextResponse.json({ error: 'We could not generate your pitch just now. Please try again in a moment.' }, { status: 500 });
    }
  } catch (error) {
    console.error('/ai/elevator-pitch:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
