import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';

/**
 * Old Coursera integration page, now a redirect stub with no UI of its own.
 *
 * Coursera courses open from My Program (/dashboard/program), so that is where
 * this lands. It used to forward every query param to /dashboard, but the only
 * params that page read were the member home's own `ui` / `tab` / `program`
 * switches, none of which mean anything on My Program (a stray `?ui=legacy`
 * would even pin My Program's legacy view). Nothing is forwarded.
 */
export default async function CourseraIntegrationPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/program');
  redirect('/dashboard/program');
}
