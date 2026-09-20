/**
 * Sliding-window limiter for the Discord operator webhook.
 *
 * Discord allows 30 requests per minute per webhook. On 2026-09-14 the
 * inactive-nudge cron posted one embed per member and 51 of 93 posts came
 * back HTTP 429. Bulk paths now post one summary instead, and this limiter is
 * the safety net for everything else: it admits at most `capacity` posts per
 * `windowMs` and honours a server-supplied cooldown after a 429.
 *
 * Process-local by design (one serverless instance, one window). Pure — no
 * timers, no I/O — so it is unit-testable with an injected clock.
 */
export interface DiscordRateLimiterOptions {
  capacity?: number;
  windowMs?: number;
  now?: () => number;
}

export type DiscordAdmission = { ok: true } | { ok: false; retryAfterMs: number };

export interface DiscordRateLimiter {
  tryAcquire(): DiscordAdmission;
  /** Refuse everything until `ms` from now (Discord's `retry_after`). */
  blockFor(ms: number): void;
  snapshot(): { inWindow: number; capacity: number; blockedForMs: number };
}

export const DISCORD_WEBHOOK_CAPACITY_PER_MINUTE = 30;

export function createDiscordRateLimiter(options: DiscordRateLimiterOptions = {}): DiscordRateLimiter {
  const capacity = options.capacity ?? DISCORD_WEBHOOK_CAPACITY_PER_MINUTE;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  if (!Number.isFinite(capacity) || capacity < 1) throw new TypeError('capacity must be >= 1');
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new TypeError('windowMs must be > 0');

  const stamps: number[] = [];
  let blockedUntil = 0;

  const prune = (at: number) => {
    while (stamps.length > 0 && stamps[0] <= at - windowMs) stamps.shift();
  };

  return {
    tryAcquire() {
      const at = now();
      if (at < blockedUntil) return { ok: false, retryAfterMs: blockedUntil - at };
      prune(at);
      if (stamps.length >= capacity) return { ok: false, retryAfterMs: Math.max(1, stamps[0] + windowMs - at) };
      stamps.push(at);
      return { ok: true };
    },
    blockFor(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return;
      blockedUntil = Math.max(blockedUntil, now() + ms);
    },
    snapshot() {
      const at = now();
      prune(at);
      return { inWindow: stamps.length, capacity, blockedForMs: Math.max(0, blockedUntil - at) };
    },
  };
}
