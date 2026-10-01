import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';
import { z } from 'zod';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { captureApiError } from '@/lib/observability/captureApiError';
import { careerMatchResultNullableSchema } from '@/lib/validation/careerMatchResult';
import {
  parseGoalDescription,
  encodeGoalDescription,
  generateGoalSteps,
  buildSteps,
} from '@/lib/member/goalSteps';
import { createApiErrorResponse, createNotFoundResponse, createUnauthorizedResponse } from '@/lib/api-utils';
import { withIdempotency } from '@/lib/api-utils';
import { checkAIToolRateLimit } from '@/lib/rate-limit';

import { Prisma } from '@prisma/client';

const goalSelect = Prisma.validator<Prisma.GoalSelect>()({
  id: true,
  goalType: true,
  title: true,
  description: true,
  targetMetricType: true,
  targetMetricValue: true,
  targetDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  userId: true,
});

async function loadOwnedGoal(goalId: string, userId: string) {
  return prisma.$transaction((tx) => tx.goal.findFirst({
    where: { id: goalId, userId },
    select: goalSelect,
  }));
}

/**
 * GET — return the structured steps for a goal.
 */
async function _GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const goal = await loadOwnedGoal(id, user.id);
    if (!goal) return createNotFoundResponse();

    const { steps, note } = parseGoalDescription(goal.description);
    return NextResponse.json({ steps, note });
  } catch (error) {
    captureApiError(error, { route: 'member/goals/[id]/steps GET' });
    return createApiErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}
export const GET = withApiGuc(_GET);

/**
 * POST — generate AI step plan for a goal (replaces existing steps).
 */
async function _POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const goal = await loadOwnedGoal(id, user.id);
    if (!goal) return createNotFoundResponse();

    const existing = parseGoalDescription(goal.description);

    // Pull the member's target career to personalize the steps.
    let careerTitle: string | null = null;
    try {
      const profile = await prisma.$transaction((tx) => tx.user.findUnique({
        where: { id: user.id },
        select: { careerRecommendationJson: true },
      }));
      const rec = careerMatchResultNullableSchema.safeParse(profile?.careerRecommendationJson).data ?? null;
      careerTitle = rec?.topOccupations?.[0]?.title ?? null;
    } catch {
      careerTitle = null;
    }

    // Each POST is a paid model call. Over the AI tool quota (or when the
    // limiter errors) the member still gets the curated fallback steps.
    const lim = await checkAIToolRateLimit(user.id).catch(() => ({ success: false }));

    const stepTexts = await generateGoalSteps(
      {
        title: goal.title,
        goalType: goal.goalType,
        note: existing.note,
        careerTitle,
      },
      { skipAI: !lim.success }
    );

    const steps = buildSteps(stepTexts);
    const description = encodeGoalDescription({ note: existing.note, steps });

    const updated = await prisma.$transaction((tx) => tx.goal.update({
      where: { id: goal.id },
      data: { description },
    }));

    await trackEvent({
      userId: user.id,
      eventName: 'goal_updated',
      entityType: 'goal',
      entityId: goal.id,
    });

    return NextResponse.json({ goal: updated, steps });
  } catch (error) {
    captureApiError(error, { route: 'member/goals/[id]/steps POST' });
    return createApiErrorResponse('Failed to generate steps', 'INTERNAL_ERROR', 500);
  }
}
export const POST = withApiGuc(withIdempotency(_POST));

const patchSchema = z.object({
  stepId: z.string().min(1).max(64),
  done: z.boolean(),
});

/**
 * PATCH — toggle a single step's completion.
 */
async function _PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const goal = await loadOwnedGoal(id, user.id);
    if (!goal) return createNotFoundResponse();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse('Invalid JSON', 'VALIDATION_ERROR', 400);
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse(
        parsed.error.errors[0]?.message ?? 'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }

    const payload = parseGoalDescription(goal.description);
    const idx = payload.steps.findIndex((s) => s.id === parsed.data.stepId);
    if (idx === -1) return createNotFoundResponse('Step not found');

    payload.steps[idx] = { ...payload.steps[idx], done: parsed.data.done };
    const description = encodeGoalDescription(payload);

    const updated = await prisma.$transaction((tx) => tx.goal.update({
      where: { id: goal.id },
      data: { description },
    }));

    const allDone = payload.steps.length > 0 && payload.steps.every((s) => s.done);
    if (parsed.data.done) {
      await trackEvent({
        userId: user.id,
        eventName: 'goal_updated',
        entityType: 'goal',
        entityId: goal.id,
      });
    }

    return NextResponse.json({ goal: updated, steps: payload.steps, allDone });
  } catch (error) {
    captureApiError(error, { route: 'member/goals/[id]/steps PATCH' });
    return createApiErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}
export const PATCH = withApiGuc(withIdempotency(_PATCH));
