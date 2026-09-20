'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useFocusTrap } from './hooks/useFocusTrap';

export interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface AppShellSidebarProps {
  brand: ReactNode;
  groups: NavGroup[];
  activeId: string;
  onNavigate?: (id: string) => void;
  footer?: ReactNode;
  /** Sticky top bar content (title, actions). */
  topbar?: ReactNode;
  children: ReactNode;
}

/**
 * Staff/admin shell: dark sidebar, collapses to a hamburger drawer below lg.
 * Ported from the responsive admin-full mockup.
 * Mockup: workforceap-admin-full.html.
 */
export function AppShellSidebar({ brand, groups, activeId, onNavigate, footer, topbar, children }: AppShellSidebarProps) {
  const [open, setOpen] = useState(false);
  // Mobile drawer only: trap Tab inside the open drawer, Escape closes it,
  // focus returns to the hamburger. `open` is always false on desktop.
  const drawerRef = useFocusTrap<HTMLElement>(open, { onEscape: () => setOpen(false) });
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {open ? (
        <div onClick={() => setOpen(false)} className="lg:wa-hidden" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      ) : null}

      <aside
        ref={drawerRef}
        className={`${open ? 'wa-translate-x-0' : '-wa-translate-x-full'} lg:wa-translate-x-0 wa-transition-transform wa-duration-200`}
        style={{
          width: 256,
          background: 'var(--wa-sidebar-bg)',
          color: 'var(--wa-sidebar-text)',
          position: 'fixed',
          height: '100vh',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--wa-sidebar-border)', flexShrink: 0 }}>{brand}</div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', fontSize: 13 }}>
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 12 }}>
              <div style={{ padding: '0 10px', fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wa-sidebar-label)', marginBottom: 4 }}>{g.label}</div>
              {g.items.map((it) => {
                const on = it.id === activeId;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => { onNavigate?.(it.id); setOpen(false); }}
                    className="wa-kit-focus wa-kit-focus--on-dark"
                    aria-current={on ? 'page' : undefined}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: 600,
                      marginBottom: 2,
                      background: on ? 'var(--wa-accent)' : 'transparent',
                      color: on ? 'var(--wa-on-accent)' : 'var(--wa-sidebar-muted)',
                      transition: 'background-color 0.2s, color 0.2s',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      {it.icon}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                    </span>
                    {it.badge != null ? (
                      <span style={{ padding: '1px 7px', fontSize: 13, fontWeight: 700, borderRadius: 999, background: 'var(--wa-accent)', color: 'var(--wa-on-accent)' }}>{it.badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        {footer ? <div style={{ padding: '12px 16px', borderTop: '1px solid var(--wa-sidebar-border)', flexShrink: 0 }}>{footer}</div> : null}
      </aside>

      <div className="lg:wa-ml-64" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--wa-shell-header-bg)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--wa-border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => setOpen(true)} className="lg:wa-hidden wa-kit-focus wa-flex" aria-label="Open menu" style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--wa-border)', background: 'transparent', color: 'var(--wa-text)', cursor: 'pointer', flexShrink: 0, alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s, border-color 0.2s' }}><Menu size={20} aria-hidden="true" /></button>
          <div style={{ flex: 1, minWidth: 0 }}>{topbar}</div>
        </header>
        <main style={{ flex: 1, padding: 16 }}>{children}</main>
      </div>
    </div>
  );
}
