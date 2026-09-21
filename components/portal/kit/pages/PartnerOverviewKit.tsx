/**
 * Partner overview — page-specific kit sections (?ui=kit / default path).
 *
 * These compose existing kit primitives + the .wa-kit-* token CSS to render the
 * mockup sections that have no standalone primitive yet:
 *   - <PartnerKpiGrid>          Compact StatTile metrics with captions inside;
 *     supplied trend data keeps the richer StatSparkTile variant.
 *   - <PartnerReferralFunnel>   Referred → Enrolled → Placed in one desktop row.
 *   - <PartnerPayoutLedger>     Payout history as a period/amount/status table.
 *   - <PartnerAttentionCard>    "Review member progress" accent CTA card
 *   - <PartnerAssistantAccordion> collapsible Partner-assistant disclosure
 *   - <PartnerQuickActions>     3-up Quick Actions grid (Export / Refer / Milestones)
 *
 * Target mockup: docs/mockups/wa-v2-partner.html — elevated to the "Command
 * Center" visual language shipped in MemberHomeKit (StatSparkTile, RankBars,
 * DataTable). No shared kit primitive is modified; everything here composes
 * `@/components/portal/kit` exports as-is.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Users } from 'lucide-react';
import {
  CardHead,
  DataTable,
  ProgressBar,
  StatTile,
  StatSparkTile,
  StatusTag,
  type KitColor,
  type KitTone,
  type SparkStat,
} from '@/components/portal/kit';
import styles from './PartnerOverviewKit.module.css';

// ── KPI grid: StatSparkTile (icon + delta chip + optional sparkline) ──────────

export interface PartnerKpiTile {
  label: string;
  value: string | number;
  /** Muted meta line rendered under the tile card. Degrades gracefully when omitted. */
  subtitle?: string;
  /** Semantic state derived from the value (KitTone); paints the icon chip / edge accent, never the number. */
  tone?: KitTone;
  /**
   * Rendered icon element, e.g. `<Users size={16} />` — not the bare component
   * reference (StatSparkTile is a Client Component; a raw component ref can't
   * cross a Server → Client boundary). Defaults to a `Users` icon when omitted.
   */
  icon?: ReactNode;
  /** Optional trend sparkline + delta chip. Omit to render the tile without either. */
  spark?: SparkStat;
}

export function PartnerKpiGrid({ items }: { items: PartnerKpiTile[] }) {
  return (
    <div className={styles.metrics}>
      {items.map((it) => (
        it.spark ? <div key={it.label} className={styles.trendMetric}>
          <StatSparkTile
            icon={it.icon ?? <Users size={16} />}
            label={it.label}
            value={it.value}
            tone={it.tone}
            spark={it.spark}
          />
          {it.subtitle ? (
            <p className={styles.caption}>{it.subtitle}</p>
          ) : null}
        </div> : <StatTile key={it.label} label={it.label} value={it.value} tone={it.tone} delta={it.subtitle} deltaTone="muted" className={styles.metric} />
      ))}
    </div>
  );
}

// ── Referral funnel: Referred → Enrolled → Placed (RankBars) ──────────────────

export interface PartnerFunnelStage {
  label: string;
  value: number | string;
  /** 0–100 bar width, relative to the top of the funnel. */
  pct: number;
  /** Semantic state of the stage bar (`ok` for placed); omit for the accent fill. */
  tone?: KitTone;
}

export function PartnerReferralFunnel({ stages }: { stages: PartnerFunnelStage[] }) {
  return (
    <section className={`wa-kit-card ${styles.funnel}`} aria-label="Referral funnel">
      <CardHead title="Referral funnel" />
      <section className={styles.stages} aria-label="Referral stages">
        {stages.map(stage => <section key={stage.label} className={styles.stage} aria-label={stage.label}>
          <p><span>{stage.label}</span><strong>{stage.value}</strong></p>
          <ProgressBar pct={stage.pct} tone={stage.tone} aria-label={`${stage.label} as a share of referrals`} />
        </section>)}
      </section>
    </section>
  );
}

// ── Payout ledger: period / amount / status table ─────────────────────────────

export interface PartnerPayoutLedgerRow {
  id: string;
  /** Date or pay-period label, e.g. "6/2/2026". */
  period: string;
  /** Pre-formatted currency label, e.g. "$500". */
  amount: string;
  status: string;
  /** StatusTag tone for the status pill. Defaults to 'ok' (paid/settled). */
  statusTone?: KitTone;
}

export function PartnerPayoutLedger({ rows }: { rows: PartnerPayoutLedgerRow[] }) {
  return (
    <DataTable<PartnerPayoutLedgerRow>
      columns={[
        { key: 'period', header: 'Period' },
        {
          key: 'amount',
          header: 'Amount',
          align: 'right',
          render: (r) => (
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.amount}</span>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusTag tone={r.statusTone ?? 'ok'}>{r.status}</StatusTag>,
        },
      ]}
      rows={rows}
      rowKey={(r) => r.id}
      mobile="scroll"
      emptyTitle="No payouts yet"
      emptyDescription="Verified placements that generate a payout will appear here."
    />
  );
}

// ── Attention / CTA card (accent-soft background) ─────────────────────────────

export function PartnerAttentionCard({
  icon,
  title,
  body,
  href,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`wa-kit-focus ${styles.attention}`}
    >
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span className={styles.attentionCopy}><strong>{title}</strong>{' '}<span>{body}</span></span>
      <ChevronRight size={18} aria-hidden />
    </Link>
  );
}

// ── Partner-assistant accordion (collapsed by default) ────────────────────────

export function PartnerAssistantAccordion({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <details className="wa-kit-card">
      <summary
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          listStyle: 'none',
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--wa-text)',
        }}
      >
        <span aria-hidden style={{ fontSize: 13, color: 'var(--wa-accent)' }}>
          ▶
        </span>
        <span>{title}</span>
        {hint ? (
          <span style={{ fontSize: 13, color: 'var(--wa-muted)', marginLeft: 'auto', fontWeight: 400 }}>
            {hint}
          </span>
        ) : null}
      </summary>
      {children ? <div style={{ marginTop: 14 }}>{children}</div> : null}
    </details>
  );
}

// ── Quick Actions grid (3-up) ─────────────────────────────────────────────────

export interface PartnerQuickAction {
  icon: ReactNode;
  /** Icon chip tint + glyph color. */
  tone: 'accent' | 'info' | 'gold';
  title: string;
  body: string;
  href: string;
}

const CHIP_BG: Record<PartnerQuickAction['tone'], string> = {
  accent: 'var(--wa-accent-soft)',
  info: 'var(--wa-info-soft)',
  gold: 'var(--wa-gold-soft)',
};
const CHIP_FG: Record<PartnerQuickAction['tone'], string> = {
  accent: 'var(--wa-accent)',
  info: 'var(--wa-info)',
  gold: 'var(--wa-gold)',
};

export function PartnerQuickActions({ actions }: { actions: PartnerQuickAction[] }) {
  return (
    <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-3 wa-gap-3">
      {actions.map((a) => (
        <Link
          key={a.title}
          href={a.href}
          className="wa-kit-card wa-kit-card--hover wa-kit-focus"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 16,
              background: CHIP_BG[a.tone],
              color: CHIP_FG[a.tone],
            }}
          >
            {a.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)' }}>{a.title}</div>
            <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>{a.body}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
