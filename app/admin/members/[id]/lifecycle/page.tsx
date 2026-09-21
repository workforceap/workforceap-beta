import { redirect } from 'next/navigation';

/**
 * `/admin/members/[id]/lifecycle` is a redirect alias of the member record's
 * Activity tab (admin audit gap map, wave 16 follow-up): the lifecycle
 * timeline lives in `/admin/members/[id]?tab=activity`, so old links and
 * bookmarks land on the same record instead of a second page.
 */
export default async function AdminMemberLifecyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/members/${encodeURIComponent(id)}?tab=activity`);
}
