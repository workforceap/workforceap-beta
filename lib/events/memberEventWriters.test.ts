import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_EVENT_NAMES,
  EVENT_NAMES,
  LEGACY_EVENT_NAME_ALIASES,
  canonicalEventName,
  eventNameReadCandidates,
  isEventName,
} from './names';

/**
 * WAP-39: every MemberEvent row is written by lib/events/track.ts and carries
 * a name from the typed vocabulary.
 *
 * The "only track.ts calls memberEvent.create" rule is enforced at lint time
 * by the `no-restricted-syntax` DIRECT_WRITER_BANS in eslint.config.mjs (all
 * production ts/tsx, with lib/events/track.ts the single exemption), and the
 * writer signatures type `eventName` as `EventName` so tsc rejects an unknown
 * literal at the call site. This suite covers the runtime half: the canonical
 * writer refuses unknown names before any storage call and stores alias
 * spellings under their canonical name.
 */
vi.mock('@/lib/db/prisma', () => ({ prisma: { memberEvent: { create: vi.fn() } } }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/observability/requestId', () => ({ getRequestId: () => 'req-1' }));

import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';
import { persistEvent, trackEvent } from './track';

describe('canonical MemberEvent writer', () => {
  const create = vi.fn();
  const db = { memberEvent: { create } } as unknown as Parameters<typeof persistEvent>[1];

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'evt-1' });
  });

  it('persistEvent rejects a name outside the vocabulary before touching storage', async () => {
    await expect(
      persistEvent({ userId: 'user-1', eventName: 'made_up' as never }, db),
    ).rejects.toThrow('Unknown member event');
    expect(create).not.toHaveBeenCalled();
  });

  it('persistEvent stores a legacy alias under its canonical name with the request id', async () => {
    const [alias, canonical] = Object.entries(LEGACY_EVENT_NAME_ALIASES)[0]!;
    await persistEvent({ userId: 'user-1', eventName: alias as never, entityType: 'test' }, db);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', eventName: canonical, entityType: 'test', requestId: 'req-1' }),
    });
  });

  it('trackEvent writes through the same validated path and swallows unknown names as logged errors', async () => {
    await trackEvent({ userId: 'user-1', eventName: 'course_completed' });
    expect(prisma.memberEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventName: 'course_completed' }),
    });

    await expect(trackEvent({ userId: 'user-1', eventName: 'made_up' as never })).resolves.toBeUndefined();
    expect(prisma.memberEvent.create).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('trackEvent failed', expect.objectContaining({ eventName: 'made_up' }));
  });
});

describe('event vocabulary', () => {
  it('follows one lower_snake_case taxonomy and aliases resolve into it', () => {
    for (const name of EVENT_NAMES) {
      expect(name, `${name} breaks the taxonomy`).toMatch(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/);
    }
    expect(new Set(EVENT_NAMES).size, 'duplicate vocabulary entry').toBe(EVENT_NAMES.length);
    for (const [alias, canonical] of Object.entries(LEGACY_EVENT_NAME_ALIASES)) {
      expect(isEventName(canonical), `${alias} must alias a vocabulary name`).toBe(true);
      expect(isEventName(alias), `${alias} cannot be both an alias and a current name`).toBe(false);
      expect(canonicalEventName(alias)).toBe(canonical);
      expect(eventNameReadCandidates(canonical)).toEqual([canonical, alias]);
    }
    expect(eventNameReadCandidates('course_completed')).toEqual(['course_completed']);
    expect(canonicalEventName('made_up')).toBeNull();
    for (const name of CLIENT_EVENT_NAMES) {
      expect(isEventName(name), `client emitter ${name} must stay in the server vocabulary`).toBe(true);
    }
  });
});
