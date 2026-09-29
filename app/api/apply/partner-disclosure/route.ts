import { NextRequest, NextResponse } from 'next/server';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { checkPublicPartnerDisclosureRateLimit } from '@/lib/rate-limit';
import { resolvePartnerReferralDisclosure } from '@/lib/apply/partnerReferralDisclosure';

/**
 * GET /api/apply/partner-disclosure?ref=<code>[&program=<slug>]
 *
 * Public: the apply funnel calls this when the ref the browser will submit
 * differs from the one the page was rendered with, so the "{partner} will be
 * able to see …" line always names the partner signup will attribute. Returns
 * the partner name and data tier only (never an id or contact detail), and
 * `null` for unknown, inactive or other-organization refs.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpFromRequest(request);
  const { success } = await checkPublicPartnerDisclosureRateLimit(ip);
  if (!success) {
    return NextResponse.json({ disclosure: null, error: 'Too many requests' }, { status: 429 });
  }
  const ref = request.nextUrl.searchParams.get('ref');
  const program = request.nextUrl.searchParams.get('program');
  const disclosure = await resolvePartnerReferralDisclosure(ref, {
    headers: request.headers,
    programSlug: program,
  });
  return NextResponse.json(
    { disclosure },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
