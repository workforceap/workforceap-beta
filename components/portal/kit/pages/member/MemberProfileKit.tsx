'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IdCard } from 'lucide-react';
import { DesignSurface, FormField, Toggle, PageOpener } from '@/components/portal/kit';
import { MemberProfilePhotoEditor } from '@/components/portal/kit/MemberProfilePhotoEditor';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';
import LanguageToggle from '@/components/portal/LanguageToggle';
import PushNotificationsToggle from '@/components/portal/PushNotificationsToggle';
import DeleteAccountButton from '@/components/portal/DeleteAccountButton';

/**
 * Member Portal — profile (account details + notification prefs).
 * Live at `/dashboard/profile`; proof at `/dev/member/profile`.
 * Interactive (form fields + toggles) → 'use client'.
 * Surface: warm (member-facing).
 *
 * Real save mechanism (reuses the same endpoints the legacy
 * DashboardProfileForm + SettingsForm already POST to):
 *   - Account details  → PATCH /api/member/dashboard-profile
 *   - Notification prefs → PATCH /api/member/settings
 *
 * The `dashboard-profile` endpoint upserts the whole Profile row, so the
 * page passes through existing profile fields the kit form does not edit
 * (phone/address/linkedin/bio/…) via `accountPassthrough` to avoid wiping
 * them on save.
 */

interface ProfileBadge {
  label: string;
  bg: string;
  color: string;
}

/**
 * Notification preference. `field` ties the toggle to the real boolean column
 * persisted by PATCH /api/member/settings. When omitted (e.g. default demo
 * prefs), the toggle is local-only.
 */
interface NotificationPref {
  key: string;
  label: string;
  enabled: boolean;
  field?: 'notificationsUpdates' | 'notificationsReminders';
}

/**
 * Existing profile fields the kit form does NOT surface but which the
 * dashboard-profile upsert would otherwise overwrite. Passed through on save
 * so we never clobber data the member entered on the legacy form.
 */
export interface MemberProfileAccountPassthrough {
  phone?: string | null;
  address?: string | null;
  state?: string | null;
  zip?: string | null;
  referralSource?: string | null;
  linkedin?: string | null;
  bio?: string | null;
  hasEmploymentBarrier?: boolean;
  barrierTypes?: string[];
  employmentStatusAtEnroll?: string | null;
}

export interface MemberProfileKitProps {
  name?: string;
  initials?: string;
  headline?: string;
  badges?: ProfileBadge[];
  email?: string;
  location?: string;
  programInterest?: string;
  programOptions?: string[];
  notifications?: NotificationPref[];
  /**
   * Existing profile values to round-trip on save (see
   * MemberProfileAccountPassthrough). When provided alongside live data, the
   * "Save Changes" button persists to PATCH /api/member/dashboard-profile.
   */
  accountPassthrough?: MemberProfileAccountPassthrough;
  /**
   * When true, the Account Details save and notification toggles persist to the
   * real endpoints. When false (the default for the standalone demo), the form
   * stays local-only so the kit can be previewed without a backend.
   */
  live?: boolean;
  /** Signed URL for the member's profile photo, when one is on file. */
  photoUrl?: string | null;
}

const DEFAULT_BADGES: ProfileBadge[] = [];

const DEFAULT_PROGRAM_OPTIONS: string[] = [];

const DEFAULT_NOTIFICATIONS: NotificationPref[] = [];

