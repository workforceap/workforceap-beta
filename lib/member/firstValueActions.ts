import { getProgramBySlug } from '@/lib/content/programs';
import type { MemberApplicationStatusView } from '@/lib/member/memberApplicationStatus';
import { resolveRecommendedProgramSlugs } from '@/lib/member/recommendPrograms';
import type { CareerMatchResult } from '@/lib/onet/types';

export type FirstValueAction = {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  weight: number;
};

export type FirstValueActionsContext = {
  state: 'A' | 'B' | 'C' | 'D';
  noApplicationOnFile: boolean;
  application: MemberApplicationStatusView | null;
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  hasResume: boolean;
  profileCompletenessPct: number;
  careerRecommendation: CareerMatchResult | null;
};

/**
 * Build exactly three prioritized onboarding actions from application status,
 * profile/document completeness, and recommended programs.
 */
export function buildFirstValueActions(ctx: FirstValueActionsContext): FirstValueAction[] {
  const candidates: FirstValueAction[] = [];

  if (ctx.noApplicationOnFile) {
    candidates.push({
      id: 'fv_submit_application',
      title: 'Submit your program application',
      body: 'Takes about 10 minutes. We match you to funded training and connect you with a counselor.',
      href: '/apply',
      cta: 'Start application',
      weight: 100,
    });
  } else if (ctx.application) {
    candidates.push({
      id: 'fv_application_status',
      title: `Application: ${ctx.application.label}`,
      body: ctx.application.nextStep,
      href: ctx.application.nextStepHref,
      cta: 'View application',
      weight: 98,
    });
  }

  if (!ctx.enrolledProgram && !ctx.noApplicationOnFile) {
    candidates.push({
      id: 'fv_choose_program',
      title: 'Choose your training program',
      body: 'Pick the funded track that fits your goals — enrollment is tied to one program.',
      href: '/dashboard/program',
      cta: 'Choose program',
      weight: 96,
    });
  }

  if (ctx.enrolledProgram && !ctx.assessmentCompleted) {
    candidates.push({
      id: 'fv_preassessment',
      title: 'Complete your Training Preassessment',
      body: 'Unlock your personalized training plan and role matches in a few minutes.',
      href: '/dashboard/assessment',
      cta: 'Start preassessment',
      weight: 94,
    });
  }

  if (!ctx.hasResume) {
    candidates.push({
      id: 'fv_upload_resume',
      title: 'Add your resume',
      body: 'Upload a resume so counselors and AI tools can tailor support to your background.',
      href: '/dashboard/ai-tools/resume-studio?view=rewrite',
      cta: 'Upload resume',
      weight: 88,
    });
  }

  if (ctx.profileCompletenessPct < 55) {
    candidates.push({
      id: 'fv_complete_profile',
      title: 'Complete your profile',
      body: `Your profile is ${ctx.profileCompletenessPct}% complete — fill in contact and background details for faster matching.`,
      href: '/dashboard/profile',
      cta: 'Complete profile',
      weight: 82,
    });
  }

  const programSlugs = resolveRecommendedProgramSlugs(ctx.careerRecommendation, 3);
  for (const slug of programSlugs) {
    const program = getProgramBySlug(slug);
    if (!program) continue;
    const match = ctx.careerRecommendation?.recommendedPrograms?.find((r) => r.programSlug === slug);
    candidates.push({
      id: `fv_explore_program_${slug}`,
      title: `Explore ${program.title}`,
      body:
        match?.whyRecommended ??
        'See courses, salary outlook, and how this program fits your career path.',
      href: `/programs/${slug}`,
      cta: 'View program',
      weight: 70 - (match?.priority ?? 0),
    });
  }

  if (!candidates.some((c) => c.id === 'fv_career_quiz')) {
    candidates.push({
      id: 'fv_career_quiz',
      title: 'Find your best-fit program',
      body: 'Answer a short quiz to get personalized program recommendations.',
      href: '/find-your-path',
      cta: 'Take the quiz',
      weight: 55,
    });
  }

  candidates.push({
    id: 'fv_message_counselor',
    title: 'Ask your counselor',
    body: 'Not sure what to do first? Send a quick message — your team can point you to the right step.',
    href: '/dashboard/messages',
    cta: 'Message counselor',
    weight: 10,
  });

  candidates.sort((a, b) => b.weight - a.weight);

  const seen = new Set<string>();
  const deduped: FirstValueAction[] = [];
  for (const action of candidates) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    deduped.push(action);
    if (deduped.length >= 3) break;
  }

  return deduped;
}
