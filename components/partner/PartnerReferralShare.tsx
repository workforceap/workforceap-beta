'use client';

import { useRef } from 'react';
import { CardHead } from '@/components/portal/kit';
import CopyReferralLink from '@/components/partner/CopyReferralLink';
import styles from './PartnerReferralShare.module.css';

/** Existing attribution, brought into the default journey; copying never sends. */
export default function PartnerReferralShare({
  url,
  referralCode,
  landingUrl,
  shareToolsHref,
}: {
  url: string;
  referralCode: string;
  /** Partner-branded `/join/<code>` page (lib/partner/shareLinks.ts). */
  landingUrl?: string;
  /** Where the channel links and Apply button snippet live. */
  shareToolsHref?: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <section className={`wa-kit-card ${styles.panel}`} aria-label="Share your referral link">
      <header className={styles.intro}>
        <CardHead title="Share your referral link" />
        <p>Use this link to connect applications to your organization.</p>
      </header>
      <CopyReferralLink url={url} onCopyError={() => { if (details.current) details.current.open = true; }} />
      <details ref={details} className={styles.details}>
        <summary className="wa-kit-focus">View link and referral code</summary>
        <a href={url} className={`wa-kit-focus ${styles.link}`}>{url}</a>
        <p className={styles.code}>Referral code: {referralCode}</p>
        {landingUrl ? (
          <p className={styles.code}>
            Landing page: <a href={landingUrl} className="wa-kit-focus">{landingUrl}</a>
          </p>
        ) : null}
      </details>
      {shareToolsHref ? (
        <a href={shareToolsHref} className={`wa-kit-focus ${styles.tools}`}>
          Landing page, channel links and Apply button
        </a>
      ) : null}
    </section>
  );
}
