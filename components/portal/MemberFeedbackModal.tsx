'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Star } from 'lucide-react';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';
import { useAnnounce } from '@/components/portal/kit/hooks/useAnnounce';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  MEMBER_REQUEST_TIMEOUT_MS,
  describeMemberRequestException,
  readMemberRequestFailure,
} from '@/lib/portal/memberRequestFailure';

const SAVED_NOTICE = 'We saved your feedback.';

const FEEDBACK_TYPES = [
  { value: 'training', label: 'Training / Courses' },
  { value: 'counselor', label: 'Counselor Support' },
  { value: 'platform', label: 'Website / App' },
  { value: 'program', label: 'Program Overall' },
  { value: 'general', label: 'General' },
] as const;

type FeedbackType = (typeof FEEDBACK_TYPES)[number]['value'];

type Props = {
  open: boolean;
  onClose: () => void;
  defaultType?: FeedbackType;
};

/**
 * Member feedback dialog (POST /api/member/feedback -> `MemberFeedback`). Painted
 * on `--wa-*` tokens with Lucide icons so it opens cleanly from default kit
 * pages. The dialog says what happens to a submission: it is saved with the
 * member's account, WorkforceAP staff can read it (the admin-only
 * /admin/feedback page; no counselor-facing page shows feedback, so the
 * counselor is not named), and it is not a message, so nobody is asked to
 * reply. After a send, focus moves to Close (the form it came from unmounts)
 * and the confirmation is spoken through the kit announcer.
 */
export default function MemberFeedbackModal({ open, onClose, defaultType = 'general' }: Props) {
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeAfterSendRef = useRef<HTMLButtonElement>(null);
  const announce = useAnnounce();
  // Kit trap: Tab containment + Escape (shared stack) + focus restore. Initial
  // focus stays on the title (below) so screen readers hear the dialog name.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, { onEscape: handleClose, skipInitialFocus: true });

  // Move focus into the dialog when it opens so keyboard/screen-reader users
  // land on it instead of staying on the (now-obscured) trigger button.
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  // The submit button unmounts with the form on success; keep focus inside the dialog.
  useEffect(() => {
    if (sent) closeAfterSendRef.current?.focus();
  }, [sent]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(
        '/api/member/feedback',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, rating, comment: comment.trim() || undefined }),
        },
        MEMBER_REQUEST_TIMEOUT_MS,
      );
      if (!res.ok) {
        setError(await readMemberRequestFailure(res));
        return;
      }
      setSent(true);
      setRating(0);
      setComment('');
      announce(SAVED_NOTICE);
    } catch (err) {
      setError(describeMemberRequestException(err));
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setSent(false);
    setError(null);
    setRating(0);
    setComment('');
    setType(defaultType);
    onClose();
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'var(--wa-surface)',
          color: 'var(--wa-text)',
          border: '1px solid var(--wa-border)',
          borderRadius: 'var(--wa-radius-sm)',
          width: '100%',
          maxWidth: '420px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--wa-shadow-lg)',
        }}
      >
        <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--wa-border)' }}>
          <h2 ref={titleRef} tabIndex={-1} id="feedback-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>
            Share feedback
          </h2>
          <p className="wa-kit-meta" style={{ margin: '0.25rem 0 0' }}>
            Your feedback is saved with your account. WorkforceAP staff can read it. It is not a message, so it does not
            ask anyone to contact you.
          </p>
        </div>

        {sent ? (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
            <CheckCircle2 size={40} aria-hidden="true" style={{ color: 'var(--wa-success-dark)', display: 'inline-block' }} />
            <h3 style={{ margin: '0.75rem 0 0.25rem', fontSize: 'var(--wa-type-body)', fontWeight: 700 }}>Thank you</h3>
            <p className="wa-kit-lede" style={{ margin: 0 }}>
              {SAVED_NOTICE}
            </p>
            <button
              ref={closeAfterSendRef}
              type="button"
              onClick={handleClose}
              className="wa-kit-cta wa-kit-focus"
              style={{ marginTop: '1.25rem' }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {error && (
              <div
                role="alert"
                style={{
                  padding: '0.625rem 0.875rem',
                  borderRadius: 'var(--wa-radius-sm)',
                  background: 'var(--wa-danger-soft)',
                  color: 'var(--wa-danger-text)',
                  fontSize: 'var(--wa-type-meta)',
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="memberfeedbackmodal-what-is-this-about-field" className="wa-kit-field-label">
                What is this about?
              </label>
              <select id="memberfeedbackmodal-what-is-this-about-field"
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
                className="wa-kit-control wa-kit-focus"
              >
                {FEEDBACK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span id="memberfeedbackmodal-rating-label" className="wa-kit-field-label">
                Rating
              </span>
              <div role="radiogroup" aria-labelledby="memberfeedbackmodal-rating-label" style={{ display: 'flex', gap: '0.25rem' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={star === rating}
                    onClick={() => setRating(star)}
                    aria-label={`Rate ${star} out of 5`}
                    className="wa-kit-focus"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      minWidth: 44,
                      minHeight: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--wa-radius-sm)',
                      color: star <= rating ? 'var(--wa-gold-dark)' : 'var(--wa-control-border)',
                      transition: 'color var(--wa-dur-fast) var(--wa-ease)',
                    }}
                  >
                    <Star size={26} aria-hidden="true" fill={star <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="memberfeedbackmodal-comments-optional-field" className="wa-kit-field-label">
                Comments (optional)
              </label>
              <textarea id="memberfeedbackmodal-comments-optional-field"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more..."
                rows={4}
                maxLength={5000}
                className="wa-kit-control wa-kit-focus"
                style={{ resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div className="wa-kit-meta" style={{ textAlign: 'right', marginTop: '0.25rem' }}>
                {comment.length}/5000
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              <button type="button" onClick={handleClose} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="wa-kit-cta wa-kit-focus" disabled={sending} aria-busy={sending}>
                {sending && <Loader2 size={16} aria-hidden="true" className="wa-animate-spin motion-reduce:wa-animate-none" />}
                {sending ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
