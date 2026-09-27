/**
 * Web Push subscription registry for the signed-in user.
 * POST   — save/refresh the browser's PushSubscription (upsert on endpoint).
 * DELETE — remove a subscription (by endpoint) when the user turns push off.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { isWebPushConfigured } from '@/lib/push/sendWebPush';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(100),
  }),
});

async function _POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: 'Push notifications are not enabled on this deployment.' }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  try {
    await withActiveMemberWrite(user.id, (tx) => tx.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
      // A browser profile can change accounts: re-bind the endpoint to whoever
      // is signed in now so pushes never go to a previous user of this device.
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    }));
  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) {
      return NextResponse.json({ error: 'This account is no longer active.' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}

async function _DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof (body as { endpoint?: unknown })?.endpoint === 'string' ? (body as { endpoint: string }).endpoint : null;
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return NextResponse.json({ success: true });
}

export const POST = withApiGuc(_POST);
export const DELETE = withApiGuc(_DELETE);
