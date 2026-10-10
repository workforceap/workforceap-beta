/**
 * xAPI ingest (Coursera → WorkforceAP)
 *
 * Ops quick ref (set `ENABLE_ANALYTICS_LOGS=true` for batch console lines from `trackXapiBatchProcessed`):
 * - **Progress not updating:** verify bearer token, actor maps to a member (`resolveXapiUser` in pipeline),
 *   and the activity object matches a course in the member’s enrolled program.
 * - **Unmatched / no member:** LRS actor mbox should match the portal account email.
 * - **Wrong program:** member `enrolled_program` must match the catalog slug statements are matched against.
 * - **Manual course / program fixes:** training “Mark complete” in the member portal; program changes via admin flows.
 */
import { NextResponse } from 'next/server';

import { trackXapiBatchProcessed } from '@/lib/analytics/track';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { checkXapiStatementsPostRateLimit } from '@/lib/rate-limit';
import { handleInboundParsedStatement } from '@/lib/xapi/inboundStatementPipeline';
import {
  flattenXapiStatementPayload,
  parseXapiStatement,
} from '@/lib/xapi/statements';
import { persistXapiStatement } from '@/lib/xapi/storage';
import { parseBearerToken, verifyXapiAccessToken } from '@/lib/xapi/token';
import { getXapiReadiness } from '@/lib/xapi/config';
import { captureApiError } from '@/lib/observability/captureApiError';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { invalidateCache } from '@/lib/cache';
import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { resolveOrgFromRequest } from '@/lib/tenant/resolveOrgFromRequest';
import {
  finishXapiSloObservation,
  startXapiSloObservation,
  XAPI_PERSISTENCE_DEADLINE_MS,
} from '@/lib/observability/sloObservations';

function tailFromObjectId(objectId: string | null | undefined): string | null {
  if (!objectId) return null;
  try {
    const url = new URL(objectId);
    return url.pathname.split('/').filter(Boolean).pop() ?? null;
  } catch {
    return objectId.split('/').filter(Boolean).pop() ?? null;
  }
}

/**
 * Extract the per-item identifier from a Coursera xAPI `object.id` URL.
 *
 * Coursera emits two URL shapes:
 *   - course-level: `.../course/<courseId>`           → returns null
 *   - item-level:   `.../course/<courseId>/item/<id>` → returns `<id>`
 *
 * Mirrors the SQL backfill regex in
 * `prisma/migrations/20260509200000_xapi_per_item_columns/migration.sql`
 * so historical and live rows agree.
 */
