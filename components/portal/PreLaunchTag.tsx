'use client';

import { useState } from 'react';
import styles from './PreLaunchTag.module.css';

interface PreLaunchTagProps {
  /** Compact tag for nav/header use */
  compact?: boolean;
  /** Show the full explanation card */
  showCard?: boolean;
  onToggle?: (show: boolean) => void;
}

/**
 * Public-launch trust tag for apply heroes.
 *
 * Was "Pilot Program" (pre-launch). Go-live copy uses the Locked
 * member-safe cost language from `docs/PRODUCT_STAKES.md` — no-cost to
 * members, funded by grants — and makes no follow-up time promise (the
 * confirmation page names the review and the email, never a wait).
 */
export default function PreLaunchTag({ compact, showCard: controlledShow, onToggle }: PreLaunchTagProps) {
  const [open, setOpen] = useState(false);
  const showCard = controlledShow ?? open;

  const handleToggle = () => {
    const next = !showCard;
    setOpen(next);
    onToggle?.(next);
  };

  if (compact) {
    return (
      <span className={styles['compact-tag']} title="No cost to members — funded by grants and partnerships">
        <span className={styles['dot']} aria-hidden="true" />
        No cost to members
      </span>
    );
  }

  return (
    <div className={styles['container']}>
      <button
        type="button"
        className={styles['tag-btn']}
        onClick={handleToggle}
        aria-expanded={showCard}
        aria-controls="prelaunch-explanation"
      >
        <span className={styles['dot']} aria-hidden="true" />
        <span className={styles['tag-text']}>No cost to members</span>
        <span className={styles['tag-hint']}>{showCard ? '▲' : '▼'}</span>
      </button>

      {showCard && (
        <div id="prelaunch-explanation" className={styles['card']} role="region" aria-label="Program cost details">
          <p className={styles['card-title']}>What “no cost to members” means</p>
          <p className={styles['card-body']}>
            Qualifying members do not pay tuition. Programs are funded by grants
            and community partnerships — not by charging members.
          </p>
          <p className={styles['card-body']}>
            A real team reviews each application. Follow-up timing is confirmed
            on the application confirmation screen so we only promise what
            operations can support.
          </p>
          <p className={styles['card-footer']}>
            Have questions? <a href="mailto:contact@workforceap.org">Email us</a> or
            call <a href="tel:+15127771808">(512) 777-1808</a>.
          </p>
        </div>
      )}
    </div>
  );
}
