import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import AttendanceDraftClient from './AttendanceDraftClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance draft PDF · WorkforceAP', robots: { index: false, follow: false } };

/** Admin-only. Server-gated; the client only posts an enrollment id, period and dated minutes. */
export default async function AttendanceDraftPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (!(await isAdmin(user.id))) notFound();
  return <AttendanceDraftClient />;
}
