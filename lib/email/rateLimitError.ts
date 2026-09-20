/**
 * Provider rate-limit detection, split from `send.ts` so the failure
 * classifier (`failureRecord.ts`) can share it without an import cycle.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

/** True when a Resend/provider failure is an HTTP 429 / rate_limit_exceeded. */
export function isEmailProviderRateLimitError(error: unknown): boolean {
  if (error == null) return false;
  const record = asRecord(error);
  if (record) {
    const status = Number(record.status ?? record.statusCode ?? record.status_code);
    const name = String(record.name ?? record.code ?? '').toLowerCase();
    if (status === 429 || name === 'rate_limit_exceeded' || name === 'rate_limited') return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /too many requests|rate[_ ]?limit/i.test(message);
}
