'use client';

import { useId, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Check, Copy } from 'lucide-react';
import { CardHead } from '@/components/portal/kit';
import { useAnnounce } from '@/components/portal/kit/hooks/useAnnounce';
import type { PartnerShareChannelId, PartnerShareLinks } from '@/lib/partner/shareLinks';
import styles from './PartnerShareToolkit.module.css';

type CopyState = 'idle' | 'copied' | 'err';

/** One copy action; a clipboard failure stays visible (KIT_GUIDE partner sharing). */
function CopyButton({ value, label, copiedLabel }: {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const [state, setState] = useState<CopyState>('idle');
  const announce = useAnnounce();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      announce(`${copiedLabel}.`);
    } catch {
      setState('err');
      announce('Copy failed. Select the text and copy it manually.', 'assertive');
    }
  };
  return (
    <span>
      <Button
        size="sm"
        label={state === 'copied' ? copiedLabel : label}
        icon={state === 'copied' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        onClick={() => void copy()}
      />
      {state === 'err' ? <span className={styles.error} role="alert"> Copy failed — select and copy it manually.</span> : null}
    </span>
  );
}

/**
 * Partner share tools (guide page): landing-page link, per-channel links with
 * UTM tags, a copyable "Apply" button snippet, and — when supplied — signup
 * counts per channel (counts only, no member data). Copying never sends.
 *
 * No QR code: the repo has no QR dependency and the CSP (`img-src`) blocks
 * third-party QR image services.
 */
export default function PartnerShareToolkit({
  links,
  channelCounts,
}: {
  links: PartnerShareLinks;
  /** Signups per channel from `apply_signup_completed` metadata; null hides the column. */
  channelCounts?: Record<PartnerShareChannelId | 'other', number> | null;
}) {
  const snippetId = useId();
  return (
    <section id="share-tools" className={`wa-kit-card ${styles.panel}`} aria-label="Share tools">
      <header className={styles.intro}>
        <CardHead title="Share tools" />
        <p>
          Your landing page introduces WorkforceAP under your name and sends applicants to Apply with your
          referral code. Channel links add tracking tags so you can see which channel brings signups.
        </p>
      </header>

      <div>
        <h3 className={styles.sectionTitle}>Your landing page</h3>
        <ul className={styles.rows}>
          <li className={styles.row}>
            <span className={styles.rowLabel}>Landing page</span>
            <a className={`wa-kit-focus ${styles.url}`} href={links.landingUrl}>{links.landingUrl}</a>
            <span className={styles.count} aria-hidden />
            <CopyButton value={links.landingUrl} label="Copy link" copiedLabel="Link copied" />
          </li>
        </ul>
      </div>

      <div>
        <h3 className={styles.sectionTitle}>Links by channel</h3>
        <ul className={styles.rows}>
          {links.channels.map((channel) => (
            <li className={styles.row} key={channel.id} data-channel={channel.id}>
              <span className={styles.rowLabel}>{channel.label}</span>
              <span className={styles.url}>{channel.url}</span>
              <span className={styles.count}>
                {channelCounts ? `${channelCounts[channel.id]} signup${channelCounts[channel.id] === 1 ? '' : 's'}` : null}
              </span>
              <CopyButton value={channel.url} label={`Copy ${channel.label} link`} copiedLabel="Link copied" />
            </li>
          ))}
        </ul>
        {channelCounts ? (
          <p className={styles.note} style={{ marginTop: '0.5rem' }}>
            Counts are signups from members you referred, by the channel tag on their visit
            ({channelCounts.other} with no channel tag or another source).
          </p>
        ) : null}
      </div>

      <div>
        <h3 className={styles.sectionTitle}>Apply button for your website</h3>
        <label htmlFor={`${snippetId}-snippet`} className={styles.note}>
          Paste this HTML where you want the button. It is a plain link — no script or embed.
        </label>
        <textarea
          id={`${snippetId}-snippet`}
          className={`wa-kit-focus ${styles.snippet}`}
          readOnly
          value={links.applyButtonHtml}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className={styles.snippetActions}>
          <CopyButton value={links.applyButtonHtml} label="Copy button HTML" copiedLabel="HTML copied" />
          <span className={styles.note}>Links to {links.applyButtonHref}</span>
        </div>
      </div>
    </section>
  );
}
