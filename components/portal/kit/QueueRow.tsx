'use client';

import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { HStack } from '@astryxdesign/core/Layout';

export type QueueTone = 'red' | 'yellow' | 'blue';

interface QueueRowProps {
  tone: QueueTone;
  icon?: ReactNode;
  title: string;
  meta?: string;
  /** Short uppercase flag shown before the action (hidden on small screens). */
  flag?: string;
  action?: ReactNode;
  onClick?: () => void;
}

const TONE_DOT: Record<QueueTone, 'error' | 'warning' | 'accent'> = {
  red: 'error',
  yellow: 'warning',
  blue: 'accent',
};

const TONE_TOKEN: Record<QueueTone, 'pink' | 'yellow' | 'blue'> = {
  red: 'pink',
  yellow: 'yellow',
  blue: 'blue',
};

/**
 * Triage / attention row — Astryx `Card` + `StatusDot` + `Token`.
 * red = urgent today, yellow = watch, blue = celebrate. Calm row: surface +
 * hairline, tone shown by a 3px edge and a soft icon tile (`.wa-kit-queue-row--*`).
 */
export function QueueRow({ tone, icon, title, meta, flag, action, onClick }: QueueRowProps) {
  return (
    <div
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={onClick ? 'wa-kit-focus' : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <Card>
        <HStack
          className={`wa-kit-queue-row wa-kit-queue-row--${tone}`}
          gap={3}
        >
          <div className="wa-kit-queue-row__icon">{icon}</div>
          <div className="wa-kit-queue-row__copy" style={{ flex: 1, minWidth: 0 }}>
            <HStack gap={2} align="center">
              <StatusDot variant={TONE_DOT[tone]} label={title} />
              <div className="wa-kit-queue-row__title">{title}</div>
            </HStack>
            {meta ? <div className="wa-kit-queue-row__meta">{meta}</div> : null}
          </div>
          {flag ? (
            <span className="wa-hidden md:wa-inline">
              <Token label={flag} size="sm" color={TONE_TOKEN[tone]} />
            </span>
          ) : null}
          {action ? <div className="wa-kit-queue-row__action">{action}</div> : null}
        </HStack>
      </Card>
    </div>
  );
}
