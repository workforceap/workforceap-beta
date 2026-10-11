/** Browser-safe logical test-send inputs; retries never regenerate this snapshot. */
export type EmailTemplateTestAttempt = {
  actorId: string;
  templateId: string;
  attemptId: string;
  templateUpdatedAt: string;
  to: string;
  variables: Record<string, string>;
};

// Resend retains a key for 24h. Leave a full hour for skew and request latency.
export const EMAIL_TEMPLATE_TEST_RETRY_WINDOW_MS = 23 * 60 * 60 * 1_000;
export const EMAIL_TEMPLATE_TEST_MAX_INPUT_BYTES = 64 * 1_024;
const ATTEMPT_ID = /^(\d{13})-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_ID = /^[a-z0-9_-]{1,128}$/i;

export function emailTemplateTestStorageKey(actorId: string): string {
  return `wap:admin-email-template-tests:${actorId}`;
}

export function readEmailTemplateTestAttempt(value: unknown): EmailTemplateTestAttempt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.actorId !== 'string' || !RECORD_ID.test(row.actorId)
    || typeof row.templateId !== 'string' || !RECORD_ID.test(row.templateId)
    || typeof row.attemptId !== 'string' || !ATTEMPT_ID.test(row.attemptId)
    || typeof row.templateUpdatedAt !== 'string' || row.templateUpdatedAt.length > 40
    || !Number.isFinite(Date.parse(row.templateUpdatedAt))
    || typeof row.to !== 'string' || !row.to.trim() || row.to.length > 320 || /[\r\n\0]/.test(row.to)
    || !row.variables || typeof row.variables !== 'object' || Array.isArray(row.variables)
    || Object.keys(row.variables).length > 100
    || Object.entries(row.variables).some(([key, item]) => key.length > 100 || typeof item !== 'string')
    || new TextEncoder().encode(JSON.stringify(row)).byteLength > EMAIL_TEMPLATE_TEST_MAX_INPUT_BYTES
  ) return null;
  return {
    actorId: row.actorId, templateId: row.templateId, attemptId: row.attemptId,
    templateUpdatedAt: row.templateUpdatedAt, to: row.to,
    variables: { ...(row.variables as Record<string, string>) },
  };
}

export function emailTemplateTestAttemptAge(attempt: EmailTemplateTestAttempt, now = Date.now()): 'valid' | 'future' | 'expired' {
  const createdAt = Number(attempt.attemptId.split('-')[0]);
  if (createdAt > now + 60_000) return 'future';
  return now - createdAt >= EMAIL_TEMPLATE_TEST_RETRY_WINDOW_MS ? 'expired' : 'valid';
}
