import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { trackEvent } from '@/lib/events/track';
import { CLIENT_EVENT_NAMES } from '@/lib/events/names';
import { z } from 'zod';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const eventSchema = z.object({
  eventName: z.enum(CLIENT_EVENT_NAMES),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
  sourcePage: z.string().max(500).optional(),
  sessionId: z.string().max(200).optional(),
});

export const POST = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  if (parsed.data.eventName === 'admin_job_review_viewed' && !(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await trackEvent({
    userId: user.id,
    eventName: parsed.data.eventName,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    metadata: parsed.data.metadata ?? undefined,
    sourcePage: parsed.data.sourcePage,
    sessionId: parsed.data.sessionId,
  });

  return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('/events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
