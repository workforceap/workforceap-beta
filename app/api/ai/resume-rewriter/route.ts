import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { resumeRewriterSchema } from '@/lib/validation/resumeRewriter';
import { chatCompletion } from '@/lib/ai/groq';
import { ifAiUnconfigured } from '@/lib/ai/aiUnavailableResponse';
import { cleanLongFormPlainText } from '@/lib/ai/postProcess';
import { aiResponseLanguageInstruction } from '@/lib/ai/responseLanguage';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import { resolveActOnBehalf } from '@/lib/auth/actAsSubject';
import { inferResumeFramework, resumeFrameworkPromptBlock, type ResumeFramework } from '@/lib/resume/inferResumeFramework';
import { prefillResumeRewriter } from '@/lib/ai/prefillFromMemberState';
import { loadCoachContextBlock } from '@/lib/ai/coachContextBlock';
import { prisma } from '@/lib/db/prisma';
import { analyzeResume } from '@/lib/ai/resumeScore';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    const unconfigured = ifAiUnconfigured();
    if (unconfigured) return unconfigured;
  
    const { success } = await checkAIToolRateLimit(user.id);
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again in a few minutes.' }, { status: 429 });
    }
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const parsed = resumeRewriterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }
  
    const { resume, jobTarget, targetSalary, targetLocation, language, subjectMemberId, sessionId, resumeFramework } =
      parsed.data;
  
    // Resolve subject FIRST so we know who to prefill for
    const onBehalf = await resolveActOnBehalf(user.id, subjectMemberId);
    if (!onBehalf.ok) {
      return NextResponse.json({ error: onBehalf.error }, { status: onBehalf.status });
    }
  
    let finalResume = resume?.trim();
    let finalJobTarget: string | null = jobTarget?.trim() ?? null;
    let framework: 'auto' | ResumeFramework = resumeFramework;
  
    // If no resume provided, try to prefill from member state
    if (!finalResume || finalResume.length < 40) {
      const prefill = await prefillResumeRewriter(onBehalf.subjectUserId);
      if (!prefill.ok) {
        return NextResponse.json({ error: prefill.error }, { status: 400 });
      }
      finalResume = prefill.resume;
      if (!finalJobTarget) finalJobTarget = prefill.jobTarget;
      if (framework === 'auto') framework = prefill.framework;
    }
  
    if (framework === 'auto') {
      const profile = await prisma.$transaction((tx) => tx.profile.findUnique({
        where: { userId: onBehalf.subjectUserId },
        select: { employmentStatus: true, educationLevel: true },
      }));
      framework = inferResumeFramework({
        employmentStatus: profile?.employmentStatus,
        educationLevel: profile?.educationLevel,
      });
    }
    const frameworkBlock = resumeFrameworkPromptBlock(framework);
  
    // Build context string for salary/location signals
    const goalContext = [
      targetSalary ? `Target salary range: ${targetSalary}` : null,
      targetLocation ? `Target location/market: ${targetLocation}` : null,
    ].filter(Boolean).join('\n');
  
    const systemPrompt = `You are a career positioning coach and professional resume writer. Your job is to help job seekers frame and position their existing experience toward a specific goal — without inventing, fabricating, or exaggerating anything.
  
  ${frameworkBlock}
  
  ${aiResponseLanguageInstruction(language)}
  
  CORE PRINCIPLE: You are a FRAMING tool, not a fabrication tool. Every accomplishment, role, and skill in the output must be traceable to something in their original resume. Do not add jobs, degrees, certifications, or achievements that are not in the original.
  
  What you CAN do:
  - Reframe existing experience using stronger, more targeted language — using words and phrases already present or clearly implied by the stated role/context
  - Surface transferable skills the person understated or buried (e.g. moving a buried 'trained 3 new employees' line to a prominent leadership bullet)
  - Use keywords and phrasing that align with the target role and salary level, when those keywords describe something the person actually did
  - Adjust tone and seniority of language to match the target salary bracket
  - If a location is provided, use it only to inform job title phrasing (e.g. 'Austin, TX employers commonly list this role as...' is fine if true; do NOT make up market salary data, employer names, or regional demand claims you are not certain of)
  
  What you MUST NOT do:
  - Add metrics, percentages, or dollar figures that are not in the original (e.g. do not add '20% cost reduction' unless it was stated)
  - Invent job titles, responsibilities, or projects
  - Upgrade a stated role to a higher-level role (e.g. do not turn 'helped with payroll' into 'managed payroll operations')
  - Add certifications, degrees, or skills not present in the original
  - If a bullet is vague and you cannot strengthen it without fabricating, keep it as-is or flag it in the HOW WE POSITIONED YOU section with a suggestion for the member to add real detail
  
  Salary calibration (adjust LANGUAGE TONE only — do not invent content that is not there):
  - $40K-$60K: Use straightforward, factual language. Emphasize reliability and task completion.
  - $60K-$80K: Use confident language. Surface contributions and demonstrated competencies from the resume.
  - $80K-$100K: Use precise, professional language. Bring forward any ownership or depth already stated.
  - $100K-$130K: Use polished, results-oriented language — but ONLY for outcomes already present in the resume.
  - $130K+: Use executive-register language — but ONLY when the resume already contains senior-level signals. If it does not, do not fabricate them; instead note in HOW WE POSITIONED YOU that the gap exists and what the member could add.
  
  Format your response in two parts:
  1. REPOSITIONED RESUME: The full resume, repositioned toward their goal. Use clear section headers.
  2. HOW WE POSITIONED YOU: 3-5 bullet points explaining what was reframed and why — helping the member understand the strategy, not just copy the output.`;
  
    // Pre-LLM evidence gathering: structural gaps + O*NET top-importance skills + live market keywords.
    // Used as REFRAMING TARGETS only — never as license to fabricate. The anti-invention rules in the
    // system prompt still apply; this section tells the LLM what to look for in the existing resume.
    let evidenceBlock = '';
    try {
      const analysis = await analyzeResume(finalResume);
      const lines: string[] = ['', 'EVIDENCE-BACKED REFRAMING TARGETS (use to identify existing claims to strengthen — NEVER fabricate):'];
      const weakBullets = Object.entries(analysis.structural.breakdown)
        .filter(([, sub]) => sub.score < 70)
        .flatMap(([, sub]) => sub.notes.filter((n) => n.startsWith('  • L')));
      if (weakBullets.length > 0) {
        lines.push('Structural weakness — bullets to strengthen if true claims exist:');
        weakBullets.slice(0, 6).forEach((n) => lines.push(`  ${n.trim()}`));
      }
      analysis.onetCoverage.forEach((c) => {
        if (c.topGaps.length === 0) return;
        lines.push(`O*NET top-importance skills for ${c.title} not surfaced in current draft (surface only if the member actually has them):`);
        c.topGaps.slice(0, 4).forEach((g) => lines.push(`  - ${g.skill.name} (importance ${g.skill.importance})`));
      });
      analysis.marketCoverage.forEach((m, i) => {
        if (m.mustHaveMissing.length === 0) return;
        const occ = analysis.occupations[i];
        lines.push(`Live market must-have keywords missing from current draft for ${occ?.title ?? 'target'} (surface only if accurate):`);
        m.mustHaveMissing.slice(0, 6).forEach((k) => lines.push(`  - ${k.phrase} (${Math.round(k.frequency * 100)}% of postings)`));
      });
      if (lines.length > 2) evidenceBlock = lines.join('\n');
    } catch (err) {
      console.error('[resume-rewriter] analyzeResume signal-gathering failed:', err instanceof Error ? err.message : err);
    }

    const userPrompt = `CAREER GOAL
  Target role: ${finalJobTarget ?? 'not specified'}${goalContext ? `\n${goalContext}` : ''}
${evidenceBlock}

  ORIGINAL RESUME
  ---
  ${finalResume}
  ---

  Reposition this resume toward the career goal above. Remember: only work with what is actually in the resume. Frame it powerfully toward the target — do not invent anything.`;
  
    const coachContextBlock = await loadCoachContextBlock(onBehalf.subjectUserId);

    try {
      const output = await chatCompletion(
        [
          { role: 'system', content: `${systemPrompt}${coachContextBlock}` },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 4000, temperature: 0.7 }
      );
  
      if (!output) {
        return NextResponse.json({ error: 'We could not generate a response. Please try again.' }, { status: 500 });
      }
  
      /* The client renders the output in a <pre> tag — strip markdown markers so members
         don't see literal `## REPOSITIONED RESUME` headings (audit #121). */
      const cleanedOutput = cleanLongFormPlainText(output);
  
      try {
        await ensureUserInDb(user);
        const contextLabel = [finalJobTarget, targetLocation, targetSalary].filter(Boolean).join(' | ');
        // Save to SUBJECT's history; tag actor metadata so the member's
        // dashboard can render the "Your session with {actor}" card.
        await saveAIToolResult(
          onBehalf.subjectUserId,
          'resume_rewriter',
          contextLabel,
          cleanedOutput,
          {
            actorUserId: onBehalf.actorUserId,
            actorName: onBehalf.actorName,
            sessionId: sessionId ?? null,
          }
        );
      } catch (saveErr) {
        console.error('Resume rewriter: failed to save result', saveErr);
      }
  
      return NextResponse.json({ output: cleanedOutput });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Resume rewriter error:', err);
      if (message.includes('rate') || message.includes('429')) {
        return NextResponse.json({ error: 'Our AI tools are busy right now. Please try again in a minute.' }, { status: 429 });
      }
      if (message.includes('401') || message.includes('invalid') || message.includes('api_key')) {
        return NextResponse.json({ error: 'This feature is temporarily unavailable. Please try again soon.' }, { status: 503 });
      }
      return NextResponse.json(
        { error: 'We could not rewrite your resume just now. Please try again in a moment.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('/ai/resume-rewriter:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
