import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));

import { notifyDiscord } from '@/lib/notify/discord';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';

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

it('settles a locally aborted webhook after the fetch has ended', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('request aborted'); }));
  await expect(notifyDiscord({ title: 'Synthetic', body: 'No member data' }))
    .resolves.toBeUndefined();
});

it('treats a completed 400 response as known rejection', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
  await expect(notifyDiscord({ title: 'Synthetic', body: 'No member data' })).resolves.toBeUndefined();
});

it('settles a completed 503 response after recording the failed delivery', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
  await expect(notifyDiscord({ title: 'Synthetic', body: 'No member data' }))
    .resolves.toBeUndefined();
  expect(recordWorkflowDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
    provider: 'discord', status: 'error',
  }));
});

it('settles a completed webhook attempt even if its diagnostic write fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
  vi.mocked(recordWorkflowDiagnostic).mockRejectedValueOnce(new Error('diagnostics unavailable'));
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(notifyDiscord({ title: 'Synthetic', body: 'No member data' }))
      .resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith('[discord-notify] diagnostic failed:', expect.any(Error));
  } finally {
    logged.mockRestore();
  }
});
