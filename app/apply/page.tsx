import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import ApplyMobileStepNav from '@/components/apply/ApplyMobileStepNav';
import ApplyMobileTrustBar from '@/components/apply/ApplyMobileTrustBar';
import PaidApplyProofBlock from '@/components/apply/PaidApplyProofBlock';
import TrustStrip from '@/components/marketing/TrustStrip';
import OrganicApplyPage from './OrganicApplyPage';
import PaidApplyVariant from './PaidApplyVariant';
import { buildApplyPageMetadata } from '@/lib/apply/applyProgramPage';
import {
  resolvePaidApplyUtmSource,
  UTM_SOURCE_COOKIE,
} from '@/lib/apply/paidApplyUtm';
import { partnerRefForApplyLanding } from '@/lib/apply/applyReferralCapture';
import { resolveSchoolApply } from '@/lib/apply/resolveSchoolApply';
import { resolvePartnerReferralDisclosure } from '@/lib/apply/partnerReferralDisclosure';
import { getPartnerDisclosureCopy } from '@/lib/apply/partnerDisclosureCopy';
import PartnerReferralDisclosure from '@/components/apply/PartnerReferralDisclosure';

type PageProps = { searchParams?: Promise<{ program?: string; utm_source?: string; ref?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = searchParams ? await searchParams : {};
  return await buildApplyPageMetadata(sp.program);
}

export default async function ApplyPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const cookieUtm = cookieStore.get(UTM_SOURCE_COOKIE)?.value ?? null;
  // Explicit ?ref= only — sticky enroll cookies must not force school mode here.
  const landingRef = partnerRefForApplyLanding(sp.ref);
  const [schoolApply, disclosure] = await Promise.all([
    resolveSchoolApply(landingRef),
    // Same org + active-partner lookup as signup; the name never comes from the URL.
    resolvePartnerReferralDisclosure(landingRef, { headers: await headers(), programSlug: sp.program }),
  ]);
  // Bare /apply clears attribution, so only the explicit ?ref= is disclosed here.
  const disclosureCopy = disclosure ? await getPartnerDisclosureCopy() : null;
  // The organic page renders the callout inside the crimson hero (white hero
  // text); the paid variant renders it in the light form section.
  const renderPartnerDisclosure = (tone: 'surface' | 'onHero') =>
    disclosure && disclosureCopy ? (
      <PartnerReferralDisclosure
        initial={disclosure}
        copy={disclosureCopy}
        reconcileWithPersistedRef={false}
        tone={tone}
      />
    ) : null;

  const paidUtmSource = resolvePaidApplyUtmSource(sp, cookieUtm);

  if (paidUtmSource && !schoolApply) {
    return (
      <PaidApplyVariant
        utmSource={paidUtmSource}
        program={sp.program}
        stepNav={<ApplyMobileStepNav activeStep={0} showTimeHint />}
        mobileTrustBar={<ApplyMobileTrustBar />}
        proofBlock={<PaidApplyProofBlock />}
        trustStrip={<TrustStrip variant="apply" />}
        partnerDisclosure={renderPartnerDisclosure('surface')}
      />
    );
  }

  return <OrganicApplyPage program={sp.program} schoolApply={schoolApply} partnerDisclosure={renderPartnerDisclosure('onHero')} />;
}
