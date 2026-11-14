import { NextResponse } from 'next/server';
import { handleSyntheticAttendance } from '@/lib/attendance/synthetic-http';

export const dynamic = 'force-dynamic';

/** LOCAL SYNTHETIC demo only. Disabled unless ATTENDANCE_SYNTHETIC_DEMO=local outside production. */
export async function POST(request: Request) {
  const result = await handleSyntheticAttendance('POST', await request.text());
  return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

export async function GET() {
  const result = await handleSyntheticAttendance('GET', '');
  return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
