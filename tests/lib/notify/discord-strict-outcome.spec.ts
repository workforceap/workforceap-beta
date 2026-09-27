import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));

import { DiscordOutcomeUncertainError, notifyDiscord } from '@/lib/notify/discord';

const priorUrl = process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL;
const priorForce = process.env.DISCORD_NOTIFICATIONS_FORCE;

beforeEach(() => {
  process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL = 'https://discord.example.test/webhook';
  process.env.DISCORD_NOTIFICATIONS_FORCE = '1';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (priorUrl === undefined) delete process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL;
  else process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL = priorUrl;
  if (priorForce === undefined) delete process.env.DISCORD_NOTIFICATIONS_FORCE;
  else process.env.DISCORD_NOTIFICATIONS_FORCE = priorForce;
});

it('retains a claimed notice after a local webhook abort with unknown provider outcome', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('request aborted'); }));
  await expect(notifyDiscord({ title: 'Synthetic', body: 'No member data' }, true))
    .rejects.toBeInstanceOf(DiscordOutcomeUncertainError);
});

it('treats a completed 400 response as known rejection', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
  await expect(notifyDiscord({ title: 'Synthetic', body: 'No member data' }, true)).resolves.toBeUndefined();
});

it('retains a claimed notice after an ambiguous 503 response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
  await expect(notifyDiscord({ title: 'Synthetic', body: 'No member data' }, true))
    .rejects.toBeInstanceOf(DiscordOutcomeUncertainError);
});
