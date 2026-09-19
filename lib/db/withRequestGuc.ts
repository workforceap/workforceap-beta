import type { User } from '@supabase/supabase-js';
import { unstable_rethrow } from 'next/navigation';
import {
  runWithGucContext,
  buildGucContext,
  ANONYMOUS_GUC_CONTEXT,
  SYSTEM_GUC_CONTEXT,
} from './gucContext';
import type { GucContext } from './gucContext';
import { resolveAuthGucContext } from '@/lib/auth/server';
import { captureApiError, captureApiResponseError } from '@/lib/observability/captureApiError';
import { apiRouteLabel, runWithApiErrorScope } from '@/lib/observability/apiErrorScope';

/**
 * Resolve the minimal GucContext from a Supabase User object.
 *
 * This is a lightweight helper for request handlers that already have the
 * user in hand.  It does NOT hit the database — callers that need the
 * profile role, orgId, employerId, or partnerId must resolve those first
 * (e.g. via `getProfileRole`, `getActorOrganizationId`, `getEmployerForUser`,
 * `getPartnerForUser`).
 */
export function buildGucContextFromUser(user: User | null): GucContext {
  if (!user) return ANONYMOUS_GUC_CONTEXT;
  return buildGucContext({
    userId: user.id,
    orgId: null, // caller should fill if known
    profileRole: null, // caller should fill if known
  });
}

/**
 * Run `fn` with a GUC context derived from an authenticated user.
 *
 * Use this in API routes, server actions, or server components after
 * resolving the user's identity.
 *
 * Example (API route):
 *   const user = await getUser();
 *   return withUserGuc(user, async () => {
 *     const data = await prisma.user.findMany();
 *     return Response.json(data);
 *   });
 */
export function withUserGuc<T>(
  user: User | null,
  fn: () => Promise<T>,
  options?: { orgId?: string | null; profileRole?: string | null; employerId?: string | null; partnerId?: string | null },
): Promise<T> {
  const ctx = user
    ? buildGucContext({
        userId: user.id,
        orgId: options?.orgId ?? null,
        profileRole: options?.profileRole ?? null,
        employerId: options?.employerId ?? null,
        partnerId: options?.partnerId ?? null,
      })
    : ANONYMOUS_GUC_CONTEXT;
  return runWithGucContext(ctx, fn);
}

/**
 * Run `fn` with the system/service-account GUC context.
 *
 * Use this for cron jobs, webhooks, and background workers that bypass
 * normal user authentication but still need a defined RLS role.
 */
export function withSystemGuc<T>(fn: () => Promise<T>): Promise<T> {
  return runWithGucContext(SYSTEM_GUC_CONTEXT, fn);
}

/**
 * Run `fn` with the anonymous GUC context.
 *
 * Use this for public endpoints that must explicitly opt out of any
 * user-scoped RLS context.
 */
export function withAnonymousGuc<T>(fn: () => Promise<T>): Promise<T> {
  return runWithGucContext(ANONYMOUS_GUC_CONTEXT, fn);
}

/**
 * API-route wrapper: resolves the current user's GUC context and runs the
 * handler with it. Falls back to anonymous for unauthenticated requests.
 *
 * Use this in App Router API route files:
 *   export const GET = withApiGuc(async (request) => { ... });
 */
/**
 * API-route wrapper: resolves the current user's GUC context and runs the
 * handler with it. Falls back to anonymous for unauthenticated requests.
 *
 * Use this in App Router API route files:
 *   export const GET = withApiGuc(async (request) => { ... });
 *   export const GET = withApiGuc(async (request, { params }) => { ... });
 */
// Static routes (no dynamic segment): handler receives only the request, and
// the exported route handler is single-arg — matches Next's RouteHandler.
export function withApiGuc<T, R extends Request = Request>(
  handler: (request: R) => Promise<T>,
): (request: Request) => Promise<T>;
// Dynamic routes: handler receives request + route context (e.g. { params }).
// Context is required (no `| undefined`) so Next's ParamCheck<RouteContext> passes.
export function withApiGuc<T, R extends Request = Request, C = unknown>(
  handler: (request: R, context: C) => Promise<T>,
): (request: Request, context: C) => Promise<T>;
export function withApiGuc<T, R extends Request = Request, C = unknown>(
  handler: (request: R, context: C) => Promise<T>,
): (request: Request, context?: C) => Promise<T> {
  return (request: Request, context?: C) => runWithApiErrorScope(async () => {
    let userId: string | null = null;
    const route = await apiRouteLabel(request, context);
    try {
      const ctx = await resolveAuthGucContext();
      userId = ctx.userId;
      return await runWithGucContext(ctx, async () => {
        const response = await handler(request as R, context as C);
        captureApiResponseError(response, route);
        return response;
      });
    } catch (error) {
      unstable_rethrow(error);
      captureApiError(error, { route, userId });
      return Response.json({ error: 'Internal server error' }, { status: 500 }) as unknown as T;
    }
  });
}

/**
 * API-route wrapper that enforces authentication.
 * Returns 401 if no user is present; otherwise runs with the user's GUC context.
 */
/**
 * API-route wrapper that enforces authentication.
 * Returns 401 if no user is present; otherwise runs with the user's GUC context.
 */
export function withAuthenticatedApiGuc<T, R extends Request = Request>(
  handler: (request: R, userId: string) => Promise<T>,
): (request: Request) => Promise<T>;
export function withAuthenticatedApiGuc<T, R extends Request = Request, C = unknown>(
  handler: (request: R, userId: string, context: C) => Promise<T>,
): (request: Request, context: C) => Promise<T>;
export function withAuthenticatedApiGuc<T, R extends Request = Request, C = unknown>(
  handler: (request: R, userId: string, context: C) => Promise<T>,
): (request: Request, context?: C) => Promise<T> {
  return (request: Request, context?: C) => runWithApiErrorScope(async () => {
    let userId: string | null = null;
    const route = await apiRouteLabel(request, context);
    try {
      const ctx = await resolveAuthGucContext();
      userId = ctx.userId;
      if (ctx.role === 'anonymous') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 }) as unknown as T;
      }
      return await runWithGucContext(ctx, async () => {
        const response = await handler(request as R, ctx.userId!, context as C);
        captureApiResponseError(response, route);
        return response;
      });
    } catch (error) {
      unstable_rethrow(error);
      captureApiError(error, { route, userId });
      return Response.json({ error: 'Internal server error' }, { status: 500 }) as unknown as T;
    }
  });
}
