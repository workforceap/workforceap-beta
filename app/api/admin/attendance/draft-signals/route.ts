import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { loadMonthlyAssistiveSignals } from '@/lib/attendance/load-assistive-signals';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  enrollmentId: z.string().uuid(),
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

/**
 * Read-only point counts for the monthly draft calendar.
 * Same admin and organization gate as the draft PDF. No writes.
 */
async function _POST(request: Request) {
  const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401, headers });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'ATTENDANCE_FORBIDDEN' }, { status: 403, headers });
  let organizationId: string;
  try { organizationId = await getActorOrganizationId(user.id); } catch {
    return NextResponse.json({ error: 'ATTENDANCE_FORBIDDEN' }, { status: 403, headers });
  }
  const raw = await request.text();
  if (raw.length > 2_000) return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413, headers });
  let parsed: z.infer<typeof bodySchema>;
  try { parsed = bodySchema.parse(JSON.parse(raw)); } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers });
  }
  const signals = await withTenantScope(organizationId, db =>
    loadMonthlyAssistiveSignals(db as never, organizationId, parsed.enrollmentId, parsed.selectedDate.slice(0, 7)));
  if (!signals) return NextResponse.json({ error: 'ATTENDANCE_ENROLLMENT_NOT_FOUND' }, { status: 404, headers });
  return NextResponse.json(signals, { status: 200, headers });
}

export const POST = withApiGuc(_POST);
