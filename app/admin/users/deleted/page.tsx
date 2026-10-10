import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { ADMIN_SSR_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';
import PageHeader from '@/components/portal/PageHeader';
import DeletedUsersClient, {
  type DeletedUserRow,
} from '@/components/admin/DeletedUsersClient';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Deleted users',
  description: 'Review deleted accounts, release email addresses, and request eligible restoration.',
  path: '/admin/users/deleted',
});
}

/**
 * Soft-deleted users admin view. Built per user direction 2026-04-26
 * after they noticed an existing deleted row was still blocking re-
 * signup with the same email even after the delete-route fix in #757
 * (which only applies to future deletes).
 *
 * From here, an admin can:
 *   - "Free email" — rewrite the row's email to a sentinel form so
 *     the original address is reusable for new signups
 *   - "Restore" — request sign-in and app-row restoration only when account
 *     safeguards allow it. Retained document/erasure/restore fences block it;
 *     erased files and anonymized data are not recovered. Auth may be unbanned
 *     or re-created by the route, with password-reset guidance when needed.
 *   - "Free all emails" — batch-rewrite every soft-deleted row whose
 *     email still occupies the unique slot
 */
export default async function AdminDeletedUsersPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/users/deleted');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const [rows, total, stillBoundCount] = await withAdminPageScope(scope, (db) =>
    Promise.all([
      db.user.findMany({
        take: ADMIN_SSR_LIST_CAP,
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          deletedAt: true,
          createdAt: true,
        },
      }),
      db.user.count({ where: { deletedAt: { not: null } } }),
      db.user.count({
        where: {
          deletedAt: { not: null },
          NOT: { email: { endsWith: '@deleted.invalid' } },
        },
      }),
    ]),
  );

  const data: DeletedUserRow[] = rows.map((r) => {
    const parsed = parseSentinelEmail(r.email);
    return {
      id: r.id,
      fullName: r.fullName,
      currentEmail: r.email,
      originalEmail: parsed?.original ?? r.email,
      isFreed: parsed != null,
      deletedAt: r.deletedAt!.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  });

  return (
    <>
      <PageHeader
        title="Deleted users"
        subtitle={
          isListTruncated(data.length, ADMIN_SSR_LIST_CAP, total)
            ? showingFirstLabel(data.length, total, 'deleted users')
            : 'Review deleted records and release email addresses. Restoration depends on account safeguards and cannot recover erased data.'
        }
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Users', href: '/admin/users' },
          { label: 'Deleted' },
        ]}
      />
      <DeletedUsersClient
        rows={data}
        totalDeletedCount={total}
        stillBoundCount={stillBoundCount}
      />
    </>
  );
}

/**
 * Parse the `deleted_{userId}_{timestampMs}_{originalEmail}@deleted.invalid`
 * sentinel form (see app/api/admin/members/[id]/delete/route.ts) to
 * recover the original email. Returns null if the email is not in
 * the sentinel form (i.e. legacy soft-deletes from before #757).
 */
function parseSentinelEmail(email: string): { original: string } | null {
  if (!email.endsWith('@deleted.invalid')) return null;
  const trimmed = email.slice(0, -'@deleted.invalid'.length);
  // deleted_{userId}_{timestampMs}_{originalEmail}
  // Strip 'deleted_' prefix, then UUID, then timestamp, then the rest is the email.
  const m = trimmed.match(/^deleted_([0-9a-f-]{36})_(\d+)_(.+)$/i);
  if (!m) return null;
  return { original: m[3] };
}
