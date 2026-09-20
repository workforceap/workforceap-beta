import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, getPartnerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { LEGACY_PORTAL_TOUR_KEY, getHomeTourForRole } from '@/lib/tours/registry';

const bodySchema = z.object({
  // `counselor` has no legacy onboarding row; resetting it only clears the tour state.
  portal: z.enum(['member', 'employer', 'partner', 'counselor']),
});

/** Tour keys a portal reset forgets, so the first-login tour / strip shows again (design §4). */
function tourKeysForPortal(portal: z.infer<typeof bodySchema>['portal']): string[] {
  if (portal === 'counselor') {
    const tour = getHomeTourForRole('counselor');
    return tour ? [tour.key] : [];
  }
  return [LEGACY_PORTAL_TOUR_KEY[portal]];
}

export const POST = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const superUser = await isSuperAdmin(user.id);
  if (process.env.NODE_ENV === 'production' && !superUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const { portal } = parsed.data;

  if (portal === 'member') {
    await prisma.$transaction((tx) => tx.user.update({
      where: { id: user.id },
      data: { onboardingCompletedAt: null, onboardingPortal: null, tourCompletedAt: null, onboardingCurrentStep: 0 },
    }));
  } else if (portal === 'employer') {
    const ctx = await getEmployerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await prisma.$transaction((tx) => tx.employer.update({
      where: { id: ctx.employerId },
      data: { onboardingCompletedAt: null, tourCompletedAt: null, onboardingCurrentStep: 0 },
    }));
  } else if (portal === 'partner') {
    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await prisma.$transaction((tx) => tx.partner.update({
      where: { id: ctx.partnerId },
      data: { onboardingCompletedAt: null, tourCompletedAt: null, onboardingCurrentStep: 0 },
    }));
  }

  // The v2 tour state is per user + tour key; without this the reset left the
  // legacy timestamp cleared but `user_tour_states` still COMPLETED/DISMISSED.
  const tourKeys = tourKeysForPortal(portal);
  if (tourKeys.length > 0) {
    await prisma.$transaction((tx) =>
      tx.userTourState.deleteMany({ where: { userId: user.id, tourKey: { in: tourKeys } } }),
    );
  }

  return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('/onboarding/reset error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

