import { redirect } from 'next/navigation';

/**
 * Defense in depth for the legacy URL. next.config redirects before the
 * partner layout can enforce portal access; this page keeps the destination
 * aligned if it is ever rendered by an App Router navigation.
 */
export const dynamic = 'force-static';

export default function PartnerSignupAliasPage(): never {
  redirect('/partners#partner-signup');
}
