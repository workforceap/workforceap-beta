'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import type { NudgeTemplateId } from '@/lib/counselor/nudgeTemplates';

type TemplateOption = {
  id: NudgeTemplateId;
  label: string;
  preview: string;
};

type Props = {
  memberId: string;
  memberName: string;
  templates: TemplateOption[];
  /** Pre-rendered body for the milestone template, when applicable. */
  milestone?: string | null;
};

/**
 * Per-row triage nudge panel. Opens an inline form with the available
 * templates; counselor can pick one, optionally edit the body, and send.
 *
 * Server work happens via POST /api/counselor/nudge. On success the page is
 * refreshed so the row drops out of its current bucket and the totals
 * update.
 */
export default function TriageNudgePanel({ memberId, memberName, templates, milestone }: Props) {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NudgeTemplateId | null>(
    templates[0]?.id ?? null,
  );
  const [bodyOverride, setBodyOverride] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTemplate = templates.find((t) => t.id === selected) ?? null;

  function handleSelect(id: NudgeTemplateId) {
    setSelected(id);
    setBodyOverride('');
    setError(null);
  }

  async function handleSend() {
    if (!selected) return;
    setError(null);
    try {
      const res = await fetch('/api/counselor/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          templateId: selected,
          overrideBody: bodyOverride.trim() || undefined,
          milestone: milestone || undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Send failed (${res.status})`);
      }
      setOpen(false);
      setBodyOverride('');
      startTransition(() => router.refresh());
    } catch (err) {
      const message = requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Unable to send nudge' }, 'triage-nudge');
      setError(message);
    }
  }

  if (templates.length === 0) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-muted"
        style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
      >
        Send nudge
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.75rem',
        borderRadius: 8,
        background: 'var(--wa-surface-2)',
        border: '1px solid var(--wa-border)',
        display: 'grid',
        gap: '0.5rem',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
        Nudge {memberName}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSelect(t.id)}
            className={selected === t.id ? 'btn btn-primary' : 'btn btn-muted'}
            style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {selectedTemplate ? (
        <textarea
          rows={5}
          value={bodyOverride || selectedTemplate.preview}
          onChange={(e) => setBodyOverride(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid var(--wa-control-border)',
            fontSize: '0.85rem',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      ) : null}

      {error ? (
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-error, #b00020)' }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setBodyOverride('');
            setError(null);
          }}
          className="btn btn-muted"
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
          disabled={isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          className="btn btn-primary"
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
          disabled={isPending || !selected}
          aria-busy={isPending}
        >
          <span aria-live="polite">
            {isPending ? 'Sending…' : 'Send'}
          </span>
        </button>
      </div>
    </div>
  );
}
