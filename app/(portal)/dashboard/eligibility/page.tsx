import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import EligibilityForm, { type EligibilityInitial } from './EligibilityForm';
import { PageOpener } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Eligibility Info',
    description: 'Complete or update your eligibility information.',
    path: '/dashboard/eligibility',
  });
}

const AGE_GROUP_VALUES = ['18_24', '25_50', '50_plus'] as const;
type AgeGroupValue = (typeof AGE_GROUP_VALUES)[number] | '';

export default async function EligibilityPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/eligibility');

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      wioaQualificationJson: true,
      profile: { select: { city: true, state: true, zip: true, barrierTypes: true } },
      applyEligibilityScreenings: {
        take: 1,
        select: {
          q1: true,
          q2: true,
          q3: true,
          receivingUnemployment: true,
          exhaustedUnemployment: true,
          layoffCompany: true,
          snapWic: true,
          publicAssistancePrograms: true,
          publicAssistanceHelpRequested: true,
          hearAbout: true,
          hearAboutOther: true,
          partnerAmbassadorReferral: true,
        },
      },
    },
  });

  const snapshot = (dbUser?.wioaQualificationJson ?? null) as Record<string, unknown> | null;
  const meta =
    snapshot && typeof snapshot.eligibilityForm === 'object' && snapshot.eligibilityForm !== null
      ? (snapshot.eligibilityForm as {
          ageGroup?: string | null;
          county?: string | null;
          q1?: string | null;
          q2?: string | null;
          q3?: string | null;
          receivingUnemployment?: string | null;
          exhaustedUnemployment?: string | null;
          layoffCompany?: string | null;
          snapWic?: string | null;
          publicAssistancePrograms?: string[] | null;
          publicAssistanceHelpRequested?: string | null;
          hearAbout?: string | null;
          hearAboutOther?: string | null;
          partnerAmbassadorReferral?: string | null;
        })
      : null;
  const screening = dbUser?.applyEligibilityScreenings[0] ?? null;

  const rawAge = meta?.ageGroup ?? '';
  const ageGroup: AgeGroupValue = (AGE_GROUP_VALUES as readonly string[]).includes(rawAge)
    ? (rawAge as AgeGroupValue)
    : '';

  const asYesNo = (v: string | null | undefined): 'yes' | 'no' | null =>
    v === 'yes' || v === 'no' ? v : null;

  const initial: EligibilityInitial = {
    ageGroup,
    city: dbUser?.profile?.city ?? '',
    state: dbUser?.profile?.state ?? '',
    zip: dbUser?.profile?.zip ?? '',
    county: meta?.county ?? '',
    primaryBarriers: dbUser?.profile?.barrierTypes ?? [],
    q1: asYesNo(meta?.q1 ?? screening?.q1),
    q2: asYesNo(meta?.q2 ?? screening?.q2),
    q3: asYesNo(meta?.q3 ?? screening?.q3),
    receivingUnemployment: asYesNo(meta?.receivingUnemployment ?? screening?.receivingUnemployment),
    exhaustedUnemployment: asYesNo(meta?.exhaustedUnemployment ?? screening?.exhaustedUnemployment),
    layoffCompany: meta?.layoffCompany ?? screening?.layoffCompany ?? '',
    snapWic: asYesNo(meta?.snapWic ?? screening?.snapWic),
    publicAssistancePrograms: meta?.publicAssistancePrograms ?? screening?.publicAssistancePrograms ?? [],
    publicAssistanceHelpRequested: asYesNo(
      meta?.publicAssistanceHelpRequested ?? screening?.publicAssistanceHelpRequested,
    ),
    hearAbout: meta?.hearAbout ?? screening?.hearAbout ?? '',
    hearAboutOther: meta?.hearAboutOther ?? screening?.hearAboutOther ?? '',
    partnerAmbassadorReferral:
      meta?.partnerAmbassadorReferral ?? screening?.partnerAmbassadorReferral ?? '',
  };

  return (
    <div className="portal-profile-page" style={{ paddingBottom: '2rem', maxWidth: '720px' }}>
      <PageOpener
        className="wa-mb-5"
        kicker="My account"
        title="Complete / update your eligibility info"
        lede="Keep your WorkforceAP file up to date so we can confirm program fit and supportive services."
      />
      <div className="portal-profile-section-card">
        <div className="portal-profile-section-card__header">
          <h2 className="portal-profile-section-card__title">Your eligibility details</h2>
        </div>
        <div className="portal-profile-section-card__body">
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--color-on-surface-variant)',
              lineHeight: 1.6,
              marginBottom: '1.5rem',
            }}
          >
            Keep your WorkforceAP file up to date. This information helps us confirm program fit and
            connect you with the right supportive services. It is pre-filled with what we already
            have — review it, make any changes, and save.
          </p>
          <EligibilityForm initial={initial} />
        </div>
      </div>
    </div>
  );
}
