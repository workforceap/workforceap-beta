import { NextResponse } from 'next/server';

import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';
import {
  getDbStatusForStage,
  getJobApplicationStage,
  type JobApplicationDbStatus,
  type JobApplicationSource,
} from '@/lib/member/jobApplicationKanban';
import { updateJobApplicationSchema } from '@/lib/validation/jobApplication';
import { applicationStatusChangeMetadata } from '@/lib/member/applicationStatusEvent';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

type Props = { params: Promise<{ id: string }> };

const DB_STATUSES: JobApplicationDbStatus[] = [
  'SAVED',
  'APPLIED',
  'PHONE_SCREEN',
  'INTERVIEWING',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
];

const KANBAN_STAGES = ['APPLIED', 'INTERVIEWING', 'OFFER', 'CLOSED'] as const;

function parseStatus(rawStatus: unknown): JobApplicationDbStatus | undefined {
  if (typeof rawStatus !== 'string') return undefined;
  if ((DB_STATUSES as readonly string[]).includes(rawStatus)) {
    return rawStatus as JobApplicationDbStatus;
  }
  if ((KANBAN_STAGES as readonly string[]).includes(rawStatus)) {
    return getDbStatusForStage(rawStatus as ReturnType<typeof getJobApplicationStage>);
  }
  return undefined;
}export const PATCH = withApiGuc(async (request: Request, { params }: Props) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const maybeBody = body as Record<string, unknown> | null;
    const hasLegacyFields = Boolean(
      maybeBody &&
        ('jobTitle' in maybeBody ||
          'applicationDate' in maybeBody ||
          'nextInterviewDate' in maybeBody),
    );
    const legacyParsed = hasLegacyFields
      ? updateJobApplicationSchema.safeParse(body)
      : null;
    if (hasLegacyFields && legacyParsed && !legacyParsed.success) {
      return NextResponse.json(
        { error: legacyParsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 },
      );
    }
  
    try {
      await ensureUserInDb(user);
  
      const existing = await prisma.$transaction((tx) => tx.jobApplication.findFirst({
        where: { id, userId: user.id },
        select: { id: true, status: true },
      }));
  
      if (!existing) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }
  
      const data: {
        role?: string;
        company?: string;
        appliedAt?: Date | null;
        source?: JobApplicationSource;
        status?: ReturnType<typeof getDbStatusForStage>;
        nextInterviewDate?: Date | null;
        notes?: string | null;
      } = {};
  
      if (hasLegacyFields && legacyParsed?.success) {
        const legacyData = legacyParsed.data;
        if (legacyData.jobTitle !== undefined) data.role = legacyData.jobTitle;
        if (legacyData.company !== undefined) data.company = legacyData.company;
        if (legacyData.applicationDate !== undefined) {
          data.appliedAt = legacyData.applicationDate
            ? new Date(legacyData.applicationDate)
            : null;
        }
        if (legacyData.source !== undefined) data.source = legacyData.source;
        if (legacyData.status !== undefined) {
          data.status = getDbStatusForStage(legacyData.status);
        }
        if (legacyData.nextInterviewDate !== undefined) {
          data.nextInterviewDate = legacyData.nextInterviewDate
            ? new Date(legacyData.nextInterviewDate)
            : null;
        }
        if (legacyData.notes !== undefined) data.notes = legacyData.notes || null;
      } else {
        if (typeof maybeBody?.role === 'string' && maybeBody.role.trim().length > 0) {
          data.role = maybeBody.role.trim().slice(0, 200);
        }
        if (typeof maybeBody?.company === 'string' && maybeBody.company.trim().length > 0) {
          data.company = maybeBody.company.trim().slice(0, 200);
        }
        if ('appliedAt' in (maybeBody ?? {})) {
          if (maybeBody?.appliedAt === null) {
            data.appliedAt = null;
          } else if (typeof maybeBody?.appliedAt === 'string') {
            data.appliedAt = new Date(maybeBody.appliedAt);
          }
        }
        if (typeof maybeBody?.source === 'string') {
          data.source = maybeBody.source as JobApplicationSource;
        }
        const dbStatus = parseStatus(maybeBody?.status);
        if (dbStatus) data.status = dbStatus;
        if ('nextInterviewDate' in (maybeBody ?? {})) {
          if (maybeBody?.nextInterviewDate === null) {
            data.nextInterviewDate = null;
          } else if (typeof maybeBody?.nextInterviewDate === 'string') {
            data.nextInterviewDate = new Date(maybeBody.nextInterviewDate);
          }
        }
        if ('notes' in (maybeBody ?? {})) {
          if (typeof maybeBody?.notes === 'string') {
            data.notes = maybeBody.notes.slice(0, 2000);
          } else if (maybeBody?.notes === null) {
            data.notes = null;
          }
        }
      }
  
      const application = await prisma.$transaction((tx) => tx.jobApplication.update({
        where: { id },
        data,
      }));
  
      if (data.status && data.status !== existing.status) {
        await trackEvent({
          userId: user.id,
          eventName: 'application_status_changed',
          entityType: 'job_application',
          entityId: application.id,
          sourcePage: '/dashboard/job-applications',
          // Shared with the three paths that were silent until now, so all
          // four write one metadata shape (stages, plus the raw db statuses
          // stages fold away).
          metadata: applicationStatusChangeMetadata(existing.status, data.status),
        });
      } else {
        await trackEvent({
          userId: user.id,
          eventName: 'application_updated',
          entityType: 'job_application',
          entityId: application.id,
          sourcePage: '/dashboard/job-applications',
        });
      }
  
      auditLog({ actorUserId: user.id, action: 'member.jobApplication.update', targetType: 'JobApplication', targetId: id }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'JobApplication', id }, result: { success: true } }).catch(() => {});
      return NextResponse.json(application);
    } catch (error) {
      console.error('[PATCH /api/member/job-applications/:id]', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/job-applications/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
