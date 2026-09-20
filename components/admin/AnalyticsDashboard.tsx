'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { AnalyticsOverview } from '@/lib/admin/analytics';
import { programDisplayTitle } from '@/lib/content/programTitle';

const MUTED = 'var(--color-on-surface-variant)';
const ACCENT = 'var(--color-accent)';
const SUCCESS = '#16a34a';
const WARNING = '#d97706';
const DANGER = '#dc2626';
const SURFACE = 'var(--surface-container-low)';
const CARD_BG = 'var(--surface-container)';

const PIE_COLORS = [ACCENT, SUCCESS, WARNING, DANGER];

function StatCard({
  value,
  label,
  hint,
  accent,
}: {
  value: string | number;
  label: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div
      className="portal-card portal-card--flat"
      style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
    >
      <span
        style={{
          fontSize: 'clamp(1.5rem, 4vw, 2rem)',
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: accent ?? 'var(--color-on-surface)',
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: MUTED,
        }}
      >
        {label}
      </span>
      {hint ? (
        <span style={{ fontSize: '0.8125rem', color: MUTED, lineHeight: 1.35 }}>{hint}</span>
      ) : null}
    </div>
  );
}

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: SURFACE,
        borderRadius: '0.75rem',
        overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(226,226,229,0.05)', background: CARD_BG }}>
        <h2 className="portal-section-heading" style={{ margin: 0 }}>{title}</h2>
        {subtitle ? (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: MUTED }}>{subtitle}</p>
        ) : null}
      </div>
      <div style={{ padding: '1.5rem' }}>{children}</div>
    </section>
  );
}

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

interface AnalyticsDashboardProps {
  data: AnalyticsOverview;
}

export default function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
  const statusPieData = [
    { name: 'Active', value: data.memberStatus.active, color: SUCCESS },
    { name: 'Placed', value: data.memberStatus.placed, color: ACCENT },
    { name: 'Inactive', value: data.memberStatus.inactive, color: DANGER },
  ].filter((d) => d.value > 0);

  return (
    <PortalPageFrame
      title="Analytics Overview"
      subtitle="Enrollment, progress, and outcomes at a glance."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', padding: '0 0.25rem' }}>

        {/* ── Member Status Cards ── */}
        <SectionShell title="Members" subtitle="Current enrollment status counts.">
          <div className="portal-grid-metrics">
            <StatCard
              value={fmtNumber(data.memberStatus.enrolled)}
              label="Total enrolled"
              hint="All members enrolled in a program."
              accent={ACCENT}
            />
            <StatCard
              value={fmtNumber(data.memberStatus.active)}
              label="Active"
              hint="Currently training."
              accent={SUCCESS}
            />
            <StatCard
              value={fmtNumber(data.memberStatus.placed)}
              label="Placed"
              hint="Placed in employment."
              accent={ACCENT}
            />
            <StatCard
              value={fmtNumber(data.memberStatus.inactive)}
              label="Inactive"
              hint="Not currently training."
              accent={DANGER}
            />
          </div>
        </SectionShell>

        {/* ── Enrollment Trend + Status Pie ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: '1.75rem' }}>
          <SectionShell title="Enrollment trend" subtitle="New enrollments per month (last 6 months).">
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={data.enrollmentTrend}>
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 13, fill: MUTED }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 13, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface-container)',
                      border: '1px solid var(--outline-variant)',
                      borderRadius: '0.5rem',
                      color: 'var(--color-on-surface)',
                    }}
                  />
                  <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionShell>

          <SectionShell title="Status breakdown" subtitle="Share of members by current status.">
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    paddingAngle={4}
                    stroke="none"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value: string) => (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface)' }}>{value}</span>
                    )}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface-container)',
                      border: '1px solid var(--outline-variant)',
                      borderRadius: '0.5rem',
                      color: 'var(--color-on-surface)',
                    }}
                    formatter={(value, name) => [fmtNumber(value as number), String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </SectionShell>
        </div>

        {/* ── Training Progress ── */}
        <SectionShell title="Training progress" subtitle="Average completion percentage by program (active members only).">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.programProgress.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No active members with program progress yet.</p>
            ) : (
              data.programProgress.map((p) => (
                <div key={p.programSlug}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                      {programDisplayTitle(p.programSlug)}
                    </span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                      {p.avgPercent}%
                    </span>
                  </div>
                  <div style={{ height: '0.6rem', borderRadius: '999px', background: 'var(--surface-container-highest)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, p.avgPercent))}%`,
                        height: '100%',
                        background: p.avgPercent >= 80 ? SUCCESS : p.avgPercent >= 50 ? WARNING : DANGER,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: MUTED, marginTop: '0.35rem' }}>
                    {fmtNumber(p.activeMembers)} active members
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionShell>

        {/* ── Placement Rate + Drop-off ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1.75rem' }}>
          <SectionShell title="Placement rate" subtitle="Placed members vs. members who completed training.">
            <div className="portal-grid-metrics">
              <StatCard
                value={`${data.placementRate.rate}%`}
                label="Placement rate"
                hint={`${fmtNumber(data.placementRate.placed)} placed / ${fmtNumber(data.placementRate.placed + data.placementRate.completedTraining)} total`}
                accent={data.placementRate.rate >= 50 ? SUCCESS : WARNING}
              />
              <StatCard
                value={fmtNumber(data.placementRate.placed)}
                label="Placed"
                hint="Members placed in employment."
              />
              <StatCard
                value={fmtNumber(data.placementRate.completedTraining)}
                label="Completed training"
                hint="Finished program, not yet placed."
              />
            </div>
          </SectionShell>

          <SectionShell title="Drop-off" subtitle="Members who started training but went inactive.">
            <div className="portal-grid-metrics">
              <StatCard
                value={fmtNumber(data.dropOffCount)}
                label="Dropped off"
                hint="Members flagged as stale training."
                accent={data.dropOffCount > 0 ? DANGER : SUCCESS}
              />
              <StatCard
                value={
                  data.memberStatus.enrolled > 0
                    ? `${Math.round((data.dropOffCount / data.memberStatus.enrolled) * 100)}%`
                    : '—'
                }
                label="Drop-off rate"
                hint="Share of all enrolled members."
              />
            </div>
          </SectionShell>
        </div>

        {/* ── Counselor Load ── */}
        <SectionShell title="Counselor load" subtitle="Active members per counselor and unassigned count.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.counselorLoad.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No counselor assignments yet.</p>
            ) : (
              <>
                {data.counselorLoad.map((c) => (
                  <div key={c.counselorName}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                        {c.counselorName}
                      </span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNumber(c.memberCount)} members
                      </span>
                    </div>
                    <div style={{ height: '0.6rem', borderRadius: '999px', background: 'var(--surface-container-highest)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, (c.memberCount / Math.max(1, data.counselorLoad[0]?.memberCount ?? 1)) * 100))}%`,
                          height: '100%',
                          background: c.memberCount > 20 ? DANGER : c.memberCount > 10 ? WARNING : SUCCESS,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    background: 'var(--surface-container)',
                    borderRadius: '0.5rem',
                    marginTop: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                    Unassigned active members
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: data.unassignedCount > 0 ? WARNING : SUCCESS }}>
                    {fmtNumber(data.unassignedCount)}
                  </span>
                </div>
              </>
            )}
          </div>
        </SectionShell>
      </div>
    </PortalPageFrame>
  );
}
