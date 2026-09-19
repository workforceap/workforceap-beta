'use client';

import { useState, useEffect, useRef } from 'react';
import { Mail, AlertCircle, Info } from 'lucide-react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter, HStack, VStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';

const MAX_SUBJECT = 200;
const MAX_BODY = 8000;

const TEMPLATE_VARS = [
  { key: 'firstName', example: "Maria" },
  { key: 'fullName', example: "Maria Garcia" },
  { key: 'email', example: "maria@email.com" },
  { key: 'programName', example: "Data Analytics" },
];

type DeliveryResult = { sent: number; messagesCreated: number; total: number; errors: string[] };

function isDeliveryResult(value: unknown): value is DeliveryResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return ['sent', 'messagesCreated', 'total'].every((key) => Number.isSafeInteger(result[key]) && Number(result[key]) >= 0)
    && Number(result.sent) <= Number(result.total)
    && Number(result.messagesCreated) <= Number(result.total)
    && Array.isArray(result.errors) && result.errors.every((error) => typeof error === 'string');
}

type Props = {
  open: boolean;
  memberIds: string[];
  onClose: () => void;
  onSent: (result: DeliveryResult) => void;
};

export default function BulkEmailModal({ open, memberIds, onClose, onSent }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendAsEmail, setSendAsEmail] = useState(true);
  const [createMessage, setCreateMessage] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryResult, setDeliveryResult] = useState<DeliveryResult | null>(null);
  const [sendBlocked, setSendBlocked] = useState(false);
  const requestPending = useRef(false);
  const attemptCompleted = useRef(false);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !requestPending.current) onClose();
  };

  useEffect(() => {
    if (open) {
      setSubject('');
      setBody('');
      setSendAsEmail(true);
      setCreateMessage(true);
      setError(null);
      setDeliveryResult(null);
      setSendBlocked(false);
      attemptCompleted.current = false;
      setSending(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requestPending.current || attemptCompleted.current) return;
    if (!subject.trim()) { setError('Subject is required.'); return; }
    if (!body.trim()) { setError('Message body is required.'); return; }
    if (!sendAsEmail && !createMessage) { setError('Choose at least one delivery method.'); return; }

    requestPending.current = true;
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/members/bulk-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds,
          subject: subject.trim(),
          body: body.trim(),
          sendAsEmail,
          createMessage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Send failed. Please try again.');
        return;
      }
      // The endpoint supplies counts, not failed recipient IDs. A second send
      // could duplicate emails or messages that succeeded during a partial run.
      attemptCompleted.current = true;
      setSendBlocked(true);
      if (!isDeliveryResult(data)) {
        setError('The server response could not confirm the results. Check member delivery records before starting another send. This batch cannot be resent here.');
        return;
      }
      onSent(data);
      if (data.errors.length > 0 || data.total !== memberIds.length
        || (sendAsEmail && data.sent < data.total) || (createMessage && data.messagesCreated < data.total)) {
        setDeliveryResult(data);
        setError('This batch needs review. Check the reported results before starting another action. This batch cannot be resent here.');
        return;
      }
      onClose();
    } catch {
      attemptCompleted.current = true;
      setSendBlocked(true);
      setError('The connection ended before results could be confirmed. Check member delivery records before starting another send. This batch cannot be resent here.');
    } finally {
      requestPending.current = false;
      setSending(false);
    }
  }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form" width={560} maxHeight="90dvh" aria-label="Bulk Email">
      <Layout
        header={<DialogHeader title="Bulk Email" startContent={<Mail size={20} aria-hidden="true" />} onOpenChange={sending ? undefined : handleOpenChange} />}
        content={
          <LayoutContent>
            <form id="bulk-email-form" onSubmit={handleSubmit} aria-busy={sending}>
              <VStack gap={4}>
                {error && (
                  <div role="alert" style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: '0.625rem',
                    background: 'var(--wa-accent-soft)',
                    color: 'var(--wa-accent-text)',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                {deliveryResult && (
                  <section aria-label="Reported delivery results">
                    <p>Results reported for {deliveryResult.total} of {memberIds.length} selected members.</p>
                    <ul>
                      <li>Emails reported sent: {deliveryResult.sent} of {deliveryResult.total}.</li>
                      <li>Portal messages reported created: {deliveryResult.messagesCreated} of {deliveryResult.total}.</li>
                    </ul>
                    {deliveryResult.errors.length > 0 && <ul aria-label="Delivery issues">{deliveryResult.errors.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}
                  </section>
                )}

                <div style={{
                  padding: '0.625rem 0.875rem',
                  borderRadius: '0.625rem',
                  background: 'var(--wa-surface-2)',
                  color: 'var(--color-on-surface-variant)',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}>
                  <Info size={16} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
                  <div>
                    <strong>{memberIds.length}</strong> member{memberIds.length === 1 ? '' : 's'} selected.
                    Use template variables in subject and body:
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                      {TEMPLATE_VARS.map((v) => (
                        <code key={v.key} style={{
                          background: 'var(--color-white)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          border: '1px solid var(--outline-variant)',
                        }}>
                          {'{'}{v.key}{'}'}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="bulkemailmodal-subject-field" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                    Subject
                  </label>
                  <input id="bulkemailmodal-subject-field"
                    type="text"
                    value={subject}
                    disabled={sending || sendBlocked}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Quick check-in, {firstName}"
                    maxLength={MAX_SUBJECT}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: 'var(--surface-container)',
                      color: 'var(--color-on-surface)',
                      fontSize: '0.875rem',
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', textAlign: 'right', marginTop: '0.25rem' }}>
                    {subject.length}/{MAX_SUBJECT}
                  </div>
                </div>

                <div>
                  <label htmlFor="bulkemailmodal-message-field" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                    Message
                  </label>
                  <textarea id="bulkemailmodal-message-field"
                    value={body}
                    disabled={sending || sendBlocked}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Hi {firstName},&#10;&#10;Just checking in on your progress with {programName}. Let us know if you need anything!"
                    rows={6}
                    maxLength={MAX_BODY}
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
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', textAlign: 'right', marginTop: '0.25rem' }}>
                    {body.length}/{MAX_BODY}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sendAsEmail}
                      disabled={sending || sendBlocked}
                      onChange={(e) => setSendAsEmail(e.target.checked)}
                    />
                    Send as email
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={createMessage}
                      disabled={sending || sendBlocked}
                      onChange={(e) => setCreateMessage(e.target.checked)}
                    />
                    Post to member message threads
                  </label>
                </div>
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button type="button" label={sendBlocked ? 'Close' : 'Cancel'} variant="secondary" isDisabled={sending} onClick={() => handleOpenChange(false)} />
              <Button type="submit" form="bulk-email-form" label={sending ? 'Sending…' : 'Send'} variant="primary" isDisabled={sending || sendBlocked} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
