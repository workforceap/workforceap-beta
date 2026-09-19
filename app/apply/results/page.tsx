import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import ApplyMobileStepNav from '@/components/apply/ApplyMobileStepNav';
import ApplyMobileTrustBar from '@/components/apply/ApplyMobileTrustBar';
import Footer from '@/components/Footer';
import ApplyPageSkeleton from '../ApplyPageSkeleton';
import ApplyResultsClient from './ApplyResultsClient';
import { getTranslations } from 'next-intl/server';
import { APPLY_REFERRAL_COOKIE } from '@/lib/partner/sponsoredEnrollment';
import { getProgramBySlug } from '@/lib/content/programs';
import { resolveSchoolApply } from '@/lib/apply/resolveSchoolApply';
import '../apply-funnel-depth.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('apply');
  return buildPageMetadataAsync({
    title: t('resultsMetaTitle'),
    description: t('resultsMetaDescription'),
    path: '/apply/results',
  });
}

export default async function ApplyResultsPage({ searchParams }: {
  searchParams?: Promise<{ program?: string | string[]; ref?: string | string[] }>;
}) {
  const t = await getTranslations('apply');
  const cookieStore = await cookies();
  const params = await searchParams;
  const explicitRef = typeof params?.ref === 'string' ? params.ref : undefined;
  const schoolApply = await resolveSchoolApply(explicitRef ?? cookieStore.get(APPLY_REFERRAL_COOKIE)?.value ?? null);
  const isSchool = Boolean(schoolApply);
  const rawProgram = params?.program;
  const program = typeof rawProgram === 'string' ? getProgramBySlug(rawProgram) : null;
  const recoveryContext = {
    referralRef: schoolApply?.referralCode,
    programSlug: program && (!schoolApply?.programSlugs.length || schoolApply.programSlugs.includes(program.slug))
      ? program.slug : undefined,
  };
  return (
    <div className="inner-page apply-funnel-step-page mdx afd-page">
      <Suspense fallback={<ApplyPageSkeleton />}>
        <ApplyResultsClient
          recoveryContext={recoveryContext}
          schoolName={schoolApply?.partnerName ?? null}
          schoolApply={isSchool}
          schoolProgramSlugs={schoolApply?.programSlugs ?? []}
          readyHeader={(
      <section className="page-hero apply-funnel-step-page__hero afd-hero-wrap">
        <div className="page-hero-content mdx-stage">
          <span className="mdx-pill">{isSchool ? t('schoolHeroLabel') : t('heroLabel')}</span>
          <h1><span className="mdx-grad-accent">{t('resultsHeroTitle')}</span></h1>
          <p>{t('resultsHeroBody')}</p>
        </div>
      </section>
          )}
          readyIntro={<><ApplyMobileTrustBar /><ApplyMobileStepNav activeStep={1} showTimeHint school={isSchool} />
            <p className="apply-funnel-form-kicker afd-kicker" role="note">{t(isSchool ? 'schoolResultsKicker' : 'resultsKicker')}</p></>}
        />
      </Suspense>

      <Footer />
    </div>
  );
}
