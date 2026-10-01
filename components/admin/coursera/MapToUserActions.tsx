'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { programDisplayTitle } from '@/lib/content/programTitle';

type Suggestion = {
  userId: string;
  email: string;
  fullName: string;
  enrolledProgram: string | null;
  matchReason: 'exact_email' | 'email_local_part' | 'name_token' | 'partner_referral_email_local';
  matchScore: number;
  notes: string;
};

type Props = {
  externalEmail: string;
  externalName: string | null;
  /**
   * Explicit classification of the URL-key type, derived server-side from
   * the loaded xAPI / CSV data. Don't infer from string shape — actor
   * identifiers often contain `@` (account-name format), so a substring
   * check would post the key as `courseraEmail` and the resolver would
   * fail to resolve on replay because `resolveXapiUser` only uses email
   * mappings when the parsed statement has an mbox/email.
   */
  keyType: 'email' | 'actor_identifier';
  /**
   * Case-preserved `actor_identifier` from the loaded xAPI rows. The list-
   * page URL key is lowercased via `LOWER(COALESCE(actor_email,
   * actor_identifier))`, so passing the URL key as `actorIdentifier` to
   * `/map-unmatched` would create a lowercase mapping that the case-
   * sensitive `getMappingByActor` resolver fails to match against
   * mixed-case Coursera identifiers on replay.
   *
   * Required when keyType is 'actor_identifier'.
   */
  actorIdentifier?: string | null;
  /**
   * The `actor_home_page` from the most-recent xAPI event for this learner,
   * if any. Required when keyType is 'actor_identifier' — the server-side
   * resolver matches `coursera_identity_mappings` on
   * `(actor_identifier, COALESCE(actor_home_page, ''))`, so omitting this
   * for stored events that DO have a home page would create a mapping that
   * never resolves on replay.
   */
  actorHomePage?: string | null;
  suggestions: Suggestion[];
};

const REASON_LABEL: Record<Suggestion['matchReason'], string> = {
  exact_email: 'Exact email match',
  email_local_part: 'Same local-part',
  name_token: 'Name tokens match',
  partner_referral_email_local: 'Partner referral local-part',
};

/**
 * Per-suggestion "Map to this user" action. Calls
 * `POST /api/admin/coursera/mappings` which upserts a
 * `coursera_identity_mappings` row and promotes reviewed raw CSV facts. It
 * deliberately defers historical xAPI replay so the mapping action cannot
 * trigger old rewards or notifications. On success, refreshes the page so
 * the unmatched count drops.
 */
export default function MapToUserActions({
  externalEmail,
  externalName,
  keyType,
  actorIdentifier,
  actorHomePage,
  suggestions,
}: Props) {
  const router = useRouter();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ userId: string; promoted: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function map(userId: string) {
    setPendingUserId(userId);
    setError(null);
    setSuccess(null);
    try {
      // Use /map-unmatched (not /mappings) so the side effects include:
      //   1. coursera_identity_mappings upsert
      //   2. backfillUserIdForCourseraEmail — sets user_id on any existing
      //      coursera_course_progress / coursera_badge_progress rows so the
      //      learner drops out of the unmatched CSV count immediately
      //   3. canonical progress promotion through the B4B merge ladder,
      //      preserving any existing COMPLETED/xAPI-ahead local row
      //
      // The /mappings endpoint only does (1) and a separate xAPI repair; using it
      // here would leave CSV rows orphaned, per Codex P1 review on #1033.
      const body: Record<string, string> = { userId };
      if (keyType === 'email') {
        body.courseraEmail = externalEmail;
      } else {
        // Use the case-preserved actor_identifier from the xAPI row, NOT
        // the URL key (which the list query lowercased). `getMappingByActor`
        // resolves with case-sensitive `cim.actor_identifier = ?`, so a
        // lowercased mapping won't match mixed-case Coursera actors. Fall
        // back to the URL key only if the page didn't supply the original
        // (e.g. the event vanished between page load and click).
        const idForMapping =
          actorIdentifier && actorIdentifier.trim() !== ''
            ? actorIdentifier.trim()
            : externalEmail;
        body.actorIdentifier = idForMapping;
        // The resolver matches actor mappings on
        // `(actor_identifier, COALESCE(actor_home_page, ''))`, so a mapping
        // saved without the home page won't resolve when statements that DO
        // carry one replay. Pass it through whenever the events have it.
        if (actorHomePage && actorHomePage.trim() !== '') {
          body.actorHomePage = actorHomePage.trim();
        }
      }

      const res = await fetch('/api/admin/coursera/map-unmatched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Mapping failed (${res.status})`);
      }

      const data = (await res.json()) as {
        ok: boolean;
        backfill?: {
          courseRowsUpdated?: number;
          badgeRowsUpdated?: number;
          promotion?: { upserted?: number };
        };
      };
      setSuccess({
        userId,
        promoted: data.backfill?.promotion?.upserted ?? 0,
      });
      // ack ref to externalName so unused-prop lint stays happy when notes
      // aren't sent on actor-identifier mappings
      void externalName;
      startTransition(() => router.refresh());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Map failed';
      setError(msg);
    } finally {
      setPendingUserId(null);
    }
  }

  if (suggestions.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
        No close matches found in the WAP user database. To bind manually, visit the{' '}
        <a href="/admin/coursera">main Coursera admin page</a> and search for the member by name or
        email.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '0.5rem 0.75rem',
            borderRadius: 6,
            background: 'rgba(176, 0, 32, 0.1)',
            color: 'var(--color-error, #b00020)',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: '0.5rem 0.75rem',
            borderRadius: 6,
            background: 'rgba(34, 197, 94, 0.12)',
            color: 'rgb(22, 163, 74)',
            fontSize: '0.85rem',
          }}
        >
          Mapped successfully. {success.promoted} canonical course row(s) promoted without
          triggering learner notifications.
        </p>
      ) : null}

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
        {suggestions.map((s) => (
          <li
            key={s.userId}
            style={{
              padding: '0.75rem',
              borderRadius: 8,
              border: '1px solid var(--outline-variant, #e0e0e0)',
              background: 'var(--surface-container-lowest)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 60%' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {s.fullName}{' '}
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    padding: '0.1rem 0.4rem',
                    borderRadius: 999,
                    background:
                      s.matchScore >= 90
                        ? 'rgba(34, 197, 94, 0.15)'
                        : s.matchScore >= 60
                          ? 'rgba(251, 191, 36, 0.18)'
                          : 'rgba(148, 163, 184, 0.18)',
                    color:
                      s.matchScore >= 90
                        ? 'rgb(22, 163, 74)'
                        : s.matchScore >= 60
                          ? 'rgb(180, 130, 0)'
                          : 'var(--color-on-surface-variant)',
                  }}
                >
                  score {s.matchScore} · {REASON_LABEL[s.matchReason]}
                </span>
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                {s.email} {s.enrolledProgram ? `· enrolled in ${programDisplayTitle(s.enrolledProgram)}` : '· not enrolled'}
              </p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
                {s.notes}
              </p>
            </div>
            <button
              type="button"
              onClick={() => map(s.userId)}
              disabled={isPending || pendingUserId === s.userId || success?.userId === s.userId}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem', alignSelf: 'flex-start' }}
            >
              {success?.userId === s.userId
                ? 'Mapped'
                : pendingUserId === s.userId
                  ? 'Mapping…'
                  : 'Map to this user'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
