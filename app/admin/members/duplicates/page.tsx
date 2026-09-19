import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { captureApiError } from '@/lib/observability/captureApiError';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import MemberDuplicatesClient from '@/components/admin/MemberDuplicatesClient';
import MembersListNav from '@/components/admin/MembersListNav';
import { DesignSurface } from '@/components/portal/kit';
import {
  DuplicatesKit,
  type DuplicateRow,
} from '@/components/portal/kit/pages/admin-subviews/DuplicatesKit';

export const metadata: Metadata = buildPageMetadata({
  title: 'Admin – Duplicate Members',
  description: 'Find and merge duplicate member records by email.',
  path: '/admin/members/duplicates',
});

/** Cap the lean detector so first paint stays cheap. */
const GROUP_LIMIT = 50;

const MERGE_ROUTE = '/admin/members/merge';

type DupMember = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  profilePhone: string | null;
};

/** Short, mockup-style label for a candidate, e.g. "mike.brown@…" or "j.davis (id ab12)". */
function candidateLabel(m: DupMember): string {
  const local = m.email.includes('@') ? m.email.split('@')[0] : m.email;
  if (local) return `${local}@…`;
  const name = m.fullName?.trim();
  return `${name || 'student'} (id ${m.id.slice(0, 4)})`;
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

/**
 * Real confidence from overlapping signals. The detector groups on a shared
 * lowercased email (always true here → 80 base), then adds weight when the
 * names match and when a phone number matches. Capped at 99.
 */
function scorePair(a: DupMember, b: DupMember): { kind: string; confidence: number } {
  const signals: string[] = ['Email'];
  let confidence = 80;

  const nameA = norm(a.fullName);
  const nameB = norm(b.fullName);
  if (nameA && nameA === nameB) {
    signals.push('name');
    confidence += 14;
  }

  const phoneA = norm(a.phone) || norm(a.profilePhone);
  const phoneB = norm(b.phone) || norm(b.profilePhone);
  if (phoneA && phoneA === phoneB) {
    signals.push('phone');
    confidence += 5;
  }

  // "Email", "Email + name", "Email + name + phone".
  const kind = signals.length === 1 ? 'Email' : `Email + ${signals.slice(1).join(' + ')}`;
  return { kind, confidence: Math.min(confidence, 99) };
}

export default async function AdminMemberDuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members/duplicates');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;

  // --- LEGACY (?ui=legacy): the proven interactive merge workspace, unchanged ---
  if (ui === 'legacy') {
    return (
      <PortalPageFrame>
        <PageHeader
          title="Duplicate Members"
          subtitle="Find and merge duplicate member records that share the same email address."
          breadcrumbs={[
            { label: 'Members', href: '/admin/members' },
            { label: 'Duplicates' },
          ]}
        />
        <MembersListNav />
        <MemberDuplicatesClient />
      </PortalPageFrame>
    );
  }

  // --- DEFAULT: design-kit duplicate review table wired into real dedup data ---
  return renderKit({ actorUserId: user.id });
}

/**
 * Design-kit default. Reuses the same duplicate-detection logic as
 * /api/admin/members/duplicates (group on lower(email) HAVING count > 1),
 * then renders one candidate pair per group through <DuplicatesKit/>.
 */
async function renderKit({ actorUserId }: { actorUserId: string }) {
  try {
    const superAdmin = await isSuperAdmin(actorUserId);
    const orgId = superAdmin
      ? null
      : await getActorOrganizationId(actorUserId);

    // Group by lowercased email, keep duplicate-only groups, newest member first.
    const groups = await prisma.$queryRaw<Array<{ email: string; ids: string[] }>>`
      SELECT lower(email) AS email,
             array_agg(id ORDER BY created_at DESC) AS ids
      FROM users
      WHERE deleted_at IS NULL
        ${orgId ? Prisma.sql`AND organization_id = ${orgId}` : Prisma.sql``}
      GROUP BY lower(email)
      HAVING count(*) > 1
      LIMIT ${GROUP_LIMIT}
    `;

    const allIds = groups.flatMap((g) => g.ids);
    const members = allIds.length
      ? await prisma.user.findMany({
          where: { id: { in: allIds }, ...(orgId ? { organizationId: orgId } : {}) },
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            profile: { select: { profilePhone: true } },
          },
        })
      : [];

    const byId = new Map<string, DupMember>(
      members.map((m) => [
        m.id,
        {
          id: m.id,
          fullName: m.fullName,
          email: m.email,
          phone: m.phone,
          profilePhone: m.profile?.profilePhone ?? null,
        },
      ]),
    );

    // One row per group: the two most-recent records (the default merge pair).
    const rows: DuplicateRow[] = groups
      .map((g) => {
        const a = byId.get(g.ids[0]);
        const b = byId.get(g.ids[1]);
        if (!a || !b) return null;
        const { kind, confidence } = scorePair(a, b);
        return {
          id: `${g.email}:${a.id}:${b.id}`,
          matchKind: kind,
          studentA: candidateLabel(a),
          studentB: candidateLabel(b),
          confidence,
          // Existing merge workspace; primary/secondary hints are harmless.
          mergeHref: `${MERGE_ROUTE}?primary=${encodeURIComponent(a.id)}&secondary=${encodeURIComponent(b.id)}`,
        } satisfies DuplicateRow;
      })
      .filter((r): r is DuplicateRow => r !== null)
      // Highest-confidence pairs first.
      .sort((x, y) => y.confidence - x.confidence);

    return (
      <DesignSurface surface="dense">
        <DuplicatesKit rows={rows} groupCount={rows.length} />
      </DesignSurface>
    );
  } catch (error) {
    // Detection failed — fall back to the proven interactive workspace rather
    // than rendering a fabricated/empty kit.
    captureApiError(error, { route: 'admin/members/duplicates', extra: { view: 'kit' } });
    redirect('/admin/members/duplicates?ui=legacy');
  }
}
