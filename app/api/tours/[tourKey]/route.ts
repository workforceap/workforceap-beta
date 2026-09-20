import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { trackEvent, type EventName } from '@/lib/events/track';
import { TOUR_STATUSES, getTour, type TourStatus } from '@/lib/tours/registry';

const bodySchema = z.object({
  version: z.number().int().min(1),
  status: z.enum(TOUR_STATUSES),
  lastStep: z.number().int().min(0).default(0),
  /** Route the person was on; defaults to the registry route. */
  sourcePage: z.string().max(200).optional(),
});

const EVENT_FOR_STATUS: Record<TourStatus, EventName> = {
  STARTED: 'tour_started',
  COMPLETED: 'tour_completed',
  DISMISSED: 'tour_dismissed',
};

/**
 * POST /api/tours/[tourKey] `{ version, status, lastStep }` — upsert the
 * caller's state for one registered tour and write the matching `tour_*`
 * member event server-side (design §4, §7). Unknown keys are 404 so a typo
 * in a deep link never creates a row.
 */
export const POST = withApiGuc(async (request: Request, context: { params: Promise<{ tourKey: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { tourKey } = await context.params;
    const tour = getTour(tourKey);
    if (!tour) return NextResponse.json({ error: 'Unknown tour' }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { version, status, lastStep, sourcePage } = parsed.data;

    const state = await prisma.$transaction((tx) =>
      tx.userTourState.upsert({
        where: { userId_tourKey: { userId: user.id, tourKey: tour.key } },
        create: { userId: user.id, tourKey: tour.key, version, status, lastStep },
        update: { version, status, lastStep },
      }),
    );

    await trackEvent({
      userId: user.id,
      eventName: EVENT_FOR_STATUS[status],
      entityType: 'tour',
      entityId: tour.key,
      sourcePage: sourcePage ?? tour.route,
      // sourcePage is a first-class event column; do not repeat it in metadata.
      metadata: { tourKey: tour.key, version, lastStep, role: tour.role },
    });

    return NextResponse.json({
      ok: true,
      state: {
        tourKey: state.tourKey,
        version: state.version,
        status: state.status,
        lastStep: state.lastStep,
        updatedAt: state.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('/api/tours/[tourKey] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
