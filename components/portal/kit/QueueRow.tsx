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

const TONE_BG: Record<QueueTone, string> = {
  red: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
  yellow: 'var(--wa-gold-soft)',
  blue: 'var(--wa-info-soft)',
};

/**
 * Triage / attention row — Astryx `Card` + `StatusDot` + `Token`.
 * red = urgent today, yellow = watch, blue = celebrate.
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
          className="wa-kit-queue-row"
          gap={3}
          style={{ background: TONE_BG[tone], borderRadius: 12, padding: '10px 12px' }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: tone === 'red' ? 'var(--color-accent)' : tone === 'yellow' ? 'var(--wa-gold)' : 'var(--wa-info)',
              color: 'var(--wa-on-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div className="wa-kit-queue-row__copy" style={{ flex: 1, minWidth: 0 }}>
            <HStack gap={2} align="center">
              <StatusDot variant={TONE_DOT[tone]} label={title} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
            </HStack>
            {meta ? <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>{meta}</div> : null}
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
