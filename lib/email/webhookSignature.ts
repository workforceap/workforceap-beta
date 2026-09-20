/**
 * Svix-style webhook signature verification, as used by Resend.
 *
 * Resend signs each delivery with headers `svix-id`, `svix-timestamp` and
 * `svix-signature`. The signed content is `${id}.${timestamp}.${rawBody}`,
 * the key is the base64 payload of the `whsec_...` endpoint secret, and the
 * signature header holds one or more space-separated `v1,<base64>` entries
 * (several during a secret rotation). Implemented here with node:crypto so
 * the webhook route needs no extra dependency. Pure — no I/O.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export interface SvixSignatureInput {
  secret: string | undefined | null;
  msgId: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  payload: string;
  nowMs?: number;
  toleranceSeconds?: number;
}

export type SvixVerification =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'secret_missing'
        | 'secret_invalid'
        | 'headers_missing'
        | 'timestamp_invalid'
        | 'timestamp_out_of_tolerance'
        | 'signature_mismatch';
    };

function decodeSecret(secret: string): Buffer | null {
  const raw = secret.trim().replace(/^whsec_/, '');
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, 'base64');
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

/** Compute the `v1` signature Svix would produce for these inputs (base64). */
export function signSvixPayload(secret: string, msgId: string, timestamp: string, payload: string): string {
  const key = decodeSecret(secret);
  if (!key) throw new Error('Invalid Svix secret');
  return createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
}

export function verifySvixSignature(input: SvixSignatureInput): SvixVerification {
  if (!input.secret || !input.secret.trim()) return { ok: false, reason: 'secret_missing' };
  const key = decodeSecret(input.secret);
  if (!key) return { ok: false, reason: 'secret_invalid' };

  const msgId = input.msgId?.trim();
  const timestamp = input.timestamp?.trim();
  const signatureHeader = input.signature?.trim();
  if (!msgId || !timestamp || !signatureHeader) return { ok: false, reason: 'headers_missing' };

  const timestampSeconds = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: 'timestamp_invalid' };
  }
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  const tolerance = input.toleranceSeconds ?? SVIX_TIMESTAMP_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = createHmac('sha256', key).update(`${msgId}.${timestamp}.${input.payload}`).digest();
  for (const entry of signatureHeader.split(/\s+/)) {
    const [version, encoded] = entry.split(',', 2);
    if (version !== 'v1' || !encoded) continue;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(encoded, 'base64');
    } catch {
      continue;
    }
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return { ok: true };
  }
  return { ok: false, reason: 'signature_mismatch' };
}
