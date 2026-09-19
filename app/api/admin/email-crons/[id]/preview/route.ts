import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { CRON_REGISTRY } from '@/lib/admin/cronRegistry';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import type { CronPreviewRecipient, CronPreviewResponse } from '@/lib/admin/cronPreviewTypes';

import { withApiGuc } from '@/lib/db/withRequestGuc';

export type { CronPreviewRecipient, CronPreviewResponse };

const PREVIEW_LIMIT = 50;

export const GET = withApiGuc(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try { await requireAdmin(user.id); } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const cron = CRON_REGISTRY.find(c => c.id === id);
    if (!cron) return NextResponse.json({ error: 'Cron not found' }, { status: 404 });

    const superAdmin = await isSuperAdmin(user.id);
    const orgId = superAdmin ? null : await getActorOrganizationId(user.id);

    try {
      const result = await getPreviewRecipients(id, orgId);
      return NextResponse.json(result);
    } catch (e) {
      console.error('[admin/email-crons/[id]/preview] recipient lookup failed:', e);
      return NextResponse.json({ error: 'Unable to load the preview recipients for this email cron.' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/email-crons/[id]/preview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

async function getPreviewRecipients(id: string, orgId: string | null): Promise<CronPreviewResponse> {
  const cron = CRON_REGISTRY.find(c => c.id === id)!;
  const orgFilter = orgId ? { organizationId: orgId } : {};

  switch (id) {
    case 'weekly-recap': {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
      weekStart.setHours(0, 0, 0, 0);
      const members = await prisma.$transaction((tx) => tx.user.findMany({
        where: {
          ...orgFilter,
          deletedAt: null,
          enrolledProgram: { not: null },
          weeklyRecaps: { none: { weekStartDate: { gte: weekStart } } },
        },
        select: { email: true, fullName: true },
        take: PREVIEW_LIMIT + 1,
      }));
      const truncated = members.length > PREVIEW_LIMIT;
      const recipients = members.slice(0, PREVIEW_LIMIT).map(m => ({ email: m.email ?? '', name: m.fullName }));
      return { cronId: id, cronName: cron.name, recipients, count: recipients.length, truncated };
    }

    case 'inactive-nudge': {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentlyActive = await prisma.$transaction((tx) => tx.memberEvent.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: sevenDaysAgo } },
      }));
      const activeUserIds = new Set(recentlyActive.map(r => r.userId));
      const members = await prisma.$transaction((tx) => tx.user.findMany({
        where: {
          ...orgFilter,
          deletedAt: null,
          notificationsReminders: true,
          id: { notIn: [...activeUserIds] },
        },
        select: { email: true, fullName: true },
        take: PREVIEW_LIMIT + 1,
      }));
      const truncated = members.length > PREVIEW_LIMIT;
      const recipients = members.slice(0, PREVIEW_LIMIT).map(m => ({ email: m.email ?? '', name: m.fullName }));
      return { cronId: id, cronName: cron.name, recipients, count: recipients.length, truncated };
    }

    case 'inactivity-nudge': {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const recentActiveIds = await prisma.$transaction((tx) => tx.memberEvent.findMany({
        where: { createdAt: { gte: fourteenDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
        take: 100,
      }));
      const activeSet = new Set(recentActiveIds.map(r => r.userId));
      const members = await prisma.$transaction((tx) => tx.user.findMany({
        where: {
          ...orgFilter,
          deletedAt: null,
          enrolledProgram: { not: null },
          notificationsReminders: true,
          id: { notIn: [...activeSet] },
        },
        select: { email: true, fullName: true },
        take: PREVIEW_LIMIT + 1,
        orderBy: { enrolledAt: 'asc' },
      }));
      const truncated = members.length > PREVIEW_LIMIT;
      const recipients = members.slice(0, PREVIEW_LIMIT).map(m => ({ email: m.email ?? '', name: m.fullName }));
      return { cronId: id, cronName: cron.name, recipients, count: recipients.length, truncated };
    }

    case 'applicant-followup': {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const staleApps = await prisma.$transaction((tx) => tx.application.findMany({
        where: {
          status: 'PENDING',
          submittedAt: { lte: threeDaysAgo },
          user: { ...orgFilter, deletedAt: null, notificationsReminders: true },
        },
        include: { user: { select: { id: true, email: true, fullName: true } } },
        take: PREVIEW_LIMIT + 1,
      }));
      const seen = new Set<string>();
      const recipients: CronPreviewRecipient[] = [];
      for (const app of staleApps) {
        if (seen.has(app.user.id)) continue;
        seen.add(app.user.id);
        recipients.push({ email: app.user.email ?? '', name: app.user.fullName });
        if (recipients.length >= PREVIEW_LIMIT) break;
      }
      const truncated = staleApps.length > PREVIEW_LIMIT;
      return { cronId: id, cronName: cron.name, recipients, count: recipients.length, truncated };
    }

    case 'weekly-recap-email': {
      return {
        cronId: id,
        cronName: cron.name,
        recipients: [{ email: 'info@workforceap.org', name: 'WorkforceAP Admin' }],
        count: 1,
        truncated: false,
        note: 'Sends aggregated stats to the internal admin team, not individual members.',
      };
    }

    case 'partner-outcome-digest': {
      const partners = await prisma.$transaction((tx) => tx.partner.findMany({
        where: { ...orgFilter, active: true, notifyOnEnrollment: true },
        select: { name: true, contactEmail: true },
        take: PREVIEW_LIMIT + 1,
      }));
      const withEmail = partners.filter(p => p.contactEmail?.trim());
      const truncated = withEmail.length > PREVIEW_LIMIT;
      const recipients = withEmail.slice(0, PREVIEW_LIMIT).map(p => ({ email: p.contactEmail!, name: p.name }));
      return { cronId: id, cronName: cron.name, recipients, count: recipients.length, truncated,
        note: `${partners.length - withEmail.length > 0 ? `${partners.length - withEmail.length} partner(s) have no contact email and will be skipped.` : ''}`.trim() || undefined,
      };
    }

    case 'milestone-celebration': {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const members = await prisma.$transaction((tx) => tx.user.findMany({
        where: {
          ...orgFilter,
          deletedAt: null,
          enrolledProgram: { not: null },
          assessmentCompleted: true,
          assessmentCompletedAt: { gte: yesterday },
        },
        select: { email: true, fullName: true },
        take: PREVIEW_LIMIT + 1,
      }));
      const truncated = members.length > PREVIEW_LIMIT;
      const recipients = members.slice(0, PREVIEW_LIMIT).map(m => ({ email: m.email ?? '', name: m.fullName }));
      return { cronId: id, cronName: cron.name, recipients, count: recipients.length, truncated };
    }

    default:
      return { cronId: id, cronName: cron?.name ?? id, recipients: [], count: 0, truncated: false, note: 'No preview available for this job.' };
  }
}
