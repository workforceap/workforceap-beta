'use client';

import { Mail } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  type KpiItem,
  type Column,
} from '@/components/portal/kit';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

/**
 * Email Templates — admin transactional templates rendered as a dense table.
 * No mockup; consistent dense-kit treatment mirroring BlogKit.
 * Target route: /admin/email-templates
 *
 * Columns: Template · Subject · Variables · Updated · Status.
 * Status is an Astryx Token (Active=green, Inactive=gray). A KpiStrip surfaces
 * real total / active / inactive counts. Editing, preview, and test-send live
 * in the richer legacy view, reachable via the header action (?ui=legacy).
 */

export interface EmailTemplateRow {
  id: string;
  /** Stable lookup key, e.g. "welcome_member". */
  key: string;
  name: string;
  subject: string;
  /** Number of {variable} placeholders the template accepts. */
  variableCount: number;
  active: boolean;
  /** Pre-formatted updated date, e.g. "Jun 10". */
  updated: string;
}

export interface EmailTemplatesKitProps {
  templates?: EmailTemplateRow[];
}

const DEFAULT_TEMPLATES: EmailTemplateRow[] = [
  {
    id: 'welcome',
    key: 'welcome_member',
    name: 'Welcome Member',
    subject: 'Welcome to WorkforceAP, {firstName}',
    variableCount: 2,
    active: true,
    updated: 'Jun 10',
  },
  {
    id: 'password-reset',
    key: 'password_reset',
    name: 'Password Reset',
    subject: 'Reset your password',
    variableCount: 1,
    active: true,
    updated: 'Jun 18',
  },
];

export function EmailTemplatesKit({ templates = DEFAULT_TEMPLATES }: EmailTemplatesKitProps) {
  const total = templates.length;
  const active = templates.filter((t) => t.active).length;
  const inactive = total - active;

  const kpis: KpiItem[] = [
    { label: 'Templates', value: total },
    { label: 'Active', value: active },
    { label: 'Inactive', value: inactive },
  ];

  const columns: Column<EmailTemplateRow>[] = [
    {
      key: 'name',
      header: 'Template',
      render: (row) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{row.name}</div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--wa-muted)',
              fontFamily: 'var(--wa-mono, monospace)',
            }}
          >
            {row.key}
          </div>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span
          style={{
            color: 'var(--wa-muted)',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 320,
          }}
        >
          {row.subject}
        </span>
      ),
    },
    {
      key: 'variableCount',
      header: 'Variables',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)', whiteSpace: 'nowrap' }}>
          {row.variableCount === 0 ? '—' : row.variableCount}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)', whiteSpace: 'nowrap' }}>{row.updated}</span>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (row) => (
        <Token label={row.active ? 'Active' : 'Inactive'} size="sm" color={row.active ? 'green' : 'gray'} />
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Email Templates"
        kicker="Messaging"
        lede="Transactional emails sent to members and staff"
        action={
          <KitLinkButton
            href="/admin/email-templates?ui=legacy"
            label="Preview & Edit"
            variant="primary"
            size="sm"
            icon={<Mail size={14} aria-hidden="true" />}
          />
        }
      />

      <div className="wa-mt-4 wa-mb-4">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<EmailTemplateRow>
        columns={columns}
        rows={templates}
        rowKey={(row) => row.id}
        minWidth={760}
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
                  {row.name}
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
                  {row.subject}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.active ? 'Active' : 'Inactive'} size="sm" color={row.active ? 'green' : 'gray'} />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13,
                color: 'var(--wa-muted)',
                marginTop: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--wa-mono, monospace)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.key}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>Updated {row.updated}</span>
            </div>
          </Card>
        )}
        emptyTitle="No email templates yet"
        emptyDescription="Transactional templates will appear here once seeded."
      />
    </DesignSurface>
  );
}
