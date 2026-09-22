'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Check, Copy, Mail, PhoneCall } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackToolLaunch } from '@/lib/analytics/events';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { FormField } from '@/components/portal/kit';
import ExportPdfButton from './ExportPdfButton';
import ToolFollowThrough from './ToolFollowThrough';
import AiToolError from './AiToolError';

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  border: '1px solid var(--wa-accent)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

const kitBtnOutline: CSSProperties = {
  ...kitBtnSolid,
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
};

const FIELD_CONTROL: CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontFamily: 'inherit',
  minHeight: 44,
  boxSizing: 'border-box',
};

type Delivery = 'phone' | 'email';

export default function SalaryNegotiationForm({
  preview = false,
  initialOffer = '',
  initialTarget = '',
  initialJobTitle = '',
  initialCompany = '',
  initialDelivery = 'phone',
  previewOutput,
}: {
  preview?: boolean;
  initialOffer?: string;
  initialTarget?: string;
  initialJobTitle?: string;
  initialCompany?: string;
  initialDelivery?: Delivery;
  previewOutput?: string;
} = {}) {
  const [currentOffer, setCurrentOffer] = useState(initialOffer);
  const [targetSalary, setTargetSalary] = useState(initialTarget);
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [companyName, setCompanyName] = useState(initialCompany);
  const [deliveryMethod, setDeliveryMethod] = useState<Delivery>(initialDelivery);
  const [output, setOutput] = useState(previewOutput ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { copy, copied } = useCopyToClipboard();

  useDraftAutosave('ai-tool:salary-negotiation:currentOffer', currentOffer, setCurrentOffer);
  useDraftAutosave('ai-tool:salary-negotiation:targetSalary', targetSalary, setTargetSalary);
  useDraftAutosave('ai-tool:salary-negotiation:jobTitle', jobTitle, setJobTitle);
  useDraftAutosave('ai-tool:salary-negotiation:companyName', companyName, setCompanyName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      if (previewOutput) setOutput(previewOutput);
      return;
    }
    setError('');
    setOutput('');
    setLoading(true);
    trackToolLaunch('salary-negotiation', 'Salary Negotiation Script');

    const offerNum = parseFloat(currentOffer.replace(/[^0-9.]/g, ''));
    const targetNum = parseFloat(targetSalary.replace(/[^0-9.]/g, ''));

    try {
      const res = await fetch('/api/ai/salary-negotiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentOffer: offerNum,
          targetSalary: targetNum,
          jobTitle,
          companyName,
          deliveryMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }
      setOutput(data.output ?? '');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-3">
        <FormField label="Current offer" id="offer">
          <input
            id="offer"
            type="text"
            inputMode="numeric"
            value={currentOffer}
            onChange={(e) => setCurrentOffer(e.target.value)}
            placeholder="75000"
            required
            disabled={loading}
            style={FIELD_CONTROL}
          />
        </FormField>
        <FormField label="Target salary" id="target">
          <input
            id="target"
            type="text"
            inputMode="numeric"
            value={targetSalary}
            onChange={(e) => setTargetSalary(e.target.value)}
            placeholder="85000"
            required
            disabled={loading}
            style={FIELD_CONTROL}
          />
        </FormField>
      </div>
      <FormField label="Job title" id="job-title">
        <input
          id="job-title"
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="Cloud Support Associate"
          required
          disabled={loading}
          style={FIELD_CONTROL}
        />
      </FormField>
      <FormField label="Company" id="company">
        <input
          id="company"
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Ashby"
          required
          disabled={loading}
          style={FIELD_CONTROL}
        />
      </FormField>
      <div>
        <p className="wa-kit-field-label" style={{ marginBottom: 8 }}>
          Delivery
        </p>
        <div role="group" aria-label="Delivery" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {([
            { id: 'phone' as const, label: 'Phone', Icon: PhoneCall },
            { id: 'email' as const, label: 'Email', Icon: Mail },
          ]).map(({ id, label, Icon }) => {
            const on = deliveryMethod === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setDeliveryMethod(id)}
                disabled={loading}
                aria-pressed={on}
                className={KIT_BTN}
                style={{
                  ...(on ? kitBtnSolid : kitBtnOutline),
                  opacity: loading ? 0.55 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {error ? <AiToolError error={error} /> : null}
      <button
        type="submit"
        className={KIT_BTN}
        style={{
          ...kitBtnSolid,
          alignSelf: 'flex-start',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <PortalInlineSpinner size={18} />
            Writing script…
          </>
        ) : (
          'Write script'
        )}
      </button>
      {output ? (
        <div
          style={{
            marginTop: 8,
            padding: 20,
            background: 'var(--wa-surface-2)',
            borderRadius: 'var(--wa-radius)',
            border: '1px solid var(--wa-border)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h3 style={{ flex: '1 1 100%', margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--wa-text)' }}>
              {deliveryMethod === 'phone' ? 'Phone script' : 'Email script'}
            </h3>
            <button type="button" onClick={() => void copy(output)} className={KIT_BTN} style={kitBtnOutline}>
              <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <ExportPdfButton kit text={output} title="Salary Negotiation Script" toolName="Salary Negotiation" />
          </div>
          <pre
            style={{
              margin: 0,
              padding: 16,
              borderRadius: 'var(--wa-radius-sm)',
              background: 'var(--wa-surface)',
              border: '1px solid var(--wa-border)',
              color: 'var(--wa-text)',
              fontFamily: 'inherit',
              fontSize: 'var(--wa-type-body)',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {output}
          </pre>
          {!preview ? (
            <p style={{ margin: '12px 0 0', fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>
              Saved to history.{' '}
              <Link href="/dashboard/ai-tools/history" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                View all results
              </Link>
            </p>
          ) : null}
          {!preview ? <ToolFollowThrough toolType="salary_negotiation" /> : null}
        </div>
      ) : null}
    </form>
  );
}
