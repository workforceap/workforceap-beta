import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import MobileApplyFunnel from './MobileApplyFunnel';
import JobTailorPanel from '@/components/portal/JobTailorPanel';
import { formatJobSalaryRange } from '@/lib/jobs/formatSalary';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';
import { resolveSupabasePublicAssetUrl } from '@/lib/storage/publicAssetUrl';
import { getProgramBySlug } from '@/lib/content/programs';
import ReferralCopyButton from './ReferralCopyButton';
import { MemberJobDetail } from '@/components/portal/kit/pages/member/MemberJobDetail';

type Props = { params: Promise<{ id: string }> };

/** Minimal member info needed to personalize the referral intro template. */
async function getReferralInfo(userId: string): Promise<{ firstName: string | null; programTitle: string | null }> {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, enrolledProgram: true },
    });
    const firstName = dbUser?.fullName?.trim().split(/\s+/)[0] || null;
    const programTitle = dbUser?.enrolledProgram
      ? getProgramBySlug(dbUser.enrolledProgram)?.title ?? null
      : null;
    return { firstName, programTitle };
  } catch {
    return { firstName: null, programTitle: null };
  }
}

/** Deterministic, server-rendered warm-intro template — no LLM call needed. */
function buildReferralMessage(params: {
  firstName: string | null;
  jobTitle: string;
  employerName: string;
  programTitle: string | null;
}): string {
  const { firstName, jobTitle, employerName, programTitle } = params;
  const trainingLine = programTitle
    ? `I just completed ${programTitle} training and would love any insight you can share, or an introduction to the right person.`
    : `I'd love any insight you can share, or an introduction to the right person.`;
  const lines = [
    `Hi! I'm applying for the ${jobTitle} role at ${employerName} and thought of you since you work there.`,
    trainingLine,
    `Thanks so much!${firstName ? ` — ${firstName}` : ''}`,
  ];
  return lines.join('\n');
}

/** Screening-pack question shape is admin-authored JSON — degrade gracefully on unexpected fields. */
type ScreeningQuestion = { id?: string; prompt?: string; type?: string };

/** Find the active screening pack (if any) whose program matches one of the job's suggested programs. */
async function getMatchingScreeningPack(suggestedPrograms: string[]) {
  if (!suggestedPrograms || suggestedPrograms.length === 0) return null;
  try {
    return await prisma.employerScreeningPack.findFirst({
      where: { programSlug: { in: suggestedPrograms }, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  let job = null;
  try {
    job = await prisma.job.findFirst({
      where: {
        id,
        status: 'live',
        AND: [
          ACTIVE_EMPLOYER_JOB_WHERE,
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } },
            ],
          },
        ],
      },
      select: { title: true, description: true },
    });
  } catch {
    job = null;
  }
  if (!job) return buildPageMetadataAsync({ title: 'Job', description: '', path: `/dashboard/jobs/${id}` });
  return buildPageMetadataAsync({
    title: job.title,
    description: job.description?.slice(0, 160) ?? '',
    path: `/dashboard/jobs/${id}`,
  });
}

async function getJob(id: string) {
  try {
    return await prisma.job.findFirst({
      where: {
        id,
        status: 'live',
        AND: [
          ACTIVE_EMPLOYER_JOB_WHERE,
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } },
            ],
          },
        ],
      },
      include: { employer: { select: { companyName: true, logoUrl: true } } },
    });
  } catch {
    return null;
  }
}

export default async function JobDetailPage({ params }: Props) {
  const user = await getUser();
  const { id } = await params;

  const job = await getJob(id);
  if (!job) notFound();

  const [referralInfo, screeningPack] = await Promise.all([
    user ? getReferralInfo(user.id) : Promise.resolve(null),
    getMatchingScreeningPack(job.suggestedPrograms),
  ]);

  const referralMessage = user
    ? buildReferralMessage({
        firstName: referralInfo?.firstName ?? null,
        jobTitle: job.title,
        employerName: job.employer.companyName,
        programTitle: referralInfo?.programTitle ?? null,
      })
    : null;

  const screeningQuestions = Array.isArray(screeningPack?.questionsJson)
    ? (screeningPack.questionsJson as ScreeningQuestion[])
    : null;

  const employerLogoUrl = resolveSupabasePublicAssetUrl('employer-logos', job.employer.logoUrl);
  const salaryLine = formatJobSalaryRange(job.salaryMin, job.salaryMax);

  const LOCATION_LABELS: Record<string, string> = {
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On-site',
  };
  const JOB_TYPE_LABELS: Record<string, string> = {
    fulltime: 'Full-time',
    parttime: 'Part-time',
    contract: 'Contract',
  };

  return (
    <MemberJobDetail
      title={job.title}
      company={job.employer.companyName}
      location={job.location ?? LOCATION_LABELS[job.locationType] ?? job.locationType}
      jobType={JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
      salary={salaryLine}
      description={job.description}
      requirements={job.requirements ?? []}
      backHref="/dashboard/jobs"
      logoUrl={employerLogoUrl}
      screening={
        screeningQuestions && screeningQuestions.length > 0 && screeningPack
          ? {
              packTitle: screeningPack.packTitle,
              employerLabel: screeningPack.employerLabel,
              questions: screeningQuestions,
            }
          : null
      }
      referral={
        referralMessage
          ? {
              company: job.employer.companyName,
              message: referralMessage,
              copySlot: <ReferralCopyButton text={referralMessage} />,
            }
          : null
      }
      applySlot={
        <>
          {user ? <JobTailorPanel jobId={job.id} /> : null}
          <MobileApplyFunnel
            jobId={job.id}
            authenticated={!!user}
            jobTitle={job.title}
            employerName={job.employer.companyName}
            salaryLine={salaryLine}
            location={job.location ?? LOCATION_LABELS[job.locationType] ?? job.locationType}
            jobType={JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
            description={job.description}
            requirements={job.requirements}
          />
        </>
      }
    />
  );
}
