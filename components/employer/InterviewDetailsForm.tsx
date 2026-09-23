'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

const FALLBACK_ERROR = "Couldn't save the interview details. Try again.";
const LOCATION_MAX = 500;

/** ISO instant -> `YYYY-MM-DDTHH:mm` in the viewer's own time zone, for a datetime-local input. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const noopSubscribe = () => () => {};

/**
 * False during SSR and hydration, true after. The stored time is converted to
 * the browser's zone, which the server cannot know, so the prefilled value
 * waits for the client (no hydration mismatch).
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

async function errorFrom(res: Response): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  const message = data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
  return typeof message === 'string' && message.trim() ? message : FALLBACK_ERROR;
}

/**
 * When and where the interview is, on an application at Interview. The member
 * is notified by the server once per distinct time; the place is shown to the
 * member with it, so it is not a place for private notes.
 */
export default function InterviewDetailsForm({
  applicationId,
  scheduledAt,
  location,
}: {
  applicationId: string;
  /** Stored interviewScheduledAt as an ISO string, or null. */
  scheduledAt: string | null;
  /** Stored where / format text, or null. */
  location: string | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const timeId = useId();
  const placeId = useId();
  const hintId = useId();
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [place, setPlace] = useState(location ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const time = timeDraft ?? (hydrated ? isoToLocalInput(scheduledAt) : '');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const at = time ? new Date(time) : null;
    if (at && Number.isNaN(at.getTime())) {
      setError('Enter a valid date and time.');
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/employer/applications/${encodeURIComponent(applicationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'interview',
          interviewScheduledAt: at ? at.toISOString() : null,
          interviewLocation: place,
        }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(await errorFrom(res));
      }
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      aria-label="Interview details"
      style={{ display: 'grid', gap: '0.75rem', minWidth: 0, maxWidth: '100%' }}
    >
      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Interview details</h3>
      <div style={{ display: 'grid', gap: '0.25rem', minWidth: 0 }}>
        <label className="portal-field__label" htmlFor={timeId}>
          Date and time
        </label>
        <input
          id={timeId}
          type="datetime-local"
          className="portal-input"
          value={time}
          aria-describedby={hintId}
          onChange={(e) => {
            setTimeDraft(e.target.value);
            setSaved(false);
          }}
          style={{ maxWidth: '100%', minWidth: 0 }}
        />
        <span id={hintId} style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          In your device&apos;s time zone. The candidate is told the time when you save a new one.
        </span>
      </div>
      <div style={{ display: 'grid', gap: '0.25rem', minWidth: 0 }}>
        <label className="portal-field__label" htmlFor={placeId}>
          Where / format
        </label>
        <input
          id={placeId}
          type="text"
          className="portal-input"
          value={place}
          maxLength={LOCATION_MAX}
          placeholder="Address, video link or phone call"
          onChange={(e) => {
            setPlace(e.target.value);
            setSaved(false);
          }}
          style={{ maxWidth: '100%', minWidth: 0 }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ minHeight: 44 }}>
          {saving ? 'Saving…' : 'Save interview details'}
        </button>
        {saved && (
          <span aria-live="polite" style={{ fontSize: '0.8125rem', color: 'var(--color-green)', fontWeight: 700 }}>
            Saved
          </span>
        )}
        {error && (
          <span role="alert" style={{ fontSize: '0.8125rem', color: 'var(--wa-accent-text)', fontWeight: 700 }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