export function MemberProfileKit({
  name = '',
  initials = '',
  headline = '',
  badges = DEFAULT_BADGES,
  email = '',
  location = '',
  programInterest = '',
  programOptions = DEFAULT_PROGRAM_OPTIONS,
  notifications = DEFAULT_NOTIFICATIONS,
  accountPassthrough,
  live = false,
  photoUrl = null,
}: MemberProfileKitProps) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPref[]>(notifications);

  // Account-details form state (only Full Name + Location are editable +
  // persisted; Email and Program Interest are read-only here).
  const [fullName, setFullName] = useState(name);
  const [loc, setLoc] = useState(location);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSaved, setAccountSaved] = useState(false);

  // Notification toggle state (per-key error/saving).
  const [savingPref, setSavingPref] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  // Move focus to save/toggle errors so screen reader + keyboard users land
  // on the message instead of having to hunt for it after a failed save.
  const accountErrorRef = useRef<HTMLParagraphElement>(null);
  const prefErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (accountError) accountErrorRef.current?.focus();
  }, [accountError]);
  useEffect(() => {
    if (prefError) prefErrorRef.current?.focus();
  }, [prefError]);

  const togglePref = async (key: string, value: boolean) => {
    const pref = prefs.find((p) => p.key === key);
    const prev = prefs;
    // Optimistic update.
    setPrefs((cur) => cur.map((p) => (p.key === key ? { ...p, enabled: value } : p)));

    // Local-only toggle (demo prefs without a mapped column, or non-live mode).
    if (!live || !pref?.field) return;

    setPrefError(null);
    setSavingPref(key);
    try {
      const res = await fetch('/api/member/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [pref.field]: value }),
      });
      if (!res.ok) {
        setPrefs(prev); // revert
        setPrefError(await getErrorMessageFromResponse(res));
        return;
      }
      router.refresh();
    } catch {
      setPrefs(prev); // revert
      setPrefError('Could not save notification setting. Please try again.');
    } finally {
      setSavingPref(null);
    }
  };

  const handleSaveAccount = async () => {
    if (!live) return;
    setAccountError(null);
    setAccountSaved(false);

    // Full Name → first/last (endpoint requires both, min 1 char each).
    const trimmedName = fullName.trim();
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    if (!firstName || !lastName) {
      setAccountError('Please enter your full name (first and last).');
      return;
    }

    const pt = accountPassthrough ?? {};
    setSavingAccount(true);
    try {
      const res = await fetch('/api/member/dashboard-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          // Location maps to the city field; round-trip the rest of the
          // address so the upsert does not wipe it.
          city: loc.trim() || null,
          state: pt.state ?? null,
          zip: pt.zip ?? null,
          phone: pt.phone ?? null,
          address: pt.address ?? null,
          referralSource: pt.referralSource ?? null,
          linkedin: pt.linkedin ?? null,
          bio: pt.bio ?? null,
          hasEmploymentBarrier: pt.hasEmploymentBarrier ?? false,
          barrierTypes: pt.barrierTypes ?? [],
          employmentStatusAtEnroll: pt.employmentStatusAtEnroll ?? null,
        }),
      });
      if (!res.ok) {
        setAccountError(await getErrorMessageFromResponse(res));
        return;
      }
      setAccountSaved(true);
      router.refresh();
    } catch {
      setAccountError('Could not save your details. Please try again.');
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Account"
          title="Profile"
          lede="Details, notifications, and security."
          icon={<IdCard size={13} aria-hidden="true" />}
        />
        {/* Profile header */}
        <div className="wa-kit-card wa-flex wa-flex-col sm:wa-flex-row wa-items-center wa-gap-5">
          <MemberProfilePhotoEditor initials={initials || '?'} photoUrl={photoUrl} live={live} />
          <div style={{ flex: 1, textAlign: 'center' }} className="sm:wa-text-left">
            <h2 className="h-font" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>
              {name || 'Name not on file'}
            </h2>
            {headline ? (
              <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>{headline}</p>
            ) : null}
            <div className="wa-flex wa-flex-wrap wa-gap-2 wa-justify-center sm:wa-justify-start" style={{ marginTop: 12 }}>
              {badges.map((b) => (
                <span
                  key={b.label}
                  style={{ padding: '6px 12px', borderRadius: 999, fontSize: 'var(--wa-type-meta)', fontWeight: 700, background: b.bg, color: b.color, fontVariantNumeric: 'tabular-nums' }}
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5">
          {/* Account details (2-wide on lg; full-width single column below — the
              span only applies where the 3-col grid exists so it can't create an
              overflowing implicit track on mobile/tablet). */}
          <div className="wa-kit-card lg:wa-col-span-2">
            <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 16 }}>Account details</h3>
            <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-4">
              <FormField
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <FormField label="Email" type="email" value={email} readOnly disabled />
              <FormField
                label="Location"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
              />
              <FormField label="Program">
                <select
                  value={programInterest}
                  disabled
                  className="wa-kit-focus"
                  style={{
                    marginTop: 4,
                    width: '100%',
                    fontSize: 'var(--wa-type-body)',
                    border: '1px solid var(--wa-border)',
                    borderRadius: 'var(--wa-radius-sm)',
                    padding: '10px 12px',
                    outline: 'none',
                    background: 'var(--wa-surface)',
                    color: 'var(--wa-text)',
                  }}
                >
                  {[programInterest, ...programOptions.filter((o) => o !== programInterest)]
                    .filter(Boolean)
                    .map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            {live ? (
              <p className="wa-kit-lede" style={{ marginTop: 8 }}>
                Email and program are managed by your counselor.
              </p>
            ) : null}
            {accountError ? (
              <p
                ref={accountErrorRef}
                role="alert"
                tabIndex={-1}
                style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)', fontWeight: 600, marginTop: 12 }}
              >
                {accountError}
              </p>
            ) : null}
            {accountSaved && !accountError ? (
              <p role="status" aria-live="polite" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-success-dark)', fontWeight: 600, marginTop: 12 }}>
                Saved.
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleSaveAccount}
              disabled={!live || savingAccount}
              aria-busy={savingAccount}
              className="wa-kit-cta wa-kit-focus enabled:hover:wa-opacity-90 enabled:active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
              style={{
                marginTop: 20,
                cursor: !live || savingAccount ? 'not-allowed' : 'pointer',
                opacity: !live || savingAccount ? 0.7 : 1,
              }}
            >
              <span aria-live="polite">{savingAccount ? 'Saving…' : 'Save changes'}</span>
            </button>
          </div>

          {/* Notifications */}
          <div className="wa-kit-card">
            <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 16 }}>Notifications</h3>
            {prefError ? (
              <p
                ref={prefErrorRef}
                role="alert"
                tabIndex={-1}
                style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)', fontWeight: 600, marginBottom: 12 }}
              >
                {prefError}
              </p>
            ) : null}
            {prefs.length === 0 ? (
              <p className="wa-kit-lede" style={{ margin: 0 }}>Notification preferences appear here when your account is connected.</p>
            ) : (
            <div className="wa-space-y-4">
              {prefs.map((p) => (
                <Toggle
                  key={p.key}
                  label={savingPref === p.key ? `${p.label} (saving…)` : p.label}
                  checked={p.enabled}
                  onChange={(v) => togglePref(p.key, v)}
                />
              ))}
            </div>
            )}
            {live ? (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--wa-border)' }}>
                <PushNotificationsToggle />
              </div>
            ) : null}
          </div>
        </div>

        {/* Language — reuses the same switcher as desktop portal chrome so
            mobile members (who land here via the "Profile & Settings" nav
            item) can change locale without a bookmarked /fr or /pt URL. */}
        <div className="wa-kit-card">
          <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 16 }}>Language</h3>
          <LanguageToggle />
        </div>

        {live ? (
          <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-5">
            {/* Password & security — the live kit profile had no entry point to
                change a password at all; members were stranded unless they knew
                to log out and use "forgot password" on the sign-in screen. */}
            <div className="wa-kit-card">
              <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 8 }}>Password and security</h3>
              <p className="wa-kit-lede" style={{ marginBottom: 16 }}>
                Reset by email — current password is not required.
              </p>
              <a
                href={`/forgot-password?email=${encodeURIComponent(email)}`}
                className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-bg-[var(--wa-surface-2)] active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[background-color,transform] wa-duration-150 motion-reduce:wa-transition-none"
              >
                Reset password
              </a>
            </div>

            {/* Danger zone — same reasoning: account deletion was only reachable
                via the legacy (?ui=legacy) fallback, not the live default UI. */}
            <div className="wa-kit-card" style={{ borderColor: 'var(--wa-danger)' }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 8, color: 'var(--wa-danger)' }}>
                Delete account
              </h3>
              <p className="wa-kit-lede" style={{ marginBottom: 16 }}>
                Permanently delete your WorkforceAP account and training progress. This can&apos;t be undone.
              </p>
              <DeleteAccountButton />
            </div>
          </div>
        ) : null}
      </div>
    </DesignSurface>
  );
}
