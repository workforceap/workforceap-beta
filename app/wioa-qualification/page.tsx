import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import WioaQualificationLoading from '@/components/portal/WioaQualificationLoading';
import Footer from '@/components/Footer';
import { buildPageMetadataAsync } from '@/app/seo';

const WioaQualificationClient = dynamic(() => import('@/components/portal/WioaQualificationClient'), {
  loading: () => <WioaQualificationLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wioa');
  return buildPageMetadataAsync({
    title: t('title'),
    description: t('publicIntro'),
    path: '/wioa-qualification',
  });
}

export default function PublicWioaQualificationPage() {
  return (
    <>
      <WioaQualificationClient initialSnapshot={null} mode="public" />
      <Footer />
    </>
  );
}
