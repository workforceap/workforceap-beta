'use client';

import { useEffect, useState } from 'react';
import { Award, Check, FileText } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { DesignSurface, SectionHeader } from '@/components/portal/kit';

/**
 * Certifications queue — approval queue for member-submitted credential proof
 * (dense). Mockup: workforceap-admin-subviews.html "Certifications Queue".
 * Target route: /admin/certifications
 *
 * The data (submissions / awaiting count / proof links) is wired to the real
 * `user_certifications` records by the route.
 *
 * Approve / Reject: when `actionsEnabled` is true, the buttons POST to
 * `/api/admin/certifications/review` ({ certId, action }). On success the row
 * is optimistically removed and the awaiting count decrements; on failure an
 * inline error is shown on the row and it stays in the queue. When
 * `actionsEnabled` is false (no real backend caller), the controls render
 * disabled with an explanatory note — backward compatible with the prior
 * read-only usage.
 */
export interface CertSubmission {
  id: string;
  /** Credential the member is claiming, e.g. "AWS Cloud Practitioner". */
  credential: string;
  /** Member name. */
  member: string;
  /** Program + any credential id / issuer + submitted-at, as one meta line. */
  meta: string;
  /** Where "View proof" points (the real uploaded-proof URL when present). */
  proofHref?: string;
}

export interface CertificationsQueueKitProps {
  submissions?: CertSubmission[];
  /** Awaiting-review count for the header. Defaults to submissions.length. */
  awaitingCount?: number;
  /**
   * Enable the Approve / Reject controls. Defaults to `false`; when off, the
   * controls render disabled with an explanatory note instead of doing nothing
   * silently. Set to `true` once the review mutation is available.
   */
  actionsEnabled?: boolean;
  /** Optional explanatory line shown under the header (e.g. how the list is sourced). */
  subtitle?: string;
}

const DEFAULT_SUBMISSIONS: CertSubmission[] = [
  {
    id: 'aws-cp',
    credential: 'AWS Cloud Practitioner',
    member: 'Mike Brown',
    meta: 'Cloud & IT · Credential ID AWS-CP-8841 · submitted 2h ago',
    proofHref: '#',
  },
  {
    id: 'cna',
    credential: 'Certified Nursing Assistant',
    member: 'Tanya Reed',
    meta: 'Healthcare · TX State Board · submitted 5h ago',
    proofHref: '#',
  },
  {
    id: 'epa-608',
    credential: 'EPA 608 Certification',
    member: 'Carlos Torres',
    meta: 'Skilled Trades · submitted 1d ago',
    proofHref: '#',
  },
];

const REVIEW_ENDPOINT = '/api/admin/certifications/review';

export function CertificationsQueueKit({
  submissions = DEFAULT_SUBMISSIONS,
  awaitingCount,
  actionsEnabled = false,
  subtitle,
}: CertificationsQueueKitProps) {
  const [rows, setRows] = useState<CertSubmission[]>(submissions);
  // Per-row in-flight action and error, keyed by submission id.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(submissions);
    setErrors({});
    setPendingId(null);
  }, [submissions]);

  // Header count tracks the live queue length once actions are enabled so it
  // refreshes as rows are approved/rejected. When disabled it shows the
  // server-provided count unchanged.
  const count = actionsEnabled ? rows.length : awaitingCount ?? submissions.length;

  async function handleReview(id: string, action: 'approve' | 'reject') {
    if (!actionsEnabled || pendingId) return;
    setPendingId(id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certId: id, action }),
      });
      if (!res.ok) {
        let message = `Failed to ${action} (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          /* non-JSON error response */
        }
        setErrors((prev) => ({ ...prev, [id]: message }));
        return;
      }
      // Success → optimistically remove the row (count derives from rows).
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setErrors((prev) => ({ ...prev, [id]: 'Network error — please try again' }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader title="Certifications queue" kicker="Approval queue" />

      {/* Gold "achievement" banner. wa-kit-card--gradient-gold falls back to a
          calm gold tint in the dense surface (per the kit). */}
      <Card
        className="wa-kit-card--gradient-gold"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="wa-flex md:wa-flex-row wa-flex-col md:wa-items-center wa-justify-between wa-gap-3">
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.85,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Award size={13} /> Approval queue
            </div>
            <h3
              className="h-font"
              style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', margin: '4px 0 2px' }}
            >
              {count} awaiting review
            </h3>
            <p style={{ fontSize: 13, opacity: 0.85, margin: 0 }}>
              {subtitle ?? 'Verify proof to count toward outcomes.'}
            </p>
          </div>
        </div>
        {!actionsEnabled && (
          <p
            style={{
              fontSize: 13,
              opacity: 0.75,
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Review actions are read-only — no approve/reject workflow is wired yet.
          </p>
        )}
      </Card>

      <div className="wa-space-y-3">
        {rows.length === 0 && <EmptyState title="Nothing to review right now." />}
        {rows.map((sub) => {
          const isBusy = pendingId === sub.id;
          const rowError = errors[sub.id];
          return (
            <Card key={sub.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  rowGap: 12,
                  columnGap: 16,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'var(--wa-gold-soft)',
                    color: 'var(--wa-gold)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Award size={20} />
                </div>

                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{sub.credential}</div>
                  <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
                    {sub.member} · {sub.meta}
                  </div>
                  {/* Mobile-only proof link: the desktop one is hidden below md, so
                      surface it inline with the meta on phones (kept reachable, no
                      overflow). */}
                  {sub.proofHref ? (
                    <a
                      href={sub.proofHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="md:wa-hidden wa-inline-flex wa-kit-focus"
                      style={{
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--wa-info)',
                        textDecoration: 'none',
                      }}
                    >
                      <FileText size={13} /> View proof
                    </a>
                  ) : (
                    <span
                      className="md:wa-hidden wa-inline-flex"
                      style={{
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--wa-muted)',
                      }}
                      title="No proof file on record"
                    >
                      <FileText size={13} /> No proof
                    </span>
                  )}
                </div>

                {sub.proofHref ? (
                  <a
                    href={sub.proofHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wa-hidden md:wa-inline-flex wa-kit-focus"
                    style={{
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--wa-info)',
                      textDecoration: 'none',
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={13} /> View proof
                  </a>
                ) : (
                  <span
                    className="wa-hidden md:wa-inline-flex"
                    style={{
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--wa-muted)',
                      flexShrink: 0,
                    }}
                    title="No proof file on record"
                  >
                    <FileText size={13} /> No proof
                  </span>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
                  <Button
                    label={isBusy ? 'Saving…' : 'Approve'}
                    variant="primary"
                    size="sm"
                    icon={<Check size={13} />}
                    isDisabled={!actionsEnabled || isBusy}
                    isLoading={isBusy}
                    tooltip={actionsEnabled ? undefined : 'Credential review is not yet available'}
                    onClick={() => handleReview(sub.id, 'approve')}
                  />
                  <Button
                    label="Reject"
                    variant="secondary"
                    size="sm"
                    isDisabled={!actionsEnabled || isBusy}
                    tooltip={actionsEnabled ? undefined : 'Credential review is not yet available'}
                    onClick={() => handleReview(sub.id, 'reject')}
                  />
                </div>
              </div>

              {rowError && (
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--wa-danger)',
                  }}
                >
                  {rowError}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </DesignSurface>
  );
}
