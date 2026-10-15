import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PartnerSchoolEnrollMissing from '@/components/marketing/PartnerSchoolEnrollMissing';
import PartnerSchoolEnrollPage from '@/components/marketing/PartnerSchoolEnrollPage';
import {
  listPublicEnrollmentPartners,
  resolveEnrollmentPartner,
} from '@/lib/enroll/resolveEnrollmentPartner';
import '@/css/enroll-school.css';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ school: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { school } = await params;
  const model = await resolveEnrollmentPartner(school);
  if (!model) {
    const t = await getTranslations('enroll');
    return { title: t('missingMetaTitle'), robots: { index: false, follow: false } };
  }
  return {
    title: `${model.name} Partnership — Career Certifications for Students | WorkforceAP`,
    description: model.costSentence,
    robots: { index: false, follow: false },
  };
}

export default async function PartnerEnrollmentPage({ params }: PageProps) {
  const { school } = await params;
  const model = await resolveEnrollmentPartner(school);
  if (!model) {
    const partners = await listPublicEnrollmentPartners();
    return <PartnerSchoolEnrollMissing school={school} partners={partners} />;
  }

  return <PartnerSchoolEnrollPage model={model} />;
}
