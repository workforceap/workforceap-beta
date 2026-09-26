import { getMemberState } from '@/lib/member/getMemberState';
import { prisma } from '@/lib/db/prisma';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';
import type { ResumeFramework } from '@/lib/resume/inferResumeFramework';

/**
 * Prefill data for AI tools — reads from member state, never invents.
 * 
 * Resume Rewriter source of truth: the member's original uploaded file only.
 * Other AI tools may use enhanced or analysis text for context, but a rewrite
 * must not treat generated text as the member's original evidence.
 * 
 * Career recommendation source of truth:
 *  - Only from "Find Your Path" quiz (careerRecommendationJson on User)
 *  - Training preassessment does NOT produce this
 *  Fallback chain: careerRec.topOccupations[0].title → programInterest → enrolledProgram title
 */

export type ElevatorPitchPrefill = {
  name: string;
  targetRole: string;
  strengths: string;
  certifications: string;
  industry: string;
};

export type ResumeRewriterPrefill =
  | { ok: true; resume: string; jobTarget: string | null; framework: ResumeFramework | 'auto' }
  | { ok: false; error: string };

export type InterviewPracticePrefill = {
  role: string;
  experienceLevel: 'entry' | 'mid' | 'senior';
  resumeContext: string;
};

// ─── Elevator Pitch ──────────────────────────────────────────────────────────

export async function prefillElevatorPitch(userId: string): Promise<ElevatorPitchPrefill> {
  const state = await getMemberState(userId);

  const name = state.fullName ?? state.email.split('@')[0];
  const targetRole = state.inferredTargetRole ?? 'your target role';

  // Strengths: career rec top skills → training completed slugs → empty
  const strengths =
    state.careerRecommendation?.topOccupations?.[0]?.skills?.join(', ') ??
    state.trainingView?.completedSlugsAuthoritative?.join(', ') ??
    '';

  // Certifications: training completions
  const certifications = state.trainingView?.completedSlugsAuthoritative?.join(', ') ?? '';

  // Industry: career rec → generic
  const industry = state.careerRecommendation?.topOccupations?.[0]?.description?.split('.')[0] ?? '';

  return { name, targetRole, strengths, certifications, industry };
}

// ─── Resume Rewriter ───────────────────────────────────────────────────────────

export async function prefillResumeRewriter(userId: string): Promise<ResumeRewriterPrefill> {
  // A rewrite needs the member's source document, never an enhanced draft or AI analysis.
  const fromFile = await getMemberResumePlainText(userId, 12000, { originalOnly: true });
  if (fromFile && fromFile.trim().length > 40) {
    const state = await getMemberState(userId);
    return {
      ok: true,
      resume: fromFile.trim(),
      jobTarget: state.inferredTargetRole,
      framework: 'auto',
    };
  }

  // Honest failure when the original is absent or cannot be read.
  return {
    ok: false,
    error: 'No readable original resume found. Upload or paste your resume at /dashboard/resume.',
  };
}

// ─── Interview Practice ──────────────────────────────────────────────────────

export async function prefillInterviewPractice(userId: string): Promise<InterviewPracticePrefill> {
  const state = await getMemberState(userId);

  const role = state.inferredTargetRole ?? 'your target role';

  // Experience level from profile employment status
  const experienceLevel = inferExperienceLevel(state);

  // Resume context: Supabase file first, then AIToolResult
  const resumeContext = await getMemberResumePlainText(userId, 6000, { preferOriginal: false })
    ?? await prisma.aIToolResult.findFirst({
        where: { userId, toolType: 'resume_analysis' },
        orderBy: { createdAt: 'desc' },
        select: { output: true },
      }).then(r => r?.output ?? '');

  return { role, experienceLevel, resumeContext: resumeContext.slice(0, 6000) };
}

// ─── Cover Letter ────────────────────────────────────────────────────────────

export type CoverLetterPrefill = {
  resume: string;
  jobTarget: string | null;
  companyName: string | null;
};

export async function prefillCoverLetter(userId: string): Promise<CoverLetterPrefill> {
  const state = await getMemberState(userId);
  const resume = await getMemberResumePlainText(userId, 12000, { preferOriginal: true })
    ?? await prisma.aIToolResult.findFirst({
        where: { userId, toolType: 'resume_analysis' },
        orderBy: { createdAt: 'desc' },
        select: { output: true },
      }).then(r => r?.output ?? '');

  return {
    resume: resume.slice(0, 12000),
    jobTarget: state.inferredTargetRole,
    companyName: null,
  };
}

