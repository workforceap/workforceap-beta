'use client';

import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import { toneToTokenColor } from './astryxMap';
import type { KitTone } from './tokens';

export interface KanbanCardData {
  id: string;
  title: string;
  meta?: string;
}

export interface KanbanColumnData {
  label: string;
  count: number;
  tone?: KitTone;
  cards: KanbanCardData[];
}

/**
 * Employer candidate pipeline — Astryx `Card` columns with `Token` counts.
 * Columns scroll horizontally on mobile.
 */
export function KanbanBoard({ columns }: { columns: KanbanColumnData[] }) {
  return (
    <div className="wa-overflow-x-auto">
      <div style={{ display: 'flex', gap: 12, minWidth: 'min-content' }}>
        {columns.map((col) => (
          <Card key={col.label}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{col.label}</span>
                <Token label={String(col.count)} size="sm" color={toneToTokenColor(col.tone ?? 'muted')} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.cards.map((c) => (
                  <Card key={c.id}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
                      {c.meta ? <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>{c.meta}</div> : null}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function KanbanColumnHeader({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700 }}>{children}</div>;
}
