import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import WioaQualificationLoading from '@/components/portal/WioaQualificationLoading';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import LocalizedLink from '@/components/LocalizedLink';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { PageOpener } from '@/components/portal/kit';

const WioaQualificationClient = dynamic(() => import('@/components/portal/WioaQualificationClient'), {
  loading: () => <WioaQualificationLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wioa');
  return buildPageMetadataAsync({
    title: t('title'),
    description: t('memberIntro'),
    path: '/dashboard/learning/wioa-qualification',
  });
}

export default async function WioaQualificationPage() {
  const t = await getTranslations('wioa');
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/learning/wioa-qualification');

  let initial = null;
  try {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { wioaQualificationJson: true },
    });
    initial = parseWioaQualificationSnapshot(row?.wioaQualificationJson);
  } catch (error) {
    console.error('[member/wioa-qualification] failed to load qualification snapshot', error);
    const message = error instanceof Error ? error.message : String(error ?? '');
    const looksLikeSchemaDrift =
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError ||
      /column .*wioa_qualification_json.* does not exist/i.test(message) ||
      /wioa_qualification_json/i.test(message);

    if (looksLikeSchemaDrift) {
      return (
        <section className="portal-route-fallback" data-portal-error-state="portal-route-fallback">
          <PageOpener className="wa-mb-5" kicker={t('title')} title={t('unavailableTitle')} lede={t('unavailableBody')} />
          <LocalizedLink href="/dashboard/messages" className="wa-kit-cta">{t('messageCounselor')}</LocalizedLink>
        </section>
      );
    }
    throw error;
  }

  return <WioaQualificationClient initialSnapshot={initial} />;
}
