import { EARLY_TAP_SCRIPT } from '@/lib/portal/earlyShellTap';

/**
 * Records phone-menu taps that land before hydration so the shell can replay
 * them once it mounts (lib/portal/earlyShellTap.ts). A server component: the
 * per-request CSP `nonce` comes from the root layout (`x-nonce`, WAP-36).
 *
 * `suppressHydrationWarning`: browsers blank the `nonce` content attribute
 * under a header-delivered CSP, which React dev would otherwise report as a
 * hydration mismatch (same reasoning as ThemeInitScript).
 */
export default function EarlyShellTapScript({ nonce }: { nonce?: string } = {}) {
  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: EARLY_TAP_SCRIPT }}
    />
  );
}
