// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: query } }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn() } }));

import { evaluateTimedSlo, measureCourseraIngestion, measureEmailDelivery } from '@/lib/observability/sloMetrics';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const REPORT = { id: 'timed', name: 'Timed SLO', target: '99%', source: 'fixture', note: 'Recorded attempts only.' };

describe('timed SLO counts', () => {
  it('includes failed attempts in the denominator and treats the target as inclusive', () => {
    expect(evaluateTimedSlo(REPORT, { total: BigInt(100), satisfied: BigInt(99), unobserved: BigInt(0) }, 99)).toMatchObject({ current: '99.00%', status: 'within' });
    expect(evaluateTimedSlo(REPORT, { total: '200', satisfied: '199', unobserved: '0' }, 99.5)).toMatchObject({ current: '99.50%', status: 'within' });
    expect(evaluateTimedSlo(REPORT, { total: 100, satisfied: 0, unobserved: 0 }, 99)).toMatchObject({ current: '0.00%', status: 'breaching' });
  });

  it('does not use the rounded display percentage to declare success', () => {
    expect(evaluateTimedSlo(REPORT, { total: 100_000, satisfied: 98_996, unobserved: 0 }, 99)).toMatchObject({ current: '99.00%', status: 'breaching' });
  });

  it('preserves unknown for missing samples, incomplete observations and invalid counts', () => {
    for (const counts of [
      undefined,
      { total: 0, satisfied: 0, unobserved: 0 },
      { total: 20, satisfied: 19, unobserved: 1 },
      { total: 1, satisfied: 2, unobserved: 0 },
      { total: 1, satisfied: 1, unobserved: 1 },
      { total: 1.5, satisfied: 1, unobserved: 0 },
      { total: NaN, satisfied: 0, unobserved: 0 },
      { total: Number.MAX_SAFE_INTEGER + 1, satisfied: 1, unobserved: 0 },
    ]) {
      expect(evaluateTimedSlo(REPORT, counts, 99)).toMatchObject({ current: null, status: 'unknown' });
    }
    expect(evaluateTimedSlo(REPORT, { total: 20, satisfied: 19, unobserved: 1 }, 99).note).toContain('1 of 20 observations');
  });
});

describe('source-backed timed measurements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([{ total: BigInt(200), satisfied: BigInt(199), unobserved: BigInt(0) }]);
    vi.stubEnv('RESEND_WEBHOOK_SECRET', 'fixture-signing-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('does not count email as delivered when the webhook is unconfigured', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '  ');
    expect(await measureEmailDelivery('org-fixture', NOW)).toMatchObject({ status: 'unknown', current: null });
    expect(query).not.toHaveBeenCalled();
  });

  it('binds the organization and shared window, with five minutes for email and one for ingestion', async () => {
    expect(await measureEmailDelivery('org-fixture', NOW)).toMatchObject({ current: '99.50%', status: 'within' });
    const emailParams = query.mock.calls[0].slice(1);
    expect(emailParams).toContain('org-fixture');
    expect(emailParams).toContainEqual(new Date('2026-10-03T12:00:00.000Z'));
    expect(emailParams).toContainEqual(new Date('2026-10-10T11:55:00.000Z'));
    expect(await measureCourseraIngestion('org-fixture', NOW)).toMatchObject({ current: '99.50%', status: 'within' });
    const xapiParams = query.mock.calls[1].slice(1);
    expect(xapiParams).toContain('org-fixture');
    expect(xapiParams).toContainEqual(new Date('2026-10-10T11:59:00.000Z'));
  });

  it('reserves the nullable all-organization scope for an explicitly supplied platform read', async () => {
    await measureCourseraIngestion(null, NOW);
    expect(query.mock.calls[0].slice(1)).toContain(null);
  });

  it('returns unknown when the source query fails rather than treating an outage as zero failures', async () => {
    query.mockRejectedValue(new Error('private database failure'));
    for (const measurement of [measureEmailDelivery, measureCourseraIngestion]) {
      const report = await measurement('org-fixture', NOW);
      expect(report).toMatchObject({ status: 'unknown', current: null });
      expect(JSON.stringify(report)).not.toMatch(/org-fixture|private database failure/);
    }
  });
});
