'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
  className?: string;
  /** Kit-native pill for portal surfaces. Default stays the marketing Button. */
  chrome?: 'default' | 'kit';
}

const COPIED_MESSAGE_DURATION_MS = 2000;

/**
 * Reusable Web Share API button.
 *
 * Usage examples:
 * - Mobile/native share sheet: `<ShareButton url={referralUrl} title="Share WorkforceAP" text="Career training at no cost to members" />`
 * - Desktop/copy fallback: browsers without `navigator.share` copy `url` and briefly show "Link copied!".
 */
export function ShareButton({ url, title, text, className = '', chrome = 'default' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shareData = useMemo<ShareData>(() => {
    const payload: ShareData = { url, title };
    if (text) payload.text = text;
    return payload;
  }, [text, title, url]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const resetIndicatorSoon = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, COPIED_MESSAGE_DURATION_MS);
  };

  const copyUrlToClipboard = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopyFailed(true);
      setCopied(false);
      resetIndicatorSoon();
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    } finally {
      resetIndicatorSoon();
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancellations and platform share errors both fall back to a copied link.
      }
    }

    await copyUrlToClipboard();
  };

  const statusLabel = copyFailed ? 'Copy failed' : copied ? 'Link copied!' : 'Share';

  if (chrome === 'kit') {
    const Icon = copied ? Check : Share2;
    return (
      <button
        type="button"
        onClick={handleShare}
        aria-label={`Share ${title}`}
        className={[
          'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none wa-flex wa-items-center wa-gap-1',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          minHeight: 44,
          padding: '10px 12px',
          background: 'transparent',
          color: 'var(--wa-accent)',
          border: '1px solid var(--wa-border)',
          fontWeight: 600,
          fontSize: 13,
          borderRadius: 999,
          cursor: 'pointer',
        }}
      >
        <Icon size={14} aria-hidden="true" />
        <span aria-live="polite">{statusLabel}</span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      radius="lg"
      className={['share-button', className].filter(Boolean).join(' ')}
      onClick={handleShare}
      aria-label={`Share ${title}`}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.125rem' }}>
        {copied ? 'check' : 'share'}
      </span>
      <span aria-live="polite">{statusLabel}</span>
    </Button>
  );
}