// ─── Gap Analyzer ────────────────────────────────────────────────────────────

export type GapAnalyzerPrefill = {
  resume: string;
  jobTarget: string | null;
};

export async function prefillGapAnalyzer(userId: string): Promise<GapAnalyzerPrefill> {
  const state = await getMemberState(userId);
  const resume = await getMemberResumePlainText(userId, 12000, { preferOriginal: true })
    ?? await prisma.aIToolResult.findFirst({
        where: { userId, toolType: 'resume_analysis' },
        orderBy: { createdAt: 'desc' },
        select: { output: true },
      }).then(r => r?.output ?? '');

  return {
    resume: resume.slice(0, 12000),
    jobTarget: state.inferredTargetRole,
  };
}

// ─── LinkedIn Headline ───────────────────────────────────────────────────────

export type LinkedInHeadlinePrefill = {
  name: string;
  targetRole: string;
  strengths: string;
};

export async function prefillLinkedInHeadline(userId: string): Promise<LinkedInHeadlinePrefill> {
  const state = await getMemberState(userId);
  return {
    name: state.fullName ?? state.email.split('@')[0],
    targetRole: state.inferredTargetRole ?? 'your target role',
    strengths:
      state.careerRecommendation?.topOccupations?.[0]?.skills?.join(', ') ??
      state.trainingView?.completedSlugsAuthoritative?.join(', ') ??
      '',
  };
}

// ─── LinkedIn About ──────────────────────────────────────────────────────────

export type LinkedInAboutPrefill = {
  name: string;
  targetRole: string;
  resume: string;
};

export async function prefillLinkedInAbout(userId: string): Promise<LinkedInAboutPrefill> {
  const state = await getMemberState(userId);
  const resume = await getMemberResumePlainText(userId, 6000, { preferOriginal: true })
    ?? await prisma.aIToolResult.findFirst({
        where: { userId, toolType: 'resume_analysis' },
        orderBy: { createdAt: 'desc' },
        select: { output: true },
      }).then(r => r?.output ?? '');

  return {
    name: state.fullName ?? state.email.split('@')[0],
    targetRole: state.inferredTargetRole ?? 'your target role',
    resume: resume.slice(0, 6000),
  };
}

// ─── Salary Negotiation ──────────────────────────────────────────────────────

export type SalaryNegotiationPrefill = {
  targetRole: string;
  targetSalary: string | null;
  experienceLevel: 'entry' | 'mid' | 'senior';
};

export async function prefillSalaryNegotiation(userId: string): Promise<SalaryNegotiationPrefill> {
  const state = await getMemberState(userId);
  return {
    targetRole: state.inferredTargetRole ?? 'your target role',
    targetSalary: null,
    experienceLevel: inferExperienceLevel(state),
  };
}

// ─── Job Match Scorer ───────────────────────────────────────────────────────

export type JobMatchScorerPrefill = {
  resume: string;
  jobTarget: string | null;
};

export async function prefillJobMatchScorer(userId: string): Promise<JobMatchScorerPrefill> {
  const state = await getMemberState(userId);
  const resume = await getMemberResumePlainText(userId, 12000, { preferOriginal: true })
    ?? await prisma.aIToolResult.findFirst({
        where: { userId, toolType: 'resume_analysis' },
        orderBy: { createdAt: 'desc' },
        select: { output: true },
      }).then(r => r?.output ?? '');

  return {
    resume: resume.slice(0, 12000),
    jobTarget: state.inferredTargetRole,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferExperienceLevel(state: Awaited<ReturnType<typeof getMemberState>>): 'entry' | 'mid' | 'senior' {
  const { employmentStatus, educationLevel } = state.profile ?? { employmentStatus: null, educationLevel: null };

  // Senior indicators
  if (employmentStatus?.includes('senior') || employmentStatus?.includes('manager') || employmentStatus?.includes('lead')) {
    return 'senior';
  }

  // Entry indicators
  if (
    employmentStatus?.includes('student') ||
    employmentStatus?.includes('intern') ||
    employmentStatus?.includes('first') ||
    educationLevel?.includes('high school') ||
    !state.hasResume
  ) {
    return 'entry';
  }

  // Default mid for anyone with a resume and some experience
  return 'mid';
}

// ─── Honest-error helper for routes ──────────────────────────────────────────

export function honestNoResumeError(): { error: string; status: number } {
  return {
    error: 'We need a resume to tailor this for you. Upload one at /dashboard/resume, then come back.',
    status: 400,
  };
}
