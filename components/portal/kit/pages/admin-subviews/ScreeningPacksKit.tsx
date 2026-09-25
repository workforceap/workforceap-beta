'use client';

import type { ReactNode } from 'react';
import { ScreeningPackRowActions } from '@/components/admin/ScreeningPackRowActions';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  DataTable,
  type Column,
} from '@/components/portal/kit';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

/**
 * Employer screening packs — pre-built candidate screening packs per employer,
 * rendered as a dense roster table.
 * Mockup: workforceap-admin-full.html "screening-packs" view.
 * Target route: /admin/employer-screening-packs
 *
 * Columns: Employer · Role family · Checks · Used · Status.
 * Used renders as a gray Astryx Token ("18×"), Status as a green/gray Token
 * (Active / Inactive). Wide table collapses to stacked cards on mobile via
 * DataTable mobile="cards".
 */

export interface ScreeningPackRow {
  id: string;
  /** Employer label, e.g. "Deloitte". */
  employer: string;
  /** Role family / program, e.g. "Salesforce Admin". */
  roleFamily: string;
  /** Human summary of the screen, e.g. "Background + skills". */
  checks: string;
  /** Usage / question-count metric, pre-formatted muted tag, e.g. "18×". */
  used: string;
  active: boolean;
}

export interface ScreeningPacksKitProps {
  packs?: ScreeningPackRow[];
  /** Total packs (for the subtitle). */
  totalPacks?: number;
  /** Active packs (for the subtitle). */
  activePacks?: number;
  /** Show Activate / Deactivate / Delete on each row (WAP-193). */
  manageable?: boolean;
  /** New-pack form, rendered under the table (WAP-193). */
  createForm?: ReactNode;
  /** In-page anchor of `createForm`; the header button jumps there. */
  createFormHref?: string;
}

const DEFAULT_PACKS: ScreeningPackRow[] = [
  {
    id: 'deloitte-sf-admin',
    employer: 'Deloitte',
    roleFamily: 'Salesforce Admin',
    checks: 'Background + skills',
    used: '18×',
    active: true,
  },
  {
    id: 'dell-it-support',
    employer: 'Dell',
    roleFamily: 'IT Support',
    checks: 'Skills + typing',
    used: '24×',
    active: true,
  },
];

export function ScreeningPacksKit({
  packs = DEFAULT_PACKS,
  totalPacks,
  activePacks,
  manageable = false,
  createForm,
  createFormHref,
}: ScreeningPacksKitProps) {
  const actions = (row: ScreeningPackRow) =>
    manageable ? (
      <ScreeningPackRowActions id={row.id} label={`${row.employer} · ${row.roleFamily}`} active={row.active} />
    ) : null;
  const total = totalPacks ?? packs.length;
  const active = activePacks ?? packs.filter((p) => p.active).length;
  const subtitle = `${active.toLocaleString()} active ${
    active === 1 ? 'pack' : 'packs'
  } of ${total.toLocaleString()} total`;

  const columns: Column<ScreeningPackRow>[] = [
    {
      key: 'employer',
      header: 'Employer',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.employer}</span>,
    },
    {
      key: 'roleFamily',
      header: 'Role family',
      render: (row) => <span>{row.roleFamily}</span>,
    },
    {
      key: 'checks',
      header: 'Checks',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.checks}</span>,
    },
    {
      key: 'used',
      header: 'Used',
      render: (row) => <Token label={row.used} size="sm" color="gray" />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Token label={row.active ? 'Active' : 'Inactive'} size="sm" color={row.active ? 'green' : 'gray'} />
      ),
    },
  ];
  if (manageable) {
    columns.push({ key: 'actions', header: 'Actions', render: actions });
  }

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Employer screening"
        kicker="Employers"
        lede={subtitle}
        action={
          createForm && createFormHref ? (
            <KitLinkButton href={createFormHref} label="New pack" variant="secondary" size="sm" />
          ) : (
            <KitLinkButton href="/admin/employer-screening-packs?ui=legacy" label="Manage packs" variant="secondary" size="sm" />
          )
        }
      />

      <DataTable<ScreeningPackRow>
        columns={columns}
        rows={packs}
        rowKey={(row) => row.id}
        minWidth={manageable ? 900 : 720}
        mobile="cards"
        cardRender={(row) => (
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.employer}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.roleFamily} · {row.checks}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.active ? 'Active' : 'Inactive'} size="sm" color={row.active ? 'green' : 'gray'} />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 8,
                fontSize: 13,
                color: 'var(--wa-muted)',
                marginTop: 12,
              }}
            >
              <span>Used</span>
              <Token label={row.used} size="sm" color="gray" />
            </div>
            {manageable ? <div style={{ marginTop: 12 }}>{actions(row)}</div> : null}
          </Card>
        )}
        emptyTitle="No screening packs"
        emptyDescription="Employer-designed screening packs will appear here once they are created."
      />

      {createForm ? <div style={{ marginTop: 24, maxWidth: 900 }}>{createForm}</div> : null}
    </DesignSurface>
  );
}
