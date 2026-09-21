/**
 * Dynamic variables for ElevenLabs ConvAI agents (portal voice).
 * Agent prompts in ElevenLabs should reference these keys for WorkforceAP nonprofit / workforce context.
 *
 * Keys by surface:
 * - Member (readiness, interview, resume): member_name, program_*, organization_*, interview_eligible, + resume_* for resume coach
 * - WIOA prequal: member fields above plus the static wioa_program_name / wioa_pronunciation.
 *   WAP-173: the member's screening answers (barrier, dislocated worker, income,
 *   public assistance, signal, age, county) are never sent to the voice vendor —
 *   the privacy policy's ElevenLabs row does not disclose them. The public
 *   (logged-out) variant sends a first name only: no email, phone or county.
 * - Counselor: staff_name, partner_name, partner_id
 * - Employer: staff_name, employer_company_name, employer_tier, employer_id
 * - Partner: staff_name, partner_org_name, partner_slug, partner_id
 * - All: site_name, support_context (nonprofit workforce framing)
 */

import { prisma } from '@/lib/db/prisma';
import { getCoachMemoryDynamicVariables } from '@/lib/coach/memory';
import { getProgramBySlug } from '@/lib/content/programs';
import { getCounselorForUser, getEmployerForUser, getPartnerForUser } from '@/lib/auth/roles';

/** Merged into every voice session for consistent nonprofit / site framing in ElevenLabs prompts. */
const VOICE_DEFAULTS: Record<string, string> = {
  site_name: 'WorkforceAP',
  support_context:
    'Nonprofit workforce development: practical, respectful coaching for people building careers. No medical, legal, or financial advice.',
};

function withVoiceDefaults(vars: Record<string, string>): Record<string, string> {
  return { ...VOICE_DEFAULTS, ...vars };
}

/** Core member context: program, org, eligibility — use for readiness, interview, resume coach (plus resume fields). */
export async function fetchMemberPortalDynamicVariables(userId: string): Promise<Record<string, string>> {
  try {
    const [dbUser, coachMemory] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { organization: { select: { name: true, slug: true } } },
      }),
      getCoachMemoryDynamicVariables(userId),
    ]);
    if (!dbUser) {
      return {};
    }

    const program = dbUser.enrolledProgram ? getProgramBySlug(dbUser.enrolledProgram) : null;

    return withVoiceDefaults({
      member_name: dbUser.fullName ?? '',
      program_title: program?.title ?? '',
      program_skills: program?.skills?.join(', ') ?? '',
      enrolled_program_slug: dbUser.enrolledProgram ?? '',
      organization_name: dbUser.organization?.name ?? '',
      organization_slug: dbUser.organization?.slug ?? '',
      interview_eligible: dbUser.interviewEligible ? 'true' : 'false',
      ...coachMemory,
    });
  } catch (err) {
    console.error('[elevenlabsPortalContext] member context error:', err);
    return {};
  }
}

/**
 * Public (logged-out) WIOA prequal voice context. The public form collects a
 * name, email, phone and county for the written screening record; only a
 * first name is handed to the voice vendor, for the greeting. Email, phone
 * and county are never sent — the privacy policy's ElevenLabs row does not
 * disclose them, and the agent has no use for them.
 */
export function buildPublicWioaPortalDynamicVariables(input?: {
  fullName?: string;
}): Record<string, string> {
  return withVoiceDefaults({
    member_name: firstNameOnly(input?.fullName),
    wioa_public_screening: 'true',
    wioa_program_name: 'Workforce Innovation and Opportunity Act (WIOA)',
    wioa_pronunciation: 'W. I. O. A.',
  });
}

function firstNameOnly(fullName: string | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? '';
}

/**
 * WIOA prequal voice context. Program framing only — the member's screening
 * answers are read from the database by staff, never handed to the vendor
 * (WAP-173). The prequal agent runs through the governed gateway where member
 * context arrives via tools, so no prompt variable depends on the answers.
 */
export async function fetchWioaPortalDynamicVariables(userId: string): Promise<Record<string, string>> {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: { select: { name: true, slug: true } } },
    });
    if (!dbUser) return {};

    const program = dbUser.enrolledProgram ? getProgramBySlug(dbUser.enrolledProgram) : null;

    return withVoiceDefaults({
      member_name: dbUser.fullName ?? '',
      program_title: program?.title ?? '',
      program_skills: program?.skills?.join(', ') ?? '',
      enrolled_program_slug: dbUser.enrolledProgram ?? '',
      organization_name: dbUser.organization?.name ?? '',
      organization_slug: dbUser.organization?.slug ?? '',
      interview_eligible: dbUser.interviewEligible ? 'true' : 'false',
      wioa_program_name: 'Workforce Innovation and Opportunity Act (WIOA)',
      wioa_pronunciation: 'W. I. O. A.',
    });
  } catch (err) {
    console.error('[elevenlabsPortalContext] wioa context error:', err);
    return {};
  }
}

/** Career counselor voice — staff identity + partner affiliation. */
export async function fetchCounselorPortalDynamicVariables(userId: string): Promise<Record<string, string>> {
  try {
    const [user, counselorCtx] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      }),
      getCounselorForUser(userId),
    ]);

    return withVoiceDefaults({
      staff_name: user?.fullName ?? '',
      partner_name: counselorCtx?.partnerName ?? 'WorkforceAP',
      partner_id: counselorCtx?.partnerId ?? '',
    });
  } catch (err) {
    console.error('[elevenlabsPortalContext] counselor context error:', err);
    return {};
  }
}

/** Employer portal voice — company + logged-in employer user. */
export async function fetchEmployerPortalDynamicVariables(userId: string): Promise<Record<string, string>> {
  try {
    const [user, employerCtx] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      }),
      getEmployerForUser(userId),
    ]);

    if (!employerCtx) {
      return withVoiceDefaults({ staff_name: user?.fullName ?? '' });
    }

    return withVoiceDefaults({
      staff_name: user?.fullName ?? '',
      employer_company_name: employerCtx.employer.companyName,
      employer_tier: employerCtx.employer.tier,
      employer_id: employerCtx.employerId,
    });
  } catch (err) {
    console.error('[elevenlabsPortalContext] employer context error:', err);
    return {};
  }
}

/** Partner portal voice — partner org + staff user. */
export async function fetchPartnerPortalDynamicVariables(userId: string): Promise<Record<string, string>> {
  try {
    const [user, partnerCtx] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      }),
      getPartnerForUser(userId),
    ]);

    if (!partnerCtx) {
      return withVoiceDefaults({ staff_name: user?.fullName ?? '' });
    }

    return withVoiceDefaults({
      staff_name: user?.fullName ?? '',
      partner_org_name: partnerCtx.partner.name,
      partner_slug: partnerCtx.partner.slug,
      partner_id: partnerCtx.partnerId,
    });
  } catch (err) {
    console.error('[elevenlabsPortalContext] partner context error:', err);
    return {};
  }
}
