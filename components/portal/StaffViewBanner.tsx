'use client';

import { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';

const COOKIE_NAME = 'wa_staff_view_banner_dismissed';

/**
 * Subtle banner shown to super-admins / admins when they're viewing a
 * member-side dashboard page. Reminds them that empty sections may just
 * mean their staff account isn't enrolled — not a bug.
 *
 * Dismissible per session via a cookie: `wa_staff_view_banner_dismissed`.
 * The cookie is session-scoped (no Max-Age) so the banner returns the
 * next time the staff member opens a fresh browser session.
 *
 * Rendered conditionally by the page (only when the viewer is staff),
 * so this component doesn't re-check the role itself. Shown on the kit
 * member home (WAP-194) and My Program; painted from `--wa-*` tokens (info
 * tone) with lucide icons and a 44px dismiss target.
 */
export default function StaffViewBanner({ page }: { page?: string }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    const cookies = typeof document !== 'undefined' ? document.cookie : '';
    const isDismissed = cookies.split(';').some((c) => c.trim().startsWith(`${COOKIE_NAME}=1`));
    setDismissed(isDismissed);
  }, []);

  if (dismissed !== false) return null;

  const handleDismiss = () => {
    if (typeof document !== 'undefined') {
      document.cookie = `${COOKIE_NAME}=1; Path=/; SameSite=Lax`;
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-label="Staff view notice"
      data-staff-view-banner={page ?? ''}
      className="wa-kit-tone--info"
      style={{
        background: 'var(--wa-kit-tone-soft)',
        border: '1px solid color-mix(in srgb, var(--wa-kit-tone) 25%, transparent)',
        borderRadius: 'var(--wa-radius-sm)',
        padding: '4px 4px 4px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 'var(--wa-type-meta)',
        color: 'var(--wa-text)',
      }}
    >
      <Settings size={16} aria-hidden style={{ color: 'var(--wa-info-dark)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        You&apos;re viewing this as a super-admin. Some sections may be empty if you&apos;re not enrolled in a program.
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss staff-view notice"
        className="wa-kit-focus"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--wa-muted)',
          cursor: 'pointer',
          width: 44,
          height: 44,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--wa-radius-sm)',
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
