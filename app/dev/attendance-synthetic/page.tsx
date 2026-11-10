import { notFound } from 'next/navigation';
import { syntheticDemoEnabled } from '@/lib/attendance/synthetic-http';
import { SYNTHETIC_ENROLLMENT, SYNTHETIC_LABEL, SYNTHETIC_MEMBER, SYNTHETIC_ORG } from '@/lib/attendance/synthetic-fixtures';
import AttendanceSyntheticClient from './AttendanceSyntheticClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance synthetic demo · WorkforceAP', robots: { index: false, follow: false } };

/** LOCAL SYNTHETIC attendance entry/import/preview. Non-durable. Not production attendance. */
export default function AttendanceSyntheticDemoPage() {
  if (!syntheticDemoEnabled()) notFound();
  return <AttendanceSyntheticClient label={SYNTHETIC_LABEL} organizationId={SYNTHETIC_ORG} memberId={SYNTHETIC_MEMBER} enrollmentId={SYNTHETIC_ENROLLMENT} />;
}
