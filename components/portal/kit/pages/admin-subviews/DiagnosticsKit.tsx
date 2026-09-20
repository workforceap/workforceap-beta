import { Activity, BellRing, Database, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import { DesignSurface, PageOpener, type KitTone } from '@/components/portal/kit';

/**
 * Live system diagnostics — at-a-glance status tiles.
 * Mockup: workforceap-admin-full.html "diagnostics" view.
 * Target route: /admin/diagnostics (default kit view).
 *
 * Server-friendly module (no 'use client'): every status is derived in the
 * page loader from REAL measurements (DB ping + recent WorkflowDiagnostic
 * counts) and lands here as plain data. Tiles never fabricate a value — an
 * unmeasured subsystem surfaces "—" with a muted/info tone.
 */
export type DiagnosticTone = KitTone;

export interface DiagnosticTile {
  /** Subsystem name, e.g. "Database". */
  name: string;
  /** Which built-in icon to render (kept as a string so no component ref
   *  crosses a server→client boundary). */
  iconKey: 'app' | 'database' | 'email' | 'integrations' | 'discord' | 'push';
  /** Short human status, e.g. "Healthy", "Degraded", "—". */
  status: string;
  /** Semantic tone driving the tile color. */
  tone: DiagnosticTone;
}

export interface DiagnosticsKitProps {
  tiles: DiagnosticTile[];
  /** Honest explainer/note rendered below the tile grid. */
  note: string;
  /** Optional caption (e.g. measurement window) shown under the note. */
  noteCaption?: string;
  /** Extra measured sections rendered between the tiles and the note (e.g. failed sends). */
  children?: ReactNode;
}

const ICONS: Record<DiagnosticTile['iconKey'], ReactNode> = {
  app: <Activity size={18} aria-hidden />,
  database: <Database size={18} aria-hidden />,
  email: <Mail size={18} aria-hidden />,
  integrations: <RefreshCw size={18} aria-hidden />,
  discord: <MessageSquare size={18} aria-hidden />,
  push: <BellRing size={18} aria-hidden />,
};

/** Tone → icon swatch (soft bg + solid fg) using kit tokens only. */
const TONE_SWATCH: Record<DiagnosticTone, { bg: string; fg: string }> = {
  ok: { bg: 'var(--wa-success-soft, rgba(74,155,79,0.12))', fg: 'var(--wa-success)' },
  warn: { bg: 'var(--wa-gold-soft, rgba(255,187,0,0.14))', fg: 'var(--wa-gold)' },
  alert: { bg: 'var(--wa-accent-soft)', fg: 'var(--wa-accent)' },
  danger: { bg: 'var(--wa-danger-soft)', fg: 'var(--wa-danger)' },
  info: { bg: 'var(--wa-info-soft, rgba(43,123,185,0.12))', fg: 'var(--wa-info)' },
  muted: { bg: 'var(--wa-surface-2, rgba(0,0,0,0.05))', fg: 'var(--wa-muted)' },
};

export function DiagnosticsKit({ tiles, note, noteCaption, children }: DiagnosticsKitProps) {
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title="Diagnostics" lede="Live system diagnostics" kicker="System" />

      <div
        className="wa-mb-5"
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        {tiles.map((tile) => {
          const swatch = TONE_SWATCH[tile.tone];
          return (
            <Card key={tile.name} padding={3} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--wa-radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: swatch.bg,
                  color: swatch.fg,
                }}
              >
                {ICONS[tile.iconKey]}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--wa-muted)',
                  }}
                >
                  {tile.name}
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 14,
                    color: swatch.fg,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tile.status}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {children}

      <Card>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--wa-text)', margin: 0 }}>{note}</p>
        {noteCaption ? (
          <p
            style={{
              fontSize: 13,
              color: 'var(--wa-muted)',
              margin: '8px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <Token label="Live" size="sm" color="gray" />
            {noteCaption}
          </p>
        ) : null}
      </Card>
    </DesignSurface>
  );
}
