import { NextResponse } from 'next/server';
import { handleSyntheticSyncPreview } from '@/lib/attendance/sync-preview-synthetic';

export const dynamic = 'force-dynamic';

/** LOCAL SYNTHETIC only. 404 unless ATTENDANCE_SYNC_PREVIEW_DEMO=local outside production. Reads no database. */
export async function POST(request: Request) {
  const result = await handleSyntheticSyncPreview('POST', await request.text());
  return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
export async function GET() {
  const result = await handleSyntheticSyncPreview('GET', '');
  return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
