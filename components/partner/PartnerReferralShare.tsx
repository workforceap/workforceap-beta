'use client';

import { useState } from 'react';
import { CardHead } from '@/components/portal/kit';
import { useAnnounce } from '@/components/portal/kit/hooks/useAnnounce';
import { Button } from '@astryxdesign/core/Button';
import { Check, Copy } from 'lucide-react';
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
  const [state, setState] = useState<'idle' | 'copied' | 'err'>('idle');
  const announce = useAnnounce();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      announce('Referral link copied.');
    } catch {
      setState('err');
      announce('Copy failed. Select and copy your referral link manually.', 'assertive');
    }
  };

  return (
    <section className={`wa-kit-card ${styles.panel}`} aria-label="Share your referral link">
      <header className={styles.intro}>
        <CardHead title="Share your referral link" />
        <p>Use this link to connect applications to your organization.</p>
      </header>
      <div className={styles.inlineShare}>
        <input
          type="text"
          readOnly
          value={url}
          aria-label="Referral link"
          className={`wa-kit-focus ${styles.urlInput}`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="primary"
          label={state === 'copied' ? 'Copied' : 'Copy'}
          icon={state === 'copied' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          onClick={() => void copy()}
        />
      </div>
      <p className={styles.code}>Referral code: {referralCode}</p>
      {landingUrl ? (
        <p className={styles.code}>
          Landing page: <a href={landingUrl} className="wa-kit-focus">{landingUrl}</a>
        </p>
      ) : null}
      {state === 'err' ? (
        <p className={styles.code} role="alert">
          Copy failed. Select the link above and copy it manually.
        </p>
      ) : null}
      {shareToolsHref ? (
        <a href={shareToolsHref} className={`wa-kit-focus ${styles.tools}`}>
          Landing page, channel links and Apply button
        </a>
      ) : null}
    </section>
  );
}