function itemIdFromObjectId(objectId: string | null | undefined): string | null {
  if (!objectId) return null;
  const match = objectId.match(/\/item\/([^/?#]+)/);
  return match?.[1] ?? null;
}

const UNPARSED_VERB = 'xapi.ingest.unparsed';

/** Best-effort actor fields when `parseXapiStatement` refuses the row (minimal identity). */
function extractRawStatementActorFields(raw: Record<string, unknown>): {
  statementId: string | null;
  actorEmail: string | null;
  actorAccountName: string | null;
  actorHomePage: string | null;
} {
  const statementId = typeof raw.id === 'string' ? raw.id.trim() || null : null;
  const actor =
    raw.actor && typeof raw.actor === 'object' && !Array.isArray(raw.actor)
      ? (raw.actor as Record<string, unknown>)
      : null;
  const mbox = typeof actor?.mbox === 'string' ? actor.mbox.trim() : '';
  const emailLower = mbox.toLowerCase();
  const actorEmail =
    emailLower.startsWith('mailto:') ? mbox.slice(7).trim().toLowerCase() : emailLower;
  const account =
    actor?.account && typeof actor.account === 'object' && !Array.isArray(actor.account)
      ? (actor.account as Record<string, unknown>)
      : null;
  const actorAccountName =
    typeof account?.name === 'string' && account.name.trim() ? account.name.trim() : null;
  const actorHomePage =
    typeof account?.homePage === 'string' && account.homePage.trim()
      ? account.homePage.trim()
      : null;
  return {
    statementId,
    actorEmail: actorEmail || null,
    actorAccountName,
    actorHomePage,
  };
}

export async function POST(request: Request) {
  const receivedAtMs = Date.now();
  if (!getXapiReadiness({ request }).ready) {
    return NextResponse.json({ error: 'xAPI auth is not configured' }, { status: 503 });
  }

  return withSystemGuc(async () => {
  try {
    const ip = getClientIpFromRequest(request);
    const { success: withinLimit } = await checkXapiStatementsPostRateLimit(ip);
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  
    const token = parseBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
    }
  
    try {
      verifyXapiAccessToken(token, { request });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid bearer token';
      return NextResponse.json({ error: message }, { status: 401 });
    }
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const rawStatements = flattenXapiStatementPayload(body);
    if (rawStatements.length === 0) {
      return NextResponse.json({ received: true, processed: 0, completions: [] }, { status: 201 });
    }

    const organizationId = await resolveOrgFromRequest(request.headers);
    const observationId = await startXapiSloObservation({ organizationId, received: rawStatements.length, receivedAtMs });
    let persistedWithin60s = 0;
    const recordPersisted = () => {
      if (Date.now() - receivedAtMs <= XAPI_PERSISTENCE_DEADLINE_MS) persistedWithin60s += 1;
    };
  
    const completions: Array<Record<string, unknown>> = [];
    let statementsHandled = 0;
    const ingestErrors: Array<{ statementId?: string; message: string }> = [];
  
    try {
    for (const raw of rawStatements) {
      const sidHint =
        typeof raw.id === 'string' ? raw.id : '(no statement id)';
      try {
        const parsed = parseXapiStatement(raw);
        if (!parsed) {
          const act = extractRawStatementActorFields(raw);
          try {
            await persistXapiStatement({
              statementId: act.statementId,
              organizationId,
              actorEmail: act.actorEmail,
              actorAccountName: act.actorAccountName,
              actorHomePage: act.actorHomePage,
              verb: UNPARSED_VERB,
              courseId: null,
              courseName: null,
              resultScoreScaled: null,
              resultScoreRaw: null,
              resultCompletion: null,
              resultSuccess: null,
              payload: raw as Record<string, never>,
              courseItemId: null,
              itemType: null,
            });
            recordPersisted();
          } catch (persistErr) {
            captureApiError(persistErr, {
              route: 'api/xapi/statements',
              extra: { step: 'persist-unparsed', statementId: act.statementId },
            });
            ingestErrors.push({
              statementId: act.statementId ?? undefined,
              message:
                persistErr instanceof Error ? persistErr.message : 'persist unparsed failed',
            });
          }
          continue;
        }
  
        const verb = parsed.verbId?.trim() || 'unknown';
  
        const { result: persisted, statementHash } = await persistXapiStatement({
          statementId: parsed.statementId,
          organizationId,
          actorEmail: parsed.email,
          actorAccountName: parsed.actorIdentifier,
          actorHomePage: parsed.actorHomePage,
          verb,
          courseId: parsed.courseraCourseId ?? tailFromObjectId(parsed.courseObjectId),
          courseName: parsed.courseName ?? null,
          resultScoreScaled: parsed.resultScoreScaled,
          resultScoreRaw: parsed.resultScoreRaw,
          resultCompletion: parsed.resultCompletion,
          resultSuccess: parsed.resultSuccess,
          payload: raw as Record<string, never>, // raw is a parsed xAPI JSON object — Prisma.InputJsonValue at runtime
          courseItemId: itemIdFromObjectId(parsed.courseObjectId),
          itemType: parsed.itemType ?? null,
        });
        recordPersisted();
  
        // Duplicate statementId: skip only after prior side effects completed.
        if (persisted === 'already_processed') continue;
  
        const { completions: batch } = await handleInboundParsedStatement(parsed, { organizationId, statementHash });
        completions.push(...batch);
        statementsHandled += 1;
      } catch (err) {
        captureApiError(err, {
          route: 'api/xapi/statements',
          extra: { statementId: sidHint },
        });
        ingestErrors.push({
          statementId: typeof raw.id === 'string' ? raw.id : undefined,
          message: err instanceof Error ? err.message : 'statement pipeline failed',
        });
      }
    }
    } finally {
      await finishXapiSloObservation({ id: observationId, received: rawStatements.length, receivedAtMs, persistedWithin60s });
    }
  
    trackXapiBatchProcessed({
      statementsHandled,
      completionCount: completions.filter((c) => (c as { ok?: boolean }).ok === true).length,
    });

    // Surface ingest failures on /admin/diagnostics — without this, per-statement
    // errors only live in the HTTP response body, which Coursera discards.
    if (ingestErrors.length > 0) {
      void recordWorkflowDiagnostic({
        workflow: 'xapi_ingestion',
        status: 'error',
        summary: `${ingestErrors.length} of ${rawStatements.length} xAPI statements failed ingestion`,
        provider: 'coursera',
        failureReason: ingestErrors[0].message,
        metadata: { errors: ingestErrors.slice(0, 20) },
      });
    }

    if (statementsHandled > 0) {
      await invalidateCache('xapi:counts');
    }
  
    return NextResponse.json({
      received: true,
      processed: statementsHandled,
      completions,
      ...(ingestErrors.length > 0 ? { errors: ingestErrors } : {}),
    }, { status: ingestErrors.length > 0 ? 500 : 201 });
  } catch (error) {
    console.error('/xapi/statements:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  });
}

export async function GET() {
  try {
    return NextResponse.json(
      {
        error: 'Use POST to submit xAPI statements',
        endpoint: '/api/xapi/statements',
      },
      { status: 405, headers: { Allow: 'POST' } },
    );
  } catch (error) {
    console.error('/xapi/statements:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
