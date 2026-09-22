import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { checkApplyStatusLookupEmailRateLimit, checkApplyStatusLookupRateLimit } from '@/lib/rate-limit';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { captureApiError } from '@/lib/observability/captureApiError';
import { withApiGuc, withSystemGuc } from '@/lib/db/withRequestGuc';
import { APPLICATION_STATUS_LINK_TTL_MINUTES } from '@/lib/apply/statusLinkToken';
import { processStatusLinkRequest } from '@/lib/apply/statusLinkRequest';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

/**
 * Product call 28a (Mike Brown, "Do it", 2026-09-22 15:57 UTC): a visitor
 * enters the email they applied with; if an application exists we email a
 * signed 30-minute link to its real status. There is no SMS sender in this
 * codebase, so the copy promises email only, and no reply time is promised.
 *
 * Anti-enumeration (AUDIT §H-S4): the response below is the only 200 body
 * this route can produce. The lookup and the send run in `after()`, once the
 * response has gone out, so neither wording nor timing tells a caller
 * whether the address is on file. Per-IP and per-email limits are counted
 * for every address, known or not.
 */
const STATUS_LOOKUP_MESSAGE =
  `If we have an application under that address, we've emailed you a link. It expires in ${APPLICATION_STATUS_LINK_TTL_MINUTES} minutes.`;

const genericResponse = {
  ok: true,
  message: STATUS_LOOKUP_MESSAGE,
  expiresInMinutes: APPLICATION_STATUS_LINK_TTL_MINUTES,
};

const NO_STORE = { 'Cache-Control': 'no-store' };

export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const ip = getClientIpFromRequest(request);
    const { success: withinIpLimit } = await checkApplyStatusLookupRateLimit(ip);
    if (!withinIpLimit) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '3600', ...NO_STORE } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const email = parsed.data.email;

    const { success: withinEmailLimit } = await checkApplyStatusLookupEmailRateLimit(email);
    if (!withinEmailLimit) {
      // Counted for every address, so this 429 says nothing about whether an
      // application exists; it only tells the caller to wait.
      return NextResponse.json(
        { error: 'Too many requests for this email. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '3600', ...NO_STORE } },
      );
    }

    // Everything that depends on whether the address is on file happens after
    // the response is sent. `after()` callbacks do not inherit the request's
    // GUC context, so the work runs under the system context explicitly.
    after(async () => {
      try {
        await withSystemGuc(() => processStatusLinkRequest(email));
      } catch (err) {
        captureApiError(err, { route: 'apply/status-lookup/after' });
      }
    });

    return NextResponse.json(genericResponse, { headers: NO_STORE });
  } catch (err) {
    captureApiError(err, { route: 'apply/status-lookup' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
