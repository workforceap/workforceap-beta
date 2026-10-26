import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { DesignSurface, PageOpener, SectionHeader } from '@/components/portal/kit';
import { LinkTabs } from '@/components/portal/kit/LinkTabs';
import {
  REPORTING_RELATED_LINKS,
  REPORTING_TABS,
  REPORTING_TAB_COPY,
  reportingTabHref,
  reportingViewContext,
  reportingRelatedHref,
  type ReportingTabId,
} from '@/lib/admin/reportingHub';
import type { BoardOutcomesPeriod } from '@/lib/admin/boardOutcomes';

/**
 * Reporting hub — the one admin reporting page (dense).
 * Target route: /admin/reporting
 *
 * One `PageOpener` (the page's only h1), a tab row rendered as LINKS
 * (`.wa-kit-tabs` / `.wa-kit-tab`, `aria-current="page"` on the open tab) so
 * each request loads one tab's data, the tab's own `SectionHeader` with its
 * definition line, the tab content (an existing admin kit mounted with
 * `embedded`), and a "More reports" strip for the surfaces that keep their
 * own routes (print layout, quarterly builder, specialised dashboards).
 *
 * Data stays on the server; LinkTabs only manages horizontal visibility.
 */
export interface ReportingHubKitProps {
  activeTab: ReportingTabId;
  /** Builds each tab's href; defaults to the hub's own `?tab=` links. Showcase routes override it. */
  tabHref?: (tab: ReportingTabId) => string;
  /** Right-aligned opener action (e.g. an export shortcut). */
  action?: ReactNode;
  /** Hide the related-reports strip (showcase renders). */
  showRelated?: boolean;
  /** Retained outcomes period; other tabs state their own time basis. */
  period?: BoardOutcomesPeriod;
  superAdmin?: boolean;
  children: ReactNode;
}

/**
 * A titled block inside a tab (e.g. "Enrollment and outcomes" then
 * "Engagement" on the Overview). Card-title scale, caption at the 13px floor.
 */
export function ReportingSubsection({
  title,
  caption,
  id,
  children,
}: {
  title: string;
  caption?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="wa-mt-6" data-reporting-subsection={title}>
      <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', margin: 0 }}>{title}</h3>
      {caption ? (
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 14px' }}>{caption}</p>
      ) : (
        <div style={{ height: 14 }} aria-hidden />
      )}
      {children}
    </div>
  );
}

export function ReportingHubKit({
  activeTab,
  tabHref,
  action,
  showRelated = true,
  period = 'all-time',
  superAdmin = false,
  children,
}: ReportingHubKitProps) {
  const copy = REPORTING_TAB_COPY[activeTab];
  const context = reportingViewContext(activeTab, period, superAdmin);
  const hrefForTab = tabHref ?? ((tab: ReportingTabId) => reportingTabHref(tab, period === 'all-time' ? {} : { period }));
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener
        className="wa-mb-5"
        title="Reporting"
        meta="Review the evidence, understand each measure and prepare the right report."
        action={action}
      />

      <LinkTabs label="Reporting views" activeKey={activeTab} className="wa-mb-5" data-testid="reporting-hub-tabs">
        {REPORTING_TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={hrefForTab(tab.id)}
              className="wa-kit-tab"
              aria-current={selected ? 'page' : undefined}
              data-reporting-tab={tab.id}
            >
              {tab.label}
            </Link>
          );
        })}
      </LinkTabs>

      <section aria-label={copy.title} data-reporting-section={activeTab}>
        <SectionHeader title={copy.title} goal={copy.lede} data-testid="reporting-hub-section-header" />
        <aside aria-label="Report context" className="wa-mb-5" data-testid="reporting-context">
          <p className="wa-kit-meta wa-mb-2"><strong>{context.periodLabel}</strong> · {context.scopeLabel}</p>
          <p className="wa-kit-meta" style={{ color: 'var(--wa-muted)' }}>{context.definition}</p>
        </aside>
        {children}
      </section>

      {showRelated ? (
        <section aria-labelledby="admin-reporting-related-title" className="wa-mt-6">
          <h3
            id="admin-reporting-related-title"
            className="wa-text-xs wa-font-bold wa-uppercase"
            style={{ letterSpacing: '0.1em', color: 'var(--wa-muted)', marginBottom: 12 }}
          >
            More reports
          </h3>
          <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3">
            {REPORTING_RELATED_LINKS.map((item) => (
              <Link
                key={item.href}
                href={reportingRelatedHref(item.href, period)}
                className="wa-kit-card wa-kit-card--sm wa-kit-card--hover wa-kit-focus"
                style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: 'var(--wa-text)' }}>{item.label}</span>
                  <span className="wa-kit-meta" style={{ display: 'block', marginTop: 2 }}>{item.description}</span>
                </span>
                <ArrowUpRight size={14} aria-hidden style={{ flexShrink: 0, color: 'var(--wa-muted)', marginTop: 3 }} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </DesignSurface>
  );
}
