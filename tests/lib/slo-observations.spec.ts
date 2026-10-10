// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { workflowDiagnostic: store } }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn() } }));

import { finishXapiSloObservation, recordEmailDeliverySloEvent, startXapiSloObservation } from '@/lib/observability/sloObservations';

describe('SLO observation persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.create.mockResolvedValue({ id: 'observation-1' });
    store.update.mockResolvedValue({ id: 'observation-1' });
  });
  afterEach(() => vi.useRealTimers());

  it('records the full inbound denominator before processing, then the measured persistence count', async () => {
    const id = await startXapiSloObservation({ organizationId: 'org-fixture', received: 3, receivedAtMs: 100 });
    expect(id).toBe('observation-1');
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'started', entityType: 'organization', entityId: 'org-fixture', metadata: { version: 1, received: 3, receivedAtMs: 100 },
    }) }));
    await finishXapiSloObservation({ id, received: 3, receivedAtMs: 100, persistedWithin60s: 1 });
    expect(store.update).toHaveBeenCalledWith({ where: { id }, data: expect.objectContaining({
      status: 'success', metadata: { version: 1, received: 3, receivedAtMs: 100, persistedWithin60s: 1 },
    }) });
  });

  it('preserves delivered evidence independently of latest provider state and never invents missing event times', async () => {
    const deliveredAt = new Date('2026-10-10T10:00:00Z');
    await recordEmailDeliverySloEvent({ sendLogId: 'send-log-1', event: 'delivered', eventAt: deliveredAt });
    await recordEmailDeliverySloEvent({ sendLogId: 'send-log-1', event: 'clicked', eventAt: null });
    expect(store.create.mock.calls[0][0].data).toMatchObject({
      entityId: 'send-log-1', metadata: { version: 1, event: 'delivered', eventAtMs: deliveredAt.getTime() },
    });
    expect(store.create.mock.calls[1][0].data.metadata).toEqual({ version: 1, event: 'clicked', eventAtMs: null });
    expect(JSON.stringify(store.create.mock.calls)).not.toMatch(/providerMessageId|recipients|actorEmail|payload/);
  });

  it('keeps provider behavior independent of failed telemetry writes', async () => {
    store.create.mockRejectedValue(new Error('database down'));
    expect(await startXapiSloObservation({ organizationId: 'org-fixture', received: 1, receivedAtMs: 100 })).toBeNull();
    await expect(recordEmailDeliverySloEvent({ sendLogId: 'send-log-1', event: 'delivered', eventAt: new Date() })).resolves.toBeUndefined();
    await finishXapiSloObservation({ id: null, received: 1, receivedAtMs: 100, persistedWithin60s: 1 });
    expect(store.update).not.toHaveBeenCalled();
    store.update.mockRejectedValue(new Error('database down'));
    await expect(finishXapiSloObservation({ id: 'observation-1', received: 1, receivedAtMs: 100, persistedWithin60s: 1 })).resolves.toBeUndefined();
  });

  it('bounds a stalled telemetry write without claiming a completed observation', async () => {
    vi.useFakeTimers();
    store.create.mockImplementation(() => new Promise(() => {}));
    const observation = startXapiSloObservation({ organizationId: 'org-fixture', received: 1, receivedAtMs: 100 });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await observation).toBeNull();
  });
});
