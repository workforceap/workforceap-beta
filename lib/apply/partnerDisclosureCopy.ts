import { getTranslations } from 'next-intl/server';
import type { PartnerDisclosureCopy } from '@/components/apply/PartnerReferralDisclosure';

/**
 * The disclosure templates from `apply.partnerDisclosure*` (messages/*.json),
 * read raw on the server so client components on any route group (apply,
 * auth, public landing) can fill in the server-resolved partner name.
 */
export async function getPartnerDisclosureCopy(): Promise<PartnerDisclosureCopy> {
  const t = await getTranslations('apply');
  return {
    label: t('partnerDisclosureLabel'),
    restricted: String(t.raw('partnerDisclosureRestricted')),
    full: String(t.raw('partnerDisclosureFull')),
  };
}
