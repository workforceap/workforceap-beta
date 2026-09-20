import type { ReactNode } from 'react';

export interface MemberTab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface AppShellMemberProps {
  brand?: ReactNode;
  /** Right side of the top bar (streak, points, avatar). */
  topRight?: ReactNode;
  tabs: MemberTab[];
  activeId: string;
  /** Hrefs keyed by tab id (used as anchors; presentational). */
  hrefs?: Record<string, string>;
  children: ReactNode;
}

/**
 * Member shell: sticky top bar + horizontal-scroll nav on desktop, bottom tab
 * bar on mobile. Warm surface. Mockup: member-suite + mobile-proof phone 1.
 *
 * Wrap with <DesignSurface surface="warm"> at the layout level.
 */
export function AppShellMember({ brand, topRight, tabs, activeId, hrefs = {}, children }: AppShellMemberProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--wa-bg)', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'var(--wa-shell-header-bg)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--wa-border)',
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{brand}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{topRight}</div>
        </div>
        {/* desktop top-scroll nav (hidden on mobile; bottom bar takes over) */}
        <nav className="wa-hidden md:wa-flex" style={{ gap: 4, marginTop: 8, overflowX: 'auto' }}>
          {tabs.map((t) => {
            const on = t.id === activeId;
            return (
              <a
                key={t.id}
                href={hrefs[t.id]}
                className="wa-kit-focus"
                aria-current={on ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                  padding: '8px 14px',
                  fontSize: 14,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  borderBottom: `2px solid ${on ? 'var(--wa-accent)' : 'transparent'}`,
                  color: on ? 'var(--wa-accent)' : 'var(--wa-muted)',
                  transition: 'color 0.2s, border-color 0.2s',
                }}
              >
                {t.icon}
                {t.label}
              </a>
            );
          })}
        </nav>
      </header>

      <main style={{ flex: 1, padding: 16, maxWidth: 1100, width: '100%', margin: '0 auto', paddingBottom: 88 }}>{children}</main>

      {/* mobile bottom tab bar */}
      <nav
        className="md:wa-hidden"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--wa-surface)',
          borderTop: '1px solid var(--wa-border)',
          padding: '8px 8px',
          display: 'flex',
          justifyContent: 'space-around',
          zIndex: 30,
        }}
      >
        {tabs.map((t) => {
          const on = t.id === activeId;
          return (
            <a
              key={t.id}
              href={hrefs[t.id]}
              className="wa-kit-focus"
              aria-current={on ? 'page' : undefined}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 44, minHeight: 44, cursor: 'pointer', color: on ? 'var(--wa-accent)' : 'var(--wa-muted)', transition: 'color 0.2s' }}
            >
              <span style={{ fontSize: 16, display: 'flex' }}>{t.icon}</span>
              <span style={{ fontSize: 13, fontWeight: on ? 700 : 600 }}>{t.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
