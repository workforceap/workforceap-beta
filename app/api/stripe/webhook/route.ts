import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getStripe, getStripeConnectWebhookSecret, getStripeWebhookSecret } from '@/lib/stripe/client';
import type Stripe from 'stripe';

import { logWebhookEvent } from '@/lib/webhooks/logEvent';
import { recordWebhookDeadLetter } from '@/lib/webhooks/deadLetter';
import { captureApiError } from '@/lib/observability/captureApiError';

import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { reconcileEmployerSubscription, reconcileOrganizationSubscription } from '@/lib/stripe/subscriptionPersistence';
import { canonicalSubscriptionSnapshot } from '@/lib/stripe/stripeSubscriptionSnapshot';

function normalizeStripeId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : null;
  }
  return null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = normalizeStripeId((invoice as unknown as { subscription?: unknown }).subscription);
  if (legacy) return legacy;
  return normalizeStripeId(invoice.parent?.subscription_details?.subscription);
}

// withSystemGuc(fn) EXECUTES fn immediately and returns a Promise — it's
// not a route-handler factory like withApiGuc. The previous `export const
// POST = withSystemGuc(async (request) => {...})` ran the inner function
// at module-load time with `request` undefined and exported a Promise
// instead of a callable handler. Wrap with a real handler that defers
// execution until Next.js actually invokes POST with the request.
export async function POST(request: NextRequest) {
  return withSystemGuc(async () => {
  try {
    const payload = await request.text();
    const sig = request.headers.get('stripe-signature') || '';
  
    let event: Stripe.Event;
    try {
      // Try platform webhook secret first (checkout, subscription, invoice events)
      event = getStripe().webhooks.constructEvent(payload, sig, getStripeWebhookSecret());
    } catch (platformErr: unknown) {
      // Platform secret failed — try Connect secret (account, transfer, payout events)
      try {
        event = getStripe().webhooks.constructEvent(payload, sig, getStripeConnectWebhookSecret());
      } catch (connectErr: unknown) {
        const msg = connectErr instanceof Error ? connectErr.message : 'Unknown error';
        console.error('[stripe/webhook] signature verification failed for both platform and Connect secrets:', msg);
        return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
      }
    }
  
    try {
      let deadLettered = false;
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const orgId = session.metadata?.organizationId;
          const subscriptionId = normalizeStripeId(session.subscription);
          // Nothing was charged: nothing to provision and nothing to record.
          if (session.payment_status !== 'paid') break;
          if (!orgId || !subscriptionId) {
            // WAP-179: the employer has paid but this session cannot be mapped
            // to an organization (a Payment Link, a dashboard-created session,
            // a metadata typo). Previously this `break` answered 200 and nothing
            // anywhere recorded it. Now the delivery is written to
            // `webhook_events` as a dead letter (visible in /admin/webhook-events
            // next to the retry queue) and reported to Sentry with the session
            // id so a human can provision by hand.
            //
            // We still answer 200 once the dead letter is durably stored: the
            // missing metadata is a property of the completed session, so
            // Stripe redelivering the same payload for three days could never
            // succeed, and a persistently failing endpoint risks Stripe pausing
            // it for every other event type. Only a failure to *store* the dead
            // letter propagates (recordWebhookDeadLetter throws), which reaches
            // the 500 below and makes Stripe retry so the record is not lost.
            const missing = [
              !orgId ? 'metadata.organizationId' : null,
              !subscriptionId ? 'subscription' : null,
            ].filter((field): field is string => field !== null);
            await recordWebhookDeadLetter({
              source: 'stripe',
              eventType: event.type,
              eventId: event.id,
              payloadSize: Buffer.byteLength(payload, 'utf8'),
              httpStatusCode: 200,
              errorMessage: `Paid checkout session ${session.id} was not provisioned: missing ${missing.join(', ')}`,
            });
            captureApiError(new Error(`Stripe checkout.session.completed not provisionable: ${session.id}`), {
              route: 'stripe/webhook',
              extra: {
                sessionId: session.id,
                eventId: event.id,
                missing,
                mode: session.mode,
                customerId: normalizeStripeId(session.customer),
                amountTotal: session.amount_total,
                currency: session.currency,
              },
            });
            deadLettered = true;
            break;
          }
          await reconcileOrganizationSubscription(
            prisma,
            { organizationId: orgId },
            {
              subscriptionId,
              eventCreated: event.created,
              eventId: event.id,
              kind: 'checkout',
              replacesSubscriptionId: session.metadata?.replacesSubscriptionId || null,
              tier: session.metadata?.tier,
            },
            async () => canonicalSubscriptionSnapshot(
              await getStripe().subscriptions.retrieve(subscriptionId),
            ),
          );
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const delivered = event.data.object as Stripe.Subscription;
          const orgId = delivered.metadata?.organizationId;
          const userId = delivered.metadata?.userId;
          const kind = event.type === 'customer.subscription.deleted'
            ? 'subscription_deleted' as const
            : 'subscription_updated' as const;
          const fetchCanonical = async () => canonicalSubscriptionSnapshot(
            await getStripe().subscriptions.retrieve(delivered.id),
          );
          if (orgId) {
            await reconcileOrganizationSubscription(
              prisma,
              { organizationId: orgId },
              {
                subscriptionId: delivered.id,
                eventCreated: event.created,
                eventId: event.id,
                kind,
                replacesSubscriptionId: null,
              },
              fetchCanonical,
            );
          } else if (userId) {
            const employer = await prisma.employer.findUnique({
              where: { userId },
              select: { id: true, stripeCustomerId: true },
            });
            if (!employer) break;
            await reconcileEmployerSubscription(
              prisma,
              { employerId: employer.id, userId, customerId: employer.stripeCustomerId },
              {
                subscriptionId: delivered.id,
                eventCreated: event.created,
                eventId: event.id,
                kind,
                replacesSubscriptionId: null,
                ...(kind === 'subscription_deleted' ? { tier: 'basic' } : {}),
              },
              fetchCanonical,
              async (tx, next) => {
                await tx.employerSubscription.updateMany({
                  where: { userId, stripeSubscriptionId: delivered.id },
                  data: {
                    status: next.status ?? delivered.status,
                    ...(next.tier ? { tier: next.tier } : {}),
                  },
                });
              },
            );
          }
          break;
        }
        case 'invoice.payment_failed':
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const orgId = invoice.metadata?.organizationId
            ?? invoice.parent?.subscription_details?.metadata?.organizationId;
          const subscriptionId = invoiceSubscriptionId(invoice);
          if (!orgId || !subscriptionId) break;
          await reconcileOrganizationSubscription(
            prisma,
            { organizationId: orgId },
            {
              subscriptionId,
              eventCreated: event.created,
              eventId: event.id,
              kind: event.type === 'invoice.payment_failed' ? 'invoice_failed' : 'invoice_succeeded',
              replacesSubscriptionId: null,
            },
            async () => canonicalSubscriptionSnapshot(
              await getStripe().subscriptions.retrieve(subscriptionId),
            ),
          );
          break;
        }
        case 'account.updated': {
          const account = event.data.object as Stripe.Account;
          const partnerId = account.metadata?.partnerId;
          if (!partnerId) {
            console.warn('[stripe/webhook] account.updated missing partnerId metadata');
            break;
          }
  
          const isActive =
            account.details_submitted &&
            !account.requirements?.currently_due?.length &&
            !account.requirements?.past_due?.length;
  
          await prisma.$transaction((tx) => tx.partner.updateMany({
            where: { id: partnerId, stripeConnectId: account.id },
            data: { stripeConnectStatus: isActive ? 'active' : 'pending' },
          }));
          break;
        }
        case 'transfer.failed' as any: {
          const transfer = event.data.object as Stripe.Transfer;
          console.error('[stripe/webhook] transfer.failed', {
            transferId: transfer.id,
            destination: transfer.destination,
            metadata: transfer.metadata,
          });
          await logWebhookEvent({
            source: 'stripe',
            eventType: event.type,
            eventId: event.id,
            payloadSize: Buffer.byteLength(payload, 'utf8'),
            status: 'failed',
            errorMessage: `Transfer ${transfer.id} to ${transfer.destination} failed`,
          });
          captureApiError(new Error(`Stripe transfer.failed: ${transfer.id}`), {
            route: 'stripe/webhook',
            extra: {
              transferId: transfer.id,
              destination: transfer.destination,
              metadata: transfer.metadata,
            },
          });
          break;
        }
        case 'transfer.paid' as any: {
          const transfer = event.data.object as Stripe.Transfer;
          console.log('[stripe/webhook] transfer.paid', {
            transferId: transfer.id,
            destination: transfer.destination,
            metadata: transfer.metadata,
          });
          break;
        }
        case 'payout.failed': {
          const payout = event.data.object as Stripe.Payout;
          console.error('[stripe/webhook] payout.failed', {
            payoutId: payout.id,
            status: payout.status,
            failure_code: payout.failure_code,
          });
          await logWebhookEvent({
            source: 'stripe',
            eventType: event.type,
            eventId: event.id,
            payloadSize: Buffer.byteLength(payload, 'utf8'),
            status: 'failed',
            errorMessage: `Payout ${payout.id} failed: ${payout.failure_code ?? payout.status}`,
          });
          captureApiError(new Error(`Stripe payout.failed: ${payout.id}`), {
            route: 'stripe/webhook',
            extra: {
              payoutId: payout.id,
              status: payout.status,
              failure_code: payout.failure_code,
            },
          });
          break;
        }
        default:
          console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
      }
  
      return NextResponse.json(deadLettered ? { received: true, deadLettered: true } : { received: true });
    } catch (err) {
      console.error('[stripe/webhook] processing error:', err);
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
    } catch (error) {
      console.error('/stripe/webhook:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
