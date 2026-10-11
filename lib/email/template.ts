/**
 * Shared branded email layout for transactional emails.
 * Dark header, white body, footer. Use with Resend.
 *
 * Track E (Sprint E.1 PR 2) — accepts an optional `branding` bundle from
 * `lib/tenant/organizationBranding.ts`. Templates that pass branding get
 * org-aware logo, accent color, footer copy, and CTA href origin.
 * Templates that omit it keep the previous WorkforceAP defaults so we can
 * migrate templates one PR at a time.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import type { OrganizationBranding } from '@/lib/tenant/organizationBranding';

const DEFAULT_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const DEFAULT_LOGO_URL = `${DEFAULT_SITE_URL}/images/wap_logo.png`;
const DEFAULT_NAME = 'Workforce Advancement Project';
const DEFAULT_ACCENT = '#4a9b4f';

type SupabaseAuthAction = 'signup' | 'recovery';

/** Only server-minted Auth actions may use the configured provider's verify endpoint. */
function isAllowedSupabaseAuthAction(
  url: URL,
  action: SupabaseAuthAction,
  returnOrigins: ReadonlySet<string>,
): boolean {
  try {
    const provider = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (provider.protocol !== 'http:' && provider.protocol !== 'https:') return false;
    if (url.origin !== provider.origin || url.pathname !== '/auth/v1/verify' || url.username || url.password) return false;
    // Reject duplicates: different parsers must not disagree about the action
    // or destination of the same token-bearing link.
    for (const key of ['token', 'type', 'redirect_to']) {
      if (url.searchParams.getAll(key).length !== 1) return false;
    }
    if (!url.searchParams.get('token')?.trim() || url.searchParams.get('type') !== action) return false;
    const destination = new URL(url.searchParams.get('redirect_to')!);
    return (destination.protocol === 'http:' || destination.protocol === 'https:') &&
      !destination.username && !destination.password && returnOrigins.has(destination.origin);
  } catch {
    return false;
  }
}

/**
 * Restrict mail CTA links to a small allowlist of "our" origins to avoid
 * open redirects in href. The allowlist is:
 *   - The resolved branding origin (e.g. `https://aaul.workforceap.org`)
 *   - The canonical `DEFAULT_SITE_URL` (`NEXT_PUBLIC_SITE_URL` or
 *     `https://www.workforceap.org`)
 * Signup/recovery templates can additionally opt into the configured Supabase
 * verification endpoint with a matching action and an allowlisted return host.
 *
 * Codex P1 catch on PR #1052: when an org has a `customDomain`, the
 * invite/auth flows still build URLs on the canonical `NEXT_PUBLIC_SITE_URL`
 * (e.g. `https://www.workforceap.org/invite?token=...`). The previous
 * single-origin check rejected those as cross-origin and replaced the CTA
 * with the tenant root, dropping the invite token. Allowing both origins
 * preserves token-bearing CTAs without opening up arbitrary external
 * redirects.
 */
export function safeEmailCtaHref(url: string, baseOrigin?: string, supabaseAuthAction?: SupabaseAuthAction): string {
  const base = baseOrigin || DEFAULT_SITE_URL;
  try {
    const u = new URL(url, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return `${new URL(base).origin}/`;
    }

    const allowed = new Set<string>();
    try { allowed.add(new URL(base).origin); } catch {}
    try { allowed.add(new URL(DEFAULT_SITE_URL).origin); } catch {}

    if (allowed.has(u.origin)) return u.href;
    if (supabaseAuthAction && isAllowedSupabaseAuthAction(u, supabaseAuthAction, allowed)) return u.href;
    return `${new URL(base).origin}/`;
  } catch {
    try {
      return `${new URL(base).origin}/`;
    } catch {
      return `${new URL(DEFAULT_SITE_URL).origin}/`;
    }
  }
}

export function brandedEmailLayout(options: {
  title: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  /** Opt in only for server-generated signup/recovery links, never ordinary CTAs. */
  supabaseAuthAction?: SupabaseAuthAction;
  /**
   * Org branding bundle from `getOrganizationBranding(orgId)`. When omitted
   * the template renders WorkforceAP defaults — that's the legacy behavior
   * for the ~25 email templates not yet migrated in Sprint E.1 PR 2.
   */
  branding?: OrganizationBranding;
}) {
  const { bodyHtml } = options;
  const title = escapeHtml(options.title);
  const ctaText = options.ctaText ? escapeHtml(options.ctaText) : undefined;

  const siteUrl = options.branding?.domain || DEFAULT_SITE_URL;
  const logoUrl = options.branding?.logoUrl || DEFAULT_LOGO_URL;
  const orgName = options.branding?.name || DEFAULT_NAME;
  const accent = options.branding?.primaryColor || DEFAULT_ACCENT;
  const domainLabel = options.branding?.domainLabel || new URL(DEFAULT_SITE_URL).host;

  const ctaUrl = options.ctaUrl ? safeEmailCtaHref(options.ctaUrl, siteUrl, options.supabaseAuthAction) : undefined;
  const ctaBlock =
    ctaText && ctaUrl
      ? `
    <p style="margin: 1.5rem 0;">
      <a href="${escapeHtml(ctaUrl)}" style="display: inline-block; padding: 0.75rem 1.5rem; background: ${escapeHtml(accent)}; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ${ctaText}
      </a>
    </p>
  `
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f5f5f5; padding: 2rem 1rem;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="background: #1a1a1a; padding: 1.5rem 2rem; border-radius: 8px 8px 0 0; text-align: center;">
              <a href="${escapeHtml(siteUrl)}" style="display: inline-block;">
                <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(orgName)}" width="180" height="92" style="display: block; max-width: 180px; height: auto;" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="background: white; padding: 2rem; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 8px 8px;">
              <h1 style="margin: 0 0 1rem; font-size: 1.5rem; color: #1a1a1a;">${title}</h1>
              <div style="color: #333; line-height: 1.6; font-size: 1rem;">
                ${bodyHtml}
                ${ctaBlock}
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 2rem 0 1rem;" />
              <p style="margin: 0; font-size: 0.85rem; color: #888;">
                ${escapeHtml(orgName)} &middot; Career training and industry certifications
              </p>
              <p style="margin: 0.25rem 0 0; font-size: 0.8rem;">
                <a href="${escapeHtml(siteUrl)}" style="color: ${escapeHtml(accent)};">${escapeHtml(domainLabel)}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
