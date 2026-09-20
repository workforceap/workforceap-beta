import { redirect } from 'next/navigation';

/**
 * `/partner/signup` is not a portal route: the public partner sign-up lives at
 * `/partner-signup`. A signed-in partner who follows an old link used to land
 * on the portal shell's 404 (partner audit 2026-09-20); send them to the
 * public page instead.
 */
export const dynamic = 'force-static';

export default function PartnerSignupAliasPage(): never {
  redirect('/partner-signup');
}
