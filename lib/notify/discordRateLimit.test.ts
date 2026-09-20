import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDiscordRateLimiter } from '@/lib/notify/discordRateLimit';

describe('createDiscordRateLimiter', () => {
  it('admits 30 posts per minute and refuses the 31st until the window slides', () => {
    let nowMs = 1_000_000;
    const limiter = createDiscordRateLimiter({ now: () => nowMs });
    for (let i = 0; i < 30; i++) {
      assert.deepEqual(limiter.tryAcquire(), { ok: true }, `post ${i + 1} should be admitted`);
    }
    const refused = limiter.tryAcquire();
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.retryAfterMs, 60_000);

    nowMs += 59_999;
    assert.equal(limiter.tryAcquire().ok, false);
    nowMs += 1;
    assert.deepEqual(limiter.tryAcquire(), { ok: true });
    assert.equal(limiter.snapshot().inWindow, 1);
  });

  it('honours a server cooldown from a 429 before admitting again', () => {
    let nowMs = 5_000;
    const limiter = createDiscordRateLimiter({ now: () => nowMs, capacity: 5 });
    assert.equal(limiter.tryAcquire().ok, true);
    limiter.blockFor(2_500);
    const refused = limiter.tryAcquire();
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.retryAfterMs, 2_500);
    assert.equal(limiter.snapshot().blockedForMs, 2_500);
    nowMs += 2_500;
    assert.equal(limiter.tryAcquire().ok, true);
  });

  it('rejects nonsensical configuration instead of silently admitting everything', () => {
    assert.throws(() => createDiscordRateLimiter({ capacity: 0 }), TypeError);
    assert.throws(() => createDiscordRateLimiter({ windowMs: 0 }), TypeError);
  });
});
