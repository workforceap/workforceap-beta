import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isJsonObject } from '@/lib/api/readJsonBody';
import { fetchInterviewPrepBundle } from '@/lib/member/interviewPrepBundle';
import { sendInterviewPrepBundleEmail } from '@/lib/email';
import { checkContactRateLimit } from '@/lib/rate-limit';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * POST /api/member/prep-bundle/send
 * Body: { selectedToolTypes?: string[] }
 * Sends selected AI tool results as a pre-interview prep bundle email to the
 * authenticated member's own address only. memberEmail is intentionally ignored
 * to prevent use as an open email relay.
 */
export const POST = withApiGuc(async (request: NextRequest) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const { success: withinLimit } = await checkContactRateLimit(ip);
  if (!withinLimit) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  // No body is fine (send everything); a body that is present must be a JSON
  // object, or `body.selectedToolTypes` throws on `null` and the route 500s.
  let body: { selectedToolTypes?: string[] } = {};
  const rawBody = (await request.text()).trim();
  if (rawBody.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!isJsonObject(parsed)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    body = parsed as { selectedToolTypes?: string[] };
  }

  const bundle = await fetchInterviewPrepBundle(user.id);
  if (bundle.empty) {
    return NextResponse.json(
      { error: 'No AI tool results yet. Run a few tools first, then come back.' },
      { status: 400 }
    );
  }

  // Filter to selected items if provided
  const selectedTypes = body.selectedToolTypes;
  const itemsToSend = selectedTypes && selectedTypes.length > 0
    ? bundle.items.filter(i => selectedTypes.includes(i.toolType))
    : bundle.items;

  if (itemsToSend.length === 0) {
    return NextResponse.json({ error: 'No items selected to send.' }, { status: 400 });
  }

  const email = user.email || '';
  if (!email) {
    return NextResponse.json({ error: 'No email address available.' }, { status: 400 });
  }

  const result = await sendInterviewPrepBundleEmail({
    to: email,
    recipientUserId: user.id,
    memberName: (user.user_metadata?.full_name as string) || user.email || 'Member',
    bundle: {
      items: itemsToSend,
      generatedAt: new Date(),
    },
  });

  if (!result.ok) {
    // Keep the email provider's text (API key / network detail) in the server log.
    console.error('[member/prep-bundle/send] email send failed:', result.error);
    return NextResponse.json(
      { error: 'Unable to send your prep bundle right now. Please try again in a few minutes.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: email, itemCount: itemsToSend.length });

  } catch (error) {
    console.error('/member/prep-bundle/send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
