import { redirect } from 'next/navigation';

/**
 * The counselor root lands on Today — one list of who needs attention
 * (counselor audit 2026-09-20, §6.1). The Caseload overview lives at
 * /counselor/overview; a `?ui=` request (the legacy overview) is forwarded
 * there so the old link keeps working. Auth is enforced by the counselor
 * layout and again by the target page.
 */
export default async function CounselorRootPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const ui = (await searchParams)?.ui;
  redirect(ui ? `/counselor/overview?ui=${encodeURIComponent(ui)}` : '/counselor/today');
}
