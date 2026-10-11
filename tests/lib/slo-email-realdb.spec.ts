// @vitest-environment node
/**
 * Database-contract regression: execute the production aggregate in PostgreSQL.
 * Each fixture lives in transaction-local temporary tables, so it cannot alter
 * the application tables or require schema/client regeneration.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ query: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: fixture.query } }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: fixture.warn } }));

import { createEmailSendLogWriter, type EmailSendLogEntry } from '@/lib/email/sendLog';
import { measureEmailDelivery } from '@/lib/observability/sloMetrics';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const QUEUED = new Date(NOW.getTime() - 600_000);
let client: PrismaClient;

async function withFixture(run: (tx: Prisma.TransactionClient) => Promise<void>) {
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
    await tx.$executeRaw`CREATE TEMP TABLE users (id text PRIMARY KEY, organization_id text NOT NULL) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE email_send_logs (
      id text PRIMARY KEY, user_id text, status text, last_event text,
      bounce_type text, provider_message_id text, failure_class text,
      created_at timestamp, provider text
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE workflow_diagnostics (
      workflow text, status text, entity_type text, entity_id text,
      metadata jsonb, created_at timestamp
    ) ON COMMIT DROP`;
    await tx.$executeRaw`INSERT INTO users VALUES ('a-user', 'org-a'), ('b-user', 'org-b')`;
    fixture.query.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => tx.$queryRaw(strings, ...values));
    await run(tx);
    // An unknown result must represent missing evidence, never a hidden SQL error.
    expect(fixture.warn).not.toHaveBeenCalled();
  });
}

async function email(
  tx: Prisma.TransactionClient, id: string, userId: string | null = 'a-user',
  status = 'sent', lastEvent: string | null = null, bounceType: string | null = null,
  providerId: string | null = id, failureClass: string | null = null,
) {
  await tx.$executeRaw`INSERT INTO email_send_logs
    (id, user_id, status, last_event, bounce_type, provider_message_id, failure_class, created_at, provider)
    VALUES (${id}, ${userId}, ${status}, ${lastEvent}, ${bounceType}, ${providerId}, ${failureClass}, ${QUEUED}, 'resend')`;
}

async function delivered(tx: Prisma.TransactionClient, id: string, eventAtMs: number) {
  const metadata = JSON.stringify({ version: 1, event: 'delivered', eventAtMs });
  await tx.$executeRaw`INSERT INTO workflow_diagnostics
    VALUES ('email_delivery_slo', 'success', 'email_send_log', ${id}, ${metadata}::jsonb, ${NOW})`;
}

describe.skipIf(process.env.TEST_REAL_DB?.trim() !== '1')('email SLO actual PostgreSQL evidence', () => {
  beforeAll(() => {
    const raw = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL ?? '';
    if (!raw || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(raw).hostname)) {
      throw new Error('Email SLO database-contract fixtures require a local disposable PostgreSQL.');
    }
    client = new PrismaClient({ datasources: { db: { url: raw } } });
    vi.stubEnv('RESEND_WEBHOOK_SECRET', 'fixture-signing-secret');
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => { vi.unstubAllEnvs(); await client?.$disconnect(); });

  it('keeps a response-lost send with no provider ID in the denominator as unknown', async () => {
    const entries: EmailSendLogEntry[] = [];
    const writer = createEmailSendLogWriter({ record: async (entry) => { entries.push(entry); } }, {
      to: 'fixture@example.test', subject: 'Response-lost fixture', userId: 'a-user',
    }, QUEUED.getTime());
    writer.write('sending', { attempts: 1 });
    writer.fail(new Error('ECONNRESET: acceptance response lost'), 2);
    await writer.settle();
    const failed = entries.at(-1)!;
    expect(failed).toMatchObject({ status: 'failed', providerMessageId: null, failureClass: 'network', attempts: 2 });

    await withFixture(async (tx) => {
      await email(tx, 'timely'); await delivered(tx, 'timely', QUEUED.getTime() + 1_000);
      await email(tx, 'response-lost', failed.userId, failed.status, null, null, failed.providerMessageId, failed.failureClass);
      expect(await measureEmailDelivery('org-a', NOW)).toMatchObject({
        current: null, status: 'unknown', note: expect.stringContaining('1 of 2 observations'),
      });
    });
  });

  it('does not infer definitive rejection from any collapsed local failure class', async () => {
    await withFixture(async (tx) => {
      for (const failureClass of ['network', 'provider_unavailable', 'unknown', 'provider_rejected', 'header_invalid', 'rate_limit', null]) {
        await email(tx, `failed-${failureClass}`, 'a-user', 'failed', null, null, null, failureClass);
      }
      await email(tx, 'accepted-earlier-retry', 'a-user', 'failed', null, null, 'earlier-provider-id', 'provider_rejected');
      expect(await measureEmailDelivery('org-a', NOW)).toMatchObject({
        current: null, status: 'unknown', note: expect.stringContaining('8 of 8 observations'),
      });
    });
  });

  it('includes signed provider terminal failures as known misses and keeps org scopes separate', async () => {
    await withFixture(async (tx) => {
      await email(tx, 'provider-failed', 'a-user', 'failed', 'failed');
      await email(tx, 'permanent-bounce', 'a-user', 'sent', 'bounced', 'Permanent');
      await email(tx, 'timely', 'b-user'); await delivered(tx, 'timely', QUEUED.getTime() + 1_000);
      expect(await measureEmailDelivery('org-a', NOW)).toMatchObject({ current: '0.00%', status: 'breaching' });
      expect(await measureEmailDelivery('org-b', NOW)).toMatchObject({ current: '100.00%', status: 'within' });
      expect(await measureEmailDelivery(null, NOW)).toMatchObject({ current: '33.33%', status: 'breaching' });
    });
  });

  it('keeps transient, undetermined and missing bounce types and complaints unknown', async () => {
    await withFixture(async (tx) => {
      for (const bounceType of ['Transient', 'Undetermined', null]) {
        await email(tx, `bounce-${bounceType}`, 'a-user', 'sent', 'bounced', bounceType);
      }
      await email(tx, 'complaint', 'a-user', 'sent', 'complained');
      expect(await measureEmailDelivery('org-a', NOW)).toMatchObject({
        current: null, status: 'unknown', note: expect.stringContaining('4 of 4 observations'),
      });
    });
  });

  it('uses delivery evidence even if the final local status failed, with an inclusive deadline', async () => {
    await withFixture(async (tx) => {
      await email(tx, 'timely-after-local-failure', 'a-user', 'failed');
      await delivered(tx, 'timely-after-local-failure', QUEUED.getTime() + 300_000);
      await email(tx, 'late-after-local-failure', 'a-user', 'failed');
      await delivered(tx, 'late-after-local-failure', QUEUED.getTime() + 300_001);
      expect(await measureEmailDelivery('org-a', NOW)).toMatchObject({ current: '50.00%', status: 'breaching' });
    });
  });
});
