import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { ADMIN_SSR_LIST_CAP } from '@/lib/db/queryCaps';

import PageHeader from '@/components/portal/PageHeader';
import DataTable from '@/components/portal/ui/DataTable';

/**
 * Legacy subgroups workspace (table + mobile cards). Preserved behind
 * `/admin/subgroups?ui=legacy` after the design-kit conversion of the default
 * view. This is the pre-conversion render verbatim, factored into its own
 * async server component so the new page can fall back to it on data failure.
 */
export default async function AdminSubgroupsLegacy() {
  const subgroups = await prisma.subgroup.findMany({
    take: ADMIN_SSR_LIST_CAP,
    orderBy: { name: 'asc' },
    include: {
      leader: { select: { id: true, fullName: true, email: true } },
      partner: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  });

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      <PageHeader
        title="Subgroups"
        action={
          <Link
            href="/admin/subgroups/new"
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-accent)',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Create Subgroup
          </Link>
        }
      />

      <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem', maxWidth: '600px' }}>
        Subgroups let partners, managers, and churches see all members assigned to their group. Members can be
        assigned manually or auto-assigned when referred by a linked partner.
      </p>

      {subgroups.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No subgroups yet</h3>
          <p>
            Create subgroups to give partners, managers, or churches visibility into their assigned members. Each
            subgroup has a leader who can view member progress in the portal.
          </p>
          <Link href="/admin/subgroups/new" className="btn btn-primary">
            Create Subgroup
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="admin-table-scroll admin-subgroup-desktop">
            <DataTable
              variant="admin"
              tableClassName="admin-table"
              scrollX={false}
              rows={subgroups}
              rowKey={(sg) => sg.id}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  cell: (sg) => (
                    <>
                      <div style={{ fontWeight: 600 }}>{sg.name}</div>
                      {sg.description ? (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', maxWidth: 200 }}>
                          {sg.description}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: 'type',
                  header: 'Type',
                  cell: (sg) => (
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8125rem',
                        textTransform: 'capitalize',
                        background: 'var(--color-light)',
                      }}
                    >
                      {sg.type}
                    </span>
                  ),
                },
                {
                  key: 'leader',
                  header: 'Leader',
                  cell: (sg) => (
                    <>
                      <div style={{ fontSize: '0.9rem' }}>{sg.leader.fullName}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{sg.leader.email}</div>
                    </>
                  ),
                },
                { key: 'partner', header: 'Partner', cell: (sg) => sg.partner?.name ?? '—' },
                {
                  key: 'members',
                  header: 'Members',
                  align: 'center',
                  cell: (sg) => sg._count.members,
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  cell: (sg) => (
                    <Link
                      href={`/admin/subgroups/${sg.id}`}
                      style={{ color: 'var(--wa-accent-text)', textDecoration: 'none', fontSize: '0.9rem' }}
                    >
                      Manage &rarr;
                    </Link>
                  ),
                },
              ]}
            />
          </div>

          {/* Mobile cards */}
          <ul className="admin-portal-card-list admin-subgroup-cards" aria-label="Subgroups (mobile layout)">
            {subgroups.map((sg) => (
              <li key={sg.id} className="admin-portal-card">
                <div className="admin-portal-card__header">
                  <div>
                    <div style={{ fontWeight: 700 }}>{sg.name}</div>
                    <div className="admin-portal-card__meta">{sg.leader.fullName}</div>
                  </div>
                  <span
                    className="admin-portal-card__badge"
                    style={{ background: 'var(--color-light)', color: 'var(--color-on-surface)' }}
                  >
                    {sg._count.members} members
                  </span>
                </div>
                {sg.description ? <p className="admin-portal-card__meta">{sg.description}</p> : null}
                <p className="admin-portal-card__meta">
                  Type: <span style={{ textTransform: 'capitalize' }}>{sg.type}</span>
                </p>
                <p className="admin-portal-card__meta">Partner: {sg.partner?.name ?? '—'}</p>
                <div className="admin-portal-card__actions">
                  <Link href={`/admin/subgroups/${sg.id}`} style={{ color: 'var(--wa-accent-text)', textDecoration: 'none', fontSize: '0.9rem' }}>
                    Manage &rarr;
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
