import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { generateWioaReport } from '@/lib/cron/wioa-report';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * POST /api/admin/reports/wioa/generate
 *
 * Generates a WIOA report for the requested period and returns it in the
 * response body. The report is NOT retained server-side: the previous
 * module-level in-memory GET only survived while a single lambda stayed warm,
 * so it returned `null` on most invocations and a different admin's report on
 * the rest. Durable retention is the monthly `/api/cron/wioa-report` email
 * (WAP-18). Report generation itself reads only, so this route is on the
 * mutation-audit allowlist in scripts/verify-admin-mutation-audit.cjs.
 */
async function _POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const period =
      body.periodStart && body.periodEnd
        ? {
            start: new Date(String(body.periodStart)),
            end: new Date(String(body.periodEnd)),
          }
        : undefined;

    const report = await generateWioaReport(period);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('/api/admin/reports/wioa/generate POST error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', detail: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}

export const POST = withApiGuc(_POST);
