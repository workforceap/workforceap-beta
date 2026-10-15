import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/** Retakes must be authorized by staff; keep the old URL closed for stale clients. */
export const POST = withApiGuc(async () => {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ error: 'Ask your counselor or administrator to authorize your final preassessment attempt.' }, { status: 403 });
});
