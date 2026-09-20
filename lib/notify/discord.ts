import 'server-only';

import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { createDiscordRateLimiter } from '@/lib/notify/discordRateLimit';

/**
 * Fire-and-forget Discord webhook bridge for operator visibility.
 *
 * Goal: when something noteworthy happens on the platform — a new
 * member↔employer message, a new high-signal Notification row,
 * etc. — Mike (operator) sees it in a dedicated Discord channel
 * without having to poll any admin dashboard.
 *
 * Hard rules:
 * - Never block the caller. Failures swallow + console.error.
 * - Skip when no webhook URL is configured.
 * - Skip in non-production unless DISCORD_NOTIFICATIONS_FORCE=1
 *   so local/preview branches don't spam the channel.
 * - Truncate field values defensively — Discord caps embeds at
 *   well under 6000 chars total, and bulk events can blow past it.
 *
 * Discord webhook rate-limit is 30/min per webhook. Bulk paths must
 * still aggregate into one event (createBulkNotifications, or a cron's
 * end-of-run summary); the process-local limiter below is the safety
 * net that turns a would-be 429 storm into dropped posts plus one
 * recorded diagnostic per window, and it honours Discord's retry_after.
 */

export type DiscordNotificationLevel = 'info' | 'success' | 'warn';

export interface DiscordNotificationInput {
  /** Short title shown bold at the top of the embed. */
  title: string;
  /** Main body text. Markdown supported by Discord. */
  body: string;
  /** Optional canonical URL for click-through (e.g. portal link). */
  url?: string | null;
  /** Optional category tag shown as a field, e.g. "message" or "audit". */
  category?: string | null;
  /** Optional named fields rendered as inline embed fields. */
  fields?: Array<{ name: string; value: string }>;
  /** Visual severity hint — maps to embed color. */
  level?: DiscordNotificationLevel;
}

const LEVEL_COLORS: Record<DiscordNotificationLevel, number> = {
  info: 0x5865f2,
  success: 0x57f287,
  warn: 0xfee75c,
};

/** `WorkflowDiagnostic.workflow` for the Discord bridge (health + diagnostics views). */
export const DISCORD_NOTIFICATION_WORKFLOW = 'discord_notification';

const limiter = createDiscordRateLimiter();
let droppedSinceDiagnostic = 0;
let lastDropDiagnosticAtMs = 0;
const DROP_DIAGNOSTIC_INTERVAL_MS = 60_000;

/** Discord returns `retry_after` seconds in the 429 body; the header is also seconds. */
function parseDiscordRetryAfterMs(response: Response, body: unknown): number {
  const record = body !== null && typeof body === 'object' ? body as Record<string, unknown> : null;
  const fromBody = Number(record?.retry_after);
  if (Number.isFinite(fromBody) && fromBody > 0) return Math.ceil(fromBody * 1_000);
  const fromHeader = Number(response.headers.get('retry-after'));
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader * 1_000);
  return 5_000;
}

const MAX_TITLE = 240;
const MAX_BODY = 1800;
const MAX_FIELD_VALUE = 800;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}

function shouldSend(): boolean {
  if (!process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL) return false;
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.DISCORD_NOTIFICATIONS_FORCE === '1';
}

/**
 * POST a single embed to the configured Discord webhook.
 *
 * Callers should not await this unless they specifically need to
 * serialize on it — it is fire-and-forget by design.
 */
export async function notifyDiscord(input: DiscordNotificationInput): Promise<void> {
  if (!shouldSend()) return;

  const admission = limiter.tryAcquire();
  if (!admission.ok) {
    droppedSinceDiagnostic++;
    const nowMs = Date.now();
    if (nowMs - lastDropDiagnosticAtMs >= DROP_DIAGNOSTIC_INTERVAL_MS) {
      lastDropDiagnosticAtMs = nowMs;
      const dropped = droppedSinceDiagnostic;
      droppedSinceDiagnostic = 0;
      await recordWorkflowDiagnostic({
        workflow: DISCORD_NOTIFICATION_WORKFLOW,
        status: 'fallback',
        provider: 'discord',
        fallbackPath: 'dropped_rate_limited',
        summary: `Discord notification dropped: local 30/min limit reached (${dropped} in the last minute)`,
        metadata: { category: input.category ?? null, retryAfterMs: admission.retryAfterMs, dropped },
      });
    }
    return;
  }

  const url = process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL!;
  const level: DiscordNotificationLevel = input.level ?? 'info';

  const embed: Record<string, unknown> = {
    title: truncate(input.title, MAX_TITLE),
    description: truncate(input.body, MAX_BODY),
    color: LEVEL_COLORS[level],
    timestamp: new Date().toISOString(),
  };

  if (input.url) {
    embed.url = input.url;
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (input.category) {
    fields.push({ name: 'Category', value: input.category, inline: true });
  }
  if (input.fields) {
    for (const f of input.fields) {
      fields.push({
        name: truncate(f.name, 240),
        value: truncate(f.value, MAX_FIELD_VALUE),
        inline: true,
      });
    }
  }
  if (fields.length > 0) {
    embed.fields = fields;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'WorkforceAP',
        embeds: [embed],
      }),
      // Don't let a hung webhook stall a request handler.
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      if (response.status === 429) {
        const body = await response.json().catch(() => null);
        limiter.blockFor(parseDiscordRetryAfterMs(response, body));
      }
      throw new Error(`Discord webhook returned HTTP ${response.status}`);
    }
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    console.error('[discord-notify] post failed:', failureReason);
    await recordWorkflowDiagnostic({
      workflow: DISCORD_NOTIFICATION_WORKFLOW,
      status: 'error',
      provider: 'discord',
      summary: `Discord notification failed: "${truncate(input.title, MAX_TITLE)}"`,
      failureReason,
      metadata: { category: input.category ?? null },
    });
  }
}
