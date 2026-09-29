/**
 * Partner share tools: the landing-page link, per-channel links with UTM
 * tags, and a copyable "Apply" button snippet. Pure (no database, no DOM) so
 * the portal, the landing page and tests share one builder.
 *
 * Attribution: the partner `ref` is the referral code (falling back to the
 * slug, as `buildPartnerReferralLink` does). The landing page at
 * `/join/<code>` persists it with the existing capture mechanics, and its
 * Apply CTA carries `?ref=` into `/apply`. UTM values are captured by
 * `UtmCapture` and stored on the `apply_signup_completed` event.
 */
import { isPaidUtmSource } from '@/lib/apply/paidApplyUtm';
import { normalizePartnerRef } from '@/lib/partner/sponsoredEnrollment';

/** Public partner landing route. `/r/<code>` is the member referral door. */
const PARTNER_LANDING_PREFIX = '/join';

const PARTNER_SHARE_CAMPAIGN = 'partner_referral';

export const PARTNER_SHARE_CHANNELS = [
  { id: 'website', label: 'Website', source: 'website', medium: 'referral' },
  { id: 'youtube', label: 'YouTube', source: 'youtube', medium: 'video' },
  { id: 'facebook', label: 'Facebook', source: 'facebook', medium: 'social' },
  { id: 'email', label: 'Email', source: 'email', medium: 'email' },
] as const;

export type PartnerShareChannelId = (typeof PARTNER_SHARE_CHANNELS)[number]['id'];

// None of these may be a paid-ads source: `/apply` would switch to the paid
// variant. Checked at module load so a future edit fails loudly in tests.
for (const channel of PARTNER_SHARE_CHANNELS) {
  if (isPaidUtmSource(channel.source)) {
    throw new Error(`Partner share channel ${channel.id} uses a paid utm_source`);
  }
}

export function partnerShareRef(partner: { referralCode?: string | null; slug: string }): string {
  return normalizePartnerRef(partner.referralCode?.trim() || partner.slug) ?? partner.slug.trim().toLowerCase();
}

export function partnerLandingPath(ref: string): string {
  return `${PARTNER_LANDING_PREFIX}/${encodeURIComponent(ref)}`;
}

function siteBase(baseUrl?: string): string {
  return (baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org').replace(/\/+$/, '');
}

function withUtm(url: URL, channel: (typeof PARTNER_SHARE_CHANNELS)[number]): string {
  url.searchParams.set('utm_source', channel.source);
  url.searchParams.set('utm_medium', channel.medium);
  url.searchParams.set('utm_campaign', PARTNER_SHARE_CAMPAIGN);
  return url.toString();
}

/** Escape text for an HTML attribute or text node. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A plain `<a>` with inline styles — no iframe, no script, no external CSS —
 * so it can be pasted into any website builder. Brand crimson matches
 * `--wa-accent` (css/wa-brand-tokens.css); a pasted snippet cannot read our
 * CSS variables, so the value is spelled out here on purpose.
 */
const APPLY_BUTTON_BG = '#ad2c4d';

export function partnerApplyButtonHtml(input: { href: string; partnerName: string }): string {
  const label = 'Apply to WorkforceAP';
  const title = `Apply to WorkforceAP — referred by ${input.partnerName}`;
  return (
    `<a href="${escapeHtml(input.href)}" target="_blank" rel="noopener" title="${escapeHtml(title)}" ` +
    `style="display:inline-block;padding:14px 28px;background:${APPLY_BUTTON_BG};color:#ffffff;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.2;` +
    `text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>`
  );
}

export type PartnerShareLinks = {
  ref: string;
  landingUrl: string;
  applyUrl: string;
  channels: { id: PartnerShareChannelId; label: string; source: string; medium: string; url: string }[];
  applyButtonHref: string;
  applyButtonHtml: string;
};

export function buildPartnerShareLinks(
  partner: { referralCode?: string | null; slug: string; name: string },
  baseUrl?: string,
): PartnerShareLinks {
  const ref = partnerShareRef(partner);
  const base = siteBase(baseUrl);
  const landingUrl = new URL(partnerLandingPath(ref), base).toString();
  const applyUrl = new URL('/apply', base);
  applyUrl.searchParams.set('ref', ref);
  const website = PARTNER_SHARE_CHANNELS[0];
  const applyButtonHref = withUtm(new URL(applyUrl.toString()), website);
  return {
    ref,
    landingUrl,
    applyUrl: applyUrl.toString(),
    channels: PARTNER_SHARE_CHANNELS.map((channel) => ({
      id: channel.id,
      label: channel.label,
      source: channel.source,
      medium: channel.medium,
      url: withUtm(new URL(landingUrl), channel),
    })),
    applyButtonHref,
    applyButtonHtml: partnerApplyButtonHtml({ href: applyButtonHref, partnerName: partner.name }),
  };
}

/**
 * Per-channel signup counts from `apply_signup_completed` metadata. Counts
 * only — the caller passes metadata blobs, never member identities.
 */
export function countSignupsByShareChannel(
  metadata: unknown[],
): Record<PartnerShareChannelId | 'other', number> {
  const counts = Object.fromEntries(
    [...PARTNER_SHARE_CHANNELS.map((c) => c.id), 'other'].map((id) => [id, 0]),
  ) as Record<PartnerShareChannelId | 'other', number>;
  for (const meta of metadata) {
    const source =
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>).utm_source
        : undefined;
    const channel = PARTNER_SHARE_CHANNELS.find(
      (c) => typeof source === 'string' && source.trim().toLowerCase() === c.source,
    );
    counts[channel ? channel.id : 'other'] += 1;
  }
  return counts;
}
