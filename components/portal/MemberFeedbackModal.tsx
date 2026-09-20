'use client';

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';

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

export default function MemberFeedbackModal({ open, onClose, defaultType = 'general' }: Props) {
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Kit trap: Tab containment + Escape (shared stack) + focus restore. Initial
  // focus stays on the title (below) so screen readers hear the dialog name.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, { onEscape: handleClose, skipInitialFocus: true });

  // Move focus into the dialog when it opens so keyboard/screen-reader users
  // land on it instead of staying on the (now-obscured) trigger button.
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

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
      const res = await fetch('/api/member/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, rating, comment: comment.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.');
        return;
      }
      setSent(true);
      setRating(0);
      setComment('');
    } catch {
      setError('Network error. Please try again.');
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
        zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'var(--surface-container-lowest, #fff)',
          borderRadius: '1rem',
          width: '100%',
          maxWidth: '420px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--outline-variant)' }}>
          <h2 ref={titleRef} tabIndex={-1} id="feedback-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>
            Share Feedback
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Help us improve WorkforceAP.
          </p>
        </div>

        {sent ? (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '2.5rem', color: 'var(--color-green, #4a9b4f)', fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
            <h3 style={{ margin: '0.75rem 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Thank you!</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
              Your feedback helps us serve members better.
            </p>
            <button onClick={handleClose} className="btn btn-primary" style={{ marginTop: '1.25rem' }}>
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
                  borderRadius: '0.625rem',
                  background: 'rgba(173,44,77,0.1)',
                  color: 'var(--color-accent)',
                  fontSize: '0.875rem',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="memberfeedbackmodal-what-is-this-about-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                What is this about?
              </label>
              <select id="memberfeedbackmodal-what-is-this-about-field"
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container)',
                  color: 'var(--color-on-surface)',
                  fontSize: '0.875rem',
                }}
              >
                {FEEDBACK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span id="memberfeedbackmodal-rating-label" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
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
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      fontSize: '1.5rem',
                      lineHeight: 1,
                      color: star <= rating ? 'var(--color-gold, #f5a623)' : 'var(--outline-variant)',
                      transition: 'color 0.15s',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {star <= rating ? 'star' : 'star_outline'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="memberfeedbackmodal-comments-optional-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                Comments (optional)
              </label>
              <textarea id="memberfeedbackmodal-comments-optional-field"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more..."
                rows={4}
                maxLength={5000}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container)',
                  color: 'var(--color-on-surface)',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textAlign: 'right', marginTop: '0.25rem' }}>
                {comment.length}/5000
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              <button type="button" onClick={handleClose} className="btn btn-ghost" disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={sending} aria-busy={sending}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {sending && (
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">
                      progress_activity
                    </span>
                  )}
                  {sending ? 'Sending…' : 'Submit Feedback'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
