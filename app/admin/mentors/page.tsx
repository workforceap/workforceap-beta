import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import DataTable from '@/components/portal/ui/DataTable';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { ADMIN_SSR_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';
import {
  MentorsDirectoryKit,
  type MentorCard,
} from '@/components/portal/kit/pages/admin-subviews/MentorsDirectoryKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin - Mentors',
  description: 'Review mentor applications and manage mentor activation.',
  path: '/admin/mentors',
});
}

/** Cap the directory so first paint stays cheap. */
const MENTOR_LIMIT = 200;

/** Build initials from a full name (e.g. "David Kim" → "DK"). */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Mentor.title is free text, often "Role at Company" (e.g. "Senior Software
 * Engineer at Google"). The card shows "{Role} @ {Company}", so strip a
 * trailing " at <company>" / " @ <company>" from the title when it duplicates
 * the company column.
 */
function roleFrom(title: string, company: string): string {
  const trimmed = title.trim();
  const lowered = trimmed.toLowerCase();
  const co = company.trim().toLowerCase();
  if (co) {
    for (const sep of [` at ${co}`, ` @ ${co}`, `, ${co}`]) {
      if (lowered.endsWith(sep)) return trimmed.slice(0, trimmed.length - sep.length).trim();
    }
  }
  return trimmed;
}

async function updateMentorAction(formData: FormData) {
  'use server';

  const user = await getUser();
  if (!user) return;
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const mentorId = String(formData.get('mentorId') || '');
  const action = String(formData.get('action') || '');

  if (!mentorId) return;

  const data =
    action === 'approve'
      ? { isActive: true, approvedAt: new Date() }
      : action === 'deactivate'
        ? { isActive: false }
        : action === 'activate'
          ? { isActive: true }
          : null;
  if (!data) return;

  // Mentor is not covered by the tenant scope proxy. Keep the write bound to
  // the mentor's related user for org admins; super-admin deliberately gets
  // the empty predicate for cross-tenant support.
  const result = await prisma.mentor.updateMany({
    where: { id: mentorId, ...inheritUserOrg(scope) },
    data,
  });
  if (result.count !== 1) {
    console.warn('[admin/mentors] mentor update rejected or target missing', {
      mentorId,
      action,
      orgId: scope.orgId,
    });
  }
}

function getMentorStatusLabel(mentor: {
  approvedAt: Date | null;
  isActive: boolean;
}) {
  if (!mentor.approvedAt) return 'Pending';
  return mentor.isActive ? 'Approved' : 'Deactivated';
}

const actionButtonStyle = {
  border: 0,
  borderRadius: '0.45rem',
  padding: '0.45rem 0.7rem',
  color: '#fff',
  fontWeight: 600,
};

export default async function AdminMentorsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/mentors');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  if (requestedUi === 'legacy') {
    return <LegacyMentorsView scope={scope} />;
  }

  // --- DEFAULT: real (lean) mentor directory wired into MentorsDirectoryKit ---

  // Lean directory page + full count + mentee counts (distinct members per
  // mentor, via mentor sessions), all in parallel. Aggregate failures degrade
  // gracefully — the directory must still render.
  const userOrg = inheritUserOrg(scope);
  const [mentorsResult, totalResult, activeResult, sessionPairsResult] = await withAdminPageScope(scope, (db) => Promise.allSettled([
    db.mentor.findMany({
      take: MENTOR_LIMIT,
      where: { ...userOrg },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        title: true,
        company: true,
        isActive: true,
        approvedAt: true,
      },
    }),
    db.mentor.count({ where: { ...userOrg } }),
    db.mentor.count({ where: { isActive: true, approvedAt: { not: null }, ...userOrg } }),
    // Distinct (mentor, member) pairs → one row per pairing. groupBy gives us
    // the unique member set per mentor without loading every session.
    db.mentorSession.groupBy({
      by: ['mentorId', 'memberId'],
    }),
  ]));

  // If the core directory query fails, fall back to the proven legacy view
  // rather than rendering a fabricated/empty kit.
  if (mentorsResult.status === 'rejected') {
    console.error('[admin/mentors] directory load failed', mentorsResult.reason);
    return <LegacyMentorsView scope={scope} />;
  }

  const mentorRows = mentorsResult.value;
  const total = totalResult.status === 'fulfilled' ? totalResult.value : mentorRows.length;
  const activeCount =
    activeResult.status === 'fulfilled'
      ? activeResult.value
      : mentorRows.filter((m) => m.isActive && m.approvedAt).length;

  // Mentee count = number of distinct members a mentor has session(s) with.
  const menteeCountMap = new Map<string, number>();
  if (sessionPairsResult.status === 'fulfilled') {
    for (const row of sessionPairsResult.value) {
      menteeCountMap.set(row.mentorId, (menteeCountMap.get(row.mentorId) ?? 0) + 1);
    }
  }

  const mentors: MentorCard[] = mentorRows.map((m) => ({
    id: m.id,
    name: m.fullName,
    initials: initialsFrom(m.fullName),
    role: roleFrom(m.title, m.company),
    company: m.company || '—',
    mentees: menteeCountMap.get(m.id) ?? 0,
    isActive: m.isActive,
    isApproved: Boolean(m.approvedAt),
  }));

  const mentorAggregateLoadFailed = [totalResult, activeResult, sessionPairsResult].some(
    (result) => result.status === 'rejected',
  );
  return (
    <>
      {mentorAggregateLoadFailed ? <span hidden data-portal-error-state="admin-mentors-aggregate-load" /> : null}
      <MentorsDirectoryKit mentors={mentors} total={total} activeCount={activeCount} />
    </>
  );
}

