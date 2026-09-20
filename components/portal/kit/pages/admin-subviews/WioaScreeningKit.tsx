import Link from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  Avatar,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';

/**
 * WIOA funding eligibility — screening & compliance (dense).
 * Mockup: workforceap-admin-full.html "wioa" view.
 * Target route: /admin/wioa-screening
 *
 * Server-rendered (no interactivity): the page loader does all the lean
 * aggregation (groupBy on review status + a capped findMany for the table) and
 * lands plain data here. DataTable mobile="cards" so the wide compliance table
 * stacks on phones instead of squishing.
 */

/** Determination drives the Token color + label in the table. */
export type WioaDetermination = 'Eligible' | 'Pending' | 'Needs docs' | 'Not eligible' | 'Unreviewed';

export interface WioaScreeningRow {
  id: string;
  /** Student / member full name. */
  name: string;
  initials: string;
  /** WIOA category caption, e.g. "Adult", "Dislocated Worker", "Youth". */
  category: string;
  /** Document status caption, e.g. "Complete" or "Missing W-2". */
  docs: string;
  /** Whether docs are outstanding (drives the docs cell color). */
  docsComplete: boolean;
  /** Staff determination → Token color. */
  determination: WioaDetermination;
  /** Reviewing staff name or "—". */
  reviewer: string;
}

export interface WioaScreeningKitProps {
  rows: WioaScreeningRow[];
  /** Total screenings submitted (table footer). */
  total: number;
  /** KPI: verified-eligible (staff). */
  eligible: number;
  /** KPI: pending + in-review. */
  pendingReview: number;
  /** KPI: needs more information / outstanding docs. */
  needDocs: number;
  /** KPI: determined not eligible (staff). */
  notEligible: number;
}

const DETERMINATION_COLOR: Record<WioaDetermination, TokenColor> = {
  Eligible: 'green',
  Pending: 'yellow',
  'Needs docs': 'pink',
  'Not eligible': 'gray',
  Unreviewed: 'blue',
};

export function WioaScreeningKit({
  rows,
  total,
  eligible,
  pendingReview,
  needDocs,
  notEligible,
}: WioaScreeningKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Eligible', value: eligible, color: 'success' },
    { label: 'Pending Review', value: pendingReview, color: 'gold' },
    { label: 'Need Docs', value: needDocs, color: 'accent' },
    { label: 'Not Eligible', value: notEligible },
  ];

  const StudentCell = ({ row }: { row: WioaScreeningRow }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Avatar initials={row.initials} size={32} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.name}
        </div>
      </div>
    </div>
  );

  const columns: Column<WioaScreeningRow>[] = [
    { key: 'name', header: 'Student', render: (row) => <StudentCell row={row} /> },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)' }}>{row.category}</span>
      ),
    },
    {
      key: 'docs',
      header: 'Docs',
      render: (row) => (
        <span
          style={{ color: row.docsComplete ? 'var(--wa-text)' : 'var(--wa-accent)', fontWeight: row.docsComplete ? 400 : 700 }}
        >
          {row.docs}
        </span>
      ),
    },
    {
      key: 'determination',
      header: 'Determination',
      render: (row) => (
        <Token label={row.determination} size="sm" color={DETERMINATION_COLOR[row.determination]} />
      ),
    },
    {
      key: 'reviewer',
      header: 'Reviewer',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.reviewer}</span>,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => (
        <AstryxLink href={`/admin/members/${row.id}`} as={Link as never} isStandalone>
          <Button label="Open" variant="secondary" size="sm" />
        </AstryxLink>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Funding eligibility"
        kicker="Compliance"
        lede="WIOA screening & compliance"
        action={
          <AstryxLink href="/admin/wioa-screening?ui=legacy" as={Link as never} isStandalone>
            <Button label="Review queue" variant="secondary" size="sm" />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<WioaScreeningRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={680}
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
                <StudentCell row={row} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <Token label={row.determination} size="sm" color={DETERMINATION_COLOR[row.determination]} />
                <AstryxLink href={`/admin/members/${row.id}`} as={Link as never} isStandalone>
                  <Button label="Open" variant="secondary" size="sm" />
                </AstryxLink>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13,
                color: 'var(--wa-muted)',
                margin: '12px 0 0',
              }}
            >
              <span>
                Category <b style={{ color: 'var(--wa-text)' }}>{row.category}</b>
              </span>
              <span>
                Docs{' '}
                <b style={{ color: row.docsComplete ? 'var(--wa-text)' : 'var(--wa-accent)' }}>
                  {row.docs}
                </b>
              </span>
              <span>
                Reviewer <b style={{ color: 'var(--wa-text)' }}>{row.reviewer}</b>
              </span>
            </div>
          </Card>
        )}
        emptyTitle="No screenings yet"
        emptyDescription="Members who complete the WIOA self-screening will appear here for review."
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {rows.length} of {total}
      </p>
    </DesignSurface>
  );
}
