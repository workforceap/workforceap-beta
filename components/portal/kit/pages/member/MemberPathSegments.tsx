import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import styles from './memberPages.module.css';

/**
 * Segmented path (C1 certification path): one bar per step with a numbered
 * label underneath. Built from the shared `.wa-kit-segments` classes. Past
 * eight steps the labels stay in the accessibility tree but leave the page, so
 * a long course list reads as a quiet bar instead of a wall of captions.
 */

export type PathSegmentState = 'done' | 'current' | 'todo';

export interface PathSegment {
  key: string;
  name: string;
  state: PathSegmentState;
  /** 0 to 100. Only used for the current step, and only when the caller knows it. */
  pct?: number;
  /** Optional third line (a date or short note) under the name. */
  detail?: string;
}

const COMPACT_AFTER = 8;

export function MemberPathSegments({ segments, label }: { segments: PathSegment[]; label: string }) {
  if (segments.length === 0) return null;
  const compact = segments.length > COMPACT_AFTER;
  return (
    <ol
      className={`wa-kit-segments${compact ? ` ${styles.segmentsCompact}` : ''}`}
      style={{ '--wa-segments': segments.length } as CSSProperties}
      aria-label={label}
    >
      {segments.map((segment, index) => {
        const fill = segment.state === 'done' ? 100 : segment.state === 'current' ? Math.max(0, Math.min(100, segment.pct ?? 0)) : 0;
        return (
          <li key={segment.key} className={`wa-kit-segment wa-kit-segment--${segment.state}`}>
            <span className="wa-kit-segment__bar"><i style={{ width: `${fill}%` }} /></span>
            <span className={`wa-kit-segment__label${compact ? ` ${styles.srOnly}` : ''}`}>
              <b className="wa-kit-segment__state">
                {segment.state === 'done' ? <Check size={13} aria-label="Done" /> : null}
                {index + 1}
                {segment.state === 'current' ? <span> In progress</span> : null}
              </b>
              <span className="wa-kit-segment__name">{segment.name}</span>
              {segment.detail ? <span className={styles.segmentDetail}>{segment.detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