/** Original mentor admin workspace (table + approve/deactivate). Behind ?ui=legacy. */
async function LegacyMentorsView({ scope }: { scope: import("@/lib/tenant/adminPageScope").AdminPageTenantOk }) {
  const userOrg = inheritUserOrg(scope);
  const [mentors, total] = await withAdminPageScope(scope, (db) => Promise.all([
    db.mentor.findMany({
      take: ADMIN_SSR_LIST_CAP,
      where: { ...userOrg },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        company: true,
        industry: true,
        isActive: true,
        approvedAt: true,
        createdAt: true,
      },
    }),
    db.mentor.count({ where: { ...userOrg } }),
  ]));

  return (
    <main style={{ padding: '1.5rem' }}>
      <PageHeader
        title="Mentors"
        subtitle={
          isListTruncated(mentors.length, ADMIN_SSR_LIST_CAP, total)
            ? showingFirstLabel(mentors.length, total, 'mentors')
            : 'Review mentor applications and toggle active mentor availability.'
        }
      />

      <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.75rem' }}>
        {mentors.map((mentor) => {
          const status = getMentorStatusLabel(mentor);
          return (
            <div key={mentor.id} className="portal-card portal-card--flat" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{mentor.fullName}</h2>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
                    {mentor.company || 'No company listed'}
                  </p>
                </div>
                <span className="admin-job-status-pill" style={{ alignSelf: 'flex-start' }}>{status}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                    Industry
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.95rem' }}>{mentor.industry || 'Not provided'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                    Applied
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.95rem' }}>{mentor.createdAt.toLocaleDateString()}</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {!mentor.approvedAt ? (
                  <form action={updateMentorAction}>
                    <input type="hidden" name="mentorId" value={mentor.id} />
                    <input type="hidden" name="action" value="approve" />
                    <button type="submit" style={{ ...actionButtonStyle, width: '100%', background: 'var(--color-accent)' }}>Approve mentor</button>
                  </form>
                ) : null}
                {mentor.approvedAt && mentor.isActive ? (
                  <form action={updateMentorAction}>
                    <input type="hidden" name="mentorId" value={mentor.id} />
                    <input type="hidden" name="action" value="deactivate" />
                    <button type="submit" style={{ ...actionButtonStyle, width: '100%', background: '#a91b3f' }}>Deactivate mentor</button>
                  </form>
                ) : null}
                {mentor.approvedAt && !mentor.isActive ? (
                  <form action={updateMentorAction}>
                    <input type="hidden" name="mentorId" value={mentor.id} />
                    <input type="hidden" name="action" value="activate" />
                    <button type="submit" style={{ ...actionButtonStyle, width: '100%', background: 'var(--color-accent)' }}>Activate mentor</button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="wa-hidden md:wa-block" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '52rem' }}>
        <DataTable
          variant="portal"
          scrollX={false}
          rows={mentors}
          rowKey={(m) => m.id}
          columns={[
            { key: 'name', header: 'Name', cell: (mentor) => mentor.fullName },
            { key: 'company', header: 'Company', cell: (mentor) => mentor.company },
            { key: 'industry', header: 'Industry', cell: (mentor) => mentor.industry },
            { key: 'status', header: 'Status', cell: (mentor) => getMentorStatusLabel(mentor) },
            {
              key: 'applied',
              header: 'Applied Date',
              cell: (mentor) => mentor.createdAt.toLocaleDateString(),
            },
            {
              key: 'actions',
              header: 'Actions',
              cell: (mentor) => (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!mentor.approvedAt ? (
                    <form action={updateMentorAction}>
                      <input type="hidden" name="mentorId" value={mentor.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button type="submit" style={{ ...actionButtonStyle, background: 'var(--color-accent)' }}>
                        Approve
                      </button>
                    </form>
                  ) : null}
                  {mentor.approvedAt && mentor.isActive ? (
                    <form action={updateMentorAction}>
                      <input type="hidden" name="mentorId" value={mentor.id} />
                      <input type="hidden" name="action" value="deactivate" />
                      <button type="submit" style={{ ...actionButtonStyle, background: '#a91b3f' }}>
                        Deactivate
                      </button>
                    </form>
                  ) : null}
                  {mentor.approvedAt && !mentor.isActive ? (
                    <form action={updateMentorAction}>
                      <input type="hidden" name="mentorId" value={mentor.id} />
                      <input type="hidden" name="action" value="activate" />
                      <button type="submit" style={{ ...actionButtonStyle, background: 'var(--color-accent)' }}>
                        Activate
                      </button>
                    </form>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </div>
      </div>
    </main>
  );
}
