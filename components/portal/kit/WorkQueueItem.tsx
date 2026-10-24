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
        className={urgent ? 'wa-kit-work-item wa-kit-work-item--urgent' : 'wa-kit-work-item'}
      >
        <div className="wa-kit-work-item__icon">{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HStack gap={2} align="center">
            <div className="wa-kit-work-item__title">{title}</div>
            {urgent ? <Badge label="Urgent" variant="error" /> : null}
          </HStack>
          {detail ? <div className="wa-kit-work-item__detail">{detail}</div> : null}
        </div>
        {action}
      </HStack>
    </Card>
  );
}
