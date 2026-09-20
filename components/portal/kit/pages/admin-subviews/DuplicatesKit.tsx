'use client';

import Link from 'next/link';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  type Column,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { Link as AstryxLink } from '@astryxdesign/core/Link';

/**
 * Duplicate students — likely-duplicate member accounts rendered as a dense
 * review table. Mockup: workforceap-admin-full.html "duplicates" view.
 * Target route: /admin/members/duplicates
 *
 * Columns: Match · Student A · Student B · Confidence · Action.
 * Each row is one candidate pair drawn from a real duplicate group (members
 * that share a lowercased email). "Match" describes which signals overlapped
 * (Email, Email + name, Email + phone, …) and "Confidence" is derived from how
 * many of those signals agree. Action links to the existing merge workspace.
 */

export interface DuplicateRow {
  /** Stable key — the canonical (lowercased) email + the two member ids. */
  id: string;
  /** What overlapped, e.g. "Email + name" or "Email". */
  matchKind: string;
  /** Display label for the first (kept) candidate. */
  studentA: string;
  /** Display label for the second (merge-into) candidate. */
  studentB: string;
  /** Confidence percentage 0–100, derived from overlapping signals. */
  confidence: number;
  /** Pre-built href into the merge workspace for this pair. */
  mergeHref: string;
}

export interface DuplicatesKitProps {
  rows?: DuplicateRow[];
  /** Total number of duplicate groups detected (for the subtitle). */
  groupCount?: number;
}

const DEFAULT_ROWS: DuplicateRow[] = [
  {
    id: 'demo-1',
    matchKind: 'Email + name',
    studentA: 'mike.brown@…',
    studentB: 'm.brown@…',
    confidence: 94,
    mergeHref: '/admin/members/merge',
  },
  {
    id: 'demo-2',
    matchKind: 'Phone',
    studentA: 'j.davis (id 412)',
    studentB: 'jdavis (id 889)',
    confidence: 81,
    mergeHref: '/admin/members/merge',
  },
];

/** Higher confidence → stronger emphasis; lower → calmer, informational color. */
function confidenceColor(confidence: number): TokenColor {
  if (confidence >= 90) return 'pink';
  if (confidence >= 75) return 'orange';
  return 'blue';
}

export function DuplicatesKit({ rows = DEFAULT_ROWS, groupCount }: DuplicatesKitProps) {
  const count = groupCount ?? rows.length;
  const subtitle =
    count === 0
      ? 'No likely duplicate accounts to merge'
      : `Likely duplicate accounts to merge — ${count.toLocaleString()} ${
          count === 1 ? 'pair' : 'pairs'
        } flagged`;

  const columns: Column<DuplicateRow>[] = [
    {
      key: 'matchKind',
      header: 'Match',
      render: (row) => (
        <span style={{ fontWeight: 700 }}>{row.matchKind}</span>
      ),
    },
    {
      key: 'studentA',
      header: 'Student A',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)' }}>{row.studentA}</span>
      ),
    },
    {
      key: 'studentB',
      header: 'Student B',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)' }}>{row.studentB}</span>
      ),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (row) => (
        <Token label={`${row.confidence}%`} size="sm" color={confidenceColor(row.confidence)} />
      ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (row) => (
        <AstryxLink href={row.mergeHref} as={Link as never} isStandalone>
          <Button label="Review & merge" variant="secondary" size="sm" />
        </AstryxLink>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader title="Duplicate students" kicker="Members" goal={subtitle} />

      <DataTable<DuplicateRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={720}
        mobile="cards"
        cardRender={(row) => (
          <Card padding={3}>
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
                  {row.matchKind}
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
                  {row.studentA} ↔ {row.studentB}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={`${row.confidence}%`} size="sm" color={confidenceColor(row.confidence)} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <AstryxLink href={row.mergeHref} as={Link as never} isStandalone>
                <Button label="Review & merge" variant="secondary" size="sm" />
              </AstryxLink>
            </div>
          </Card>
        )}
        emptyTitle="No likely duplicates"
        emptyDescription="Every active member email is unique. Flagged duplicate pairs will appear here when detected."
      />
    </DesignSurface>
  );
}
