import 'server-only';

/**
 * Resend webhook linkage for two-stage J5/J6 billing copies: a delivered,
 * bounced or complained event becomes evidence in billing_delivery_events
 * for the one accepted billing send with that provider message id.
 *
 * Non-regression for every other email: while the migration gate is closed
 * (the billing tables may not exist) this never touches the database and
 * reports no match, so app/api/webhooks/resend handles the event exactly as
 * it did before M3. With the gate open, a message id that matches no billing
 * send (every non-billing email) also reports no match.
 */
import type { ResendWebhookStore } from '@/lib/email/resendWebhook';

import { envGates } from './gates';

type Env = Record<string, string | undefined>;
type Linker = NonNullable<ResendWebhookStore['applyBillingDeliveryEvent']>;

/** The two Prisma delegates the linkage uses, so a test can pass a fake. */
export type BillingDeliveryDb = {
  billingStageSend: {
    findMany(args: {
      where: { providerMessageId: string; status: { in: string[] } };
      select: { id: true; organizationId: true };
      take: number;
    }): Promise<Array<{ id: string; organizationId: string }>>;
  };
  billingDeliveryEvent: {
    create(args: {
      data: { organizationId: string; sendId: string; kind: 'delivered' | 'bounced' | 'complained'; occurredAt: Date; source: 'resend_webhook'; providerEventId: string | null };
    }): Promise<unknown>;
  };
};

export function billingDeliveryLinker(db: BillingDeliveryDb, env: Env = process.env): Linker {
  return async ({ providerMessageId, kind, occurredAt, providerEventId }) => {
    if (!envGates(env).migration.enabled) return { matched: false };
    // Only an accepted copy; an id that matches more than one claim is ignored (never guessed).
    const sends = await db.billingStageSend.findMany({
      where: { providerMessageId, status: { in: ['provider_accepted', 'reconciled_delivered'] } },
      select: { id: true, organizationId: true },
      take: 2,
    });
    if (sends.length !== 1) return { matched: false };
    const [send] = sends;
    try {
      await db.billingDeliveryEvent.create({
        data: { organizationId: send.organizationId, sendId: send.id, kind, occurredAt, source: 'resend_webhook', providerEventId },
      });
    } catch (error) {
      // A repeated Svix delivery of the same event is a no-op.
      if ((error as { code?: string } | null)?.code !== 'P2002') throw error;
    }
    return { matched: true };
  };
}
