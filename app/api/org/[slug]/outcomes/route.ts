import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { checkPublicOrgOutcomesRateLimit } from '@/lib/rate-limit';
import {
  generatePartnerQuarterlyOutcomes,
  getDefaultQuarter,
  type QuarterSpec,
} from '@/lib/analytics/partnerQuarterlyOutcomes';
import { toPublicPartnerOutcomes } from '@/lib/outcomes/publicPartnerOutcomes';

function parseQuarterParam(raw: string | null): QuarterSpec['quarter'] | null {
  if (!raw) return null;
  const q = raw.toUpperCase();
  if (['Q1', 'Q2', 'Q3', 'Q4'].includes(q)) return q as QuarterSpec['quarter'];
  return null;
}

function parseYearParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 2020 || n > 2100) return null;
  return n;
}

async function _GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    // Public, unauthenticated read that fans out into several aggregate
    // queries per call — cap per IP before touching the database.
    const { success } = await checkPublicOrgOutcomesRateLimit(getClientIpFromRequest(req));
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    const partner = await prisma.partner.findUnique({
      where: { slug },
      select: { id: true, organizationId: true },
    });
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const quarterParam = parseQuarterParam(searchParams.get('quarter'));
    const yearParam = parseYearParam(searchParams.get('year'));

    const spec: QuarterSpec =
      quarterParam && yearParam
        ? { quarter: quarterParam, year: yearParam }
        : getDefaultQuarter();

    const body = await generatePartnerQuarterlyOutcomes(partner.organizationId, partner.id, spec);

    // Public, unauthenticated: an allowlist projection that follows the
    // methodology's public rules (no member rows, no salary or days-to-place,
    // small-N rates suppressed). See docs/OUTCOMES-METHODOLOGY.md section 7.
    return NextResponse.json(toPublicPartnerOutcomes(body));
  } catch (error) {
    console.error('/api/org/[slug]/outcomes error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
export const GET = withApiGuc(_GET);
