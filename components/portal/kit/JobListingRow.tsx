import type { ReactNode } from 'react';
import { Briefcase } from 'lucide-react';
import NextLink from 'next/link';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { StatusTag } from './StatusTag';

interface JobListingRowProps extends KitBaseProps<HTMLAnchorElement>, KitDataAttrs {
  href: string;
  title: string;
  /** Company · location · type · salary (already joined). */
  meta: string;
  match?: string;
  applied?: boolean;
  /** Inner content of the 40×40 tile. Defaults to a briefcase. */
  icon?: ReactNode;
  trailing?: ReactNode;
  /** First row in a stacked card — no top rule. */
  first?: boolean;
}

/**
 * Open-role listing row — kit-native `--wa-*` stack row (not `.job-card` mosaic).
 * Used by the member job board proof and the live `/dashboard/jobs` listing.
 */
export function JobListingRow({
  href,
  title,
  meta,
  match,
  applied,
  icon,
  trailing,
  first = false,
  className,
  style,
  ref,
  ...rest
}: JobListingRowProps) {
  return (
    <NextLink
      href={href}
      ref={ref}
      className={cx(
        'wa-job-listing-row wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none',
        className,
      )}
      style={{
        minHeight: 72,
        padding: '14px 18px',
        borderTop: first ? 'none' : '1px solid var(--wa-border)',
        textDecoration: 'none',
        color: 'var(--wa-text)',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'var(--wa-surface-2)',
          color: 'var(--wa-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {icon ?? <Briefcase size={18} />}
      </span>
      <span className="wa-job-listing-row__body" style={{ minWidth: 0, flex: 1 }}>
        <h3
          className="wa-job-listing-row__title"
          style={{
            fontWeight: 700,
            fontSize: 'var(--wa-type-body)',
            margin: 0,
          }}
        >
          {title}
        </h3>
        <p
          className="wa-kit-meta"
          style={{
            margin: '4px 0 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meta}
        </p>
      </span>
      {applied || match || trailing ? (
        <span className="wa-job-listing-row__actions">
          {applied ? (
            <StatusTag tone="ok" style={{ flexShrink: 0 }}>
              Applied
            </StatusTag>
          ) : null}
          {match ? (
            <span
              className="wa-kit-meta"
              style={{
                fontWeight: 600,
                color: 'var(--wa-text)',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {match}
            </span>
          ) : null}
          {trailing}
        </span>
      ) : null}
    </NextLink>
  );
}

/** Loading placeholder that matches JobListingRow geometry. */
export function JobListingRowSkeleton({ first = false }: { first?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        minHeight: 72,
        padding: '14px 18px',
        borderTop: first ? 'none' : '1px solid var(--wa-border)',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'var(--wa-track)',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            height: 14,
            width: '42%',
            maxWidth: 220,
            background: 'var(--wa-track)',
            borderRadius: 999,
          }}
        />
        <div
          style={{
            height: 12,
            width: '58%',
            maxWidth: 280,
            background: 'var(--wa-track)',
            borderRadius: 999,
            marginTop: 8,
          }}
        />
      </div>
    </div>
  );
}
