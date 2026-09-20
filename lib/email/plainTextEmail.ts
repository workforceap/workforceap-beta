import { escapeHtml } from '@/lib/email/escapeHtml';

/**
 * Minimal HTML body for a message that was authored as plain text, so a
 * text-only notification can go through the shared send wrapper (which
 * requires an HTML part and derives the plaintext fallback from it). The
 * caller still passes the original `text` so text clients see it verbatim.
 */
export function plainTextEmailHtml(text: string): string {
  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${escapeHtml(text)}</div>`;
}
