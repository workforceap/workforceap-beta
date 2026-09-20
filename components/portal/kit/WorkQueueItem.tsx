'use client';

import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { HStack } from '@astryxdesign/core/Layout';

interface WorkQueueItemProps {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
  /** Crimson-tinted urgent treatment. */
  urgent?: boolean;
}

/**
 * "What needs you today" row — Astryx `Card` + optional urgent `Badge`.
 * Admin/employer command surfaces.
 */
export function WorkQueueItem({ icon, title, detail, action, urgent = false }: WorkQueueItemProps) {
  return (
    <Card>
      <HStack
        gap={3}
        align="center"
        style={{
          background: urgent ? 'var(--wa-accent-soft)' : 'var(--wa-surface)',
          borderRadius: 12,
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--wa-on-accent)',
            background: urgent ? 'var(--wa-accent)' : 'var(--wa-info)',
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HStack gap={2} align="center">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
            {urgent ? <Badge label="Urgent" variant="error" /> : null}
          </HStack>
          {detail ? <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>{detail}</div> : null}
        </div>
        {action}
      </HStack>
    </Card>
  );
}
