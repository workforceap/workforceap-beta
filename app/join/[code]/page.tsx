import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import PartnerLandingPage from '@/components/marketing/PartnerLandingPage';
import { resolvePartnerLanding } from '@/lib/partner/partnerLanding';
import { partnerLandingPath } from '@/lib/partner/shareLinks';
import { getRequestLocale } from '@/lib/i18n/server';
import { withLocalePrefix } from '@/lib/i18n/config';
import '@/css/enroll-school.css';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ code: string }> };

/**
 * Partner-branded public landing page: `/join/<referral code or slug>`
 * (`/{locale}/join/…` via middleware, like `/apply`). `/r/<code>` is the
 * member-to-member referral door and `/partners/*` belongs to the Astro site,
 * so partner links live here. Unknown, inactive or unapproved partners 404.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const model = await resolvePartnerLanding(code, { headers: await headers() });
  if (!model) return { robots: { index: false, follow: false } };
  const t = await getTranslations('partnerLanding');
  return buildPageMetadataAsync({
    title: t('metaTitle', { partner: model.name }),
    description: t('metaDescription', { partner: model.name }),
    path: partnerLandingPath(model.ref),
    // Shared by partners, not a search destination: OG/Twitter tags still apply.
    robots: { index: false, follow: true },
  });
}

export default async function PartnerJoinPage({ params }: PageProps) {
  const { code } = await params;
  const model = await resolvePartnerLanding(code, { headers: await headers() });
  if (!model) notFound();
  const locale = await getRequestLocale();
  const applyHref = `${withLocalePrefix('/apply', locale)}?ref=${encodeURIComponent(model.ref)}`;
  return <PartnerLandingPage model={model} applyHref={applyHref} />;
}
