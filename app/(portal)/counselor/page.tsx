import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { deniedPortalHomeHref } from '@/lib/auth/portalGuards';
import { isAdmin, isCounselor } from '@/lib/auth/roles';

/**
 * The counselor root lands on Today — one list of who needs attention
 * (counselor audit 2026-09-20, §6.1). The Caseload overview lives at
 * /counselor/overview; a `?ui=` request (the legacy overview) is forwarded
 * there so the old link keeps working. Auth is checked here as well as in
 * the layout and target page, because Next may render the page and layout
 * in parallel.
 */
export default async function CounselorRootPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor');
  const [counselor, admin] = await Promise.all([
    isCounselor(user.id),
    isAdmin(user.id),
  ]);
  if (!counselor && !admin) redirect(await deniedPortalHomeHref(user.id, 'counselor'));

  const ui = (await searchParams)?.ui;
  redirect(ui ? `/counselor/overview?ui=${encodeURIComponent(ui)}` : '/counselor/today');
}
