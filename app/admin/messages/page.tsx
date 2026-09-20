import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { countUnansweredMemberThreads, getSlaStatusForThreads } from '@/lib/messages/superAdminMessageQueries';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import AdminSuperMessagesClient from '@/components/admin/AdminSuperMessagesClient';
import {
  MessagesKit,
  type MessageThread,
} from '@/components/portal/kit/pages/admin-subviews/MessagesKit';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Portal messages (super admin)',
  description: 'Member, employer, and partner message threads with WorkforceAP staff.',
  path: '/admin/messages',
});
}

/** Compact relative-time caption, e.g. "2h ago" / "3d ago". */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Load the member ↔ staff threads for the kit's read table. Mirrors the
 * default ("member") inbox of the legacy /api/admin/messages/threads loader:
 * member-kind threads that have at least one message, newest activity first.
 * Re-establishes the auth GUC context because RSC renders outside the root
 * layout's gucContextStorage scope (otherwise prisma runs with anonymous RLS).
 */
async function loadMemberThreads(): Promise<MessageThread[]> {
  return withAuthGuc(async () => {
    const threads = await prisma.messageThread.findMany({
      where: { kind: 'member', member: { deletedAt: null }, messages: { some: {} } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        updatedAt: true,
        member: { select: { fullName: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          select: { body: true, createdAt: true },
        },
      },
    });

    // SLA tells us whether the latest member message is still awaiting a staff
    // reply — that maps to the kit's "unread" (staff-action-needed) flag.
    const slaMap = await getSlaStatusForThreads(threads.map((t) => t.id));

    return threads.map((t): MessageThread => {
      const last = t.messages[0];
      const from = t.member?.fullName?.trim() || t.member?.email || 'Unknown member';
      const subject = last
        ? last.body.length > 80
          ? `${last.body.slice(0, 77)}…`
          : last.body
        : 'No messages yet';
      const lastActiveDate = last?.createdAt ?? t.updatedAt;
      return {
        id: t.id,
        from,
        subject,
        // The data model has no per-thread channel; member ↔ counselor threads
        // are the in-app portal inbox, so they're all In-app.
        channel: 'In-app',
        unread: slaMap.get(t.id)?.needsCounselorReply ?? false,
        lastActive: relativeTime(lastActiveDate),
      };
    });
  });
}

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/messages');
  if (!(await isSuperAdmin(user.id))) redirect('/admin');

  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;

  // Redesigned kit is now the DEFAULT; the legacy interactive inbox is still
  // available at ?ui=legacy. Runs AFTER the auth/isSuperAdmin guard above so
  // access control is preserved. MessagesKit is a pure read table, so it's safe
  // to promote as long as the data is real (it is — loaded from prisma below).
  if (requestedUi !== 'legacy') {
    try {
      const [threads, unansweredCount] = await Promise.all([
        loadMemberThreads(),
        // Staff-facing unanswered count (WAP-168 fix 3): counts every member
        // thread awaiting a staff reply, not just the 30 rows shown below.
        withAuthGuc(() => countUnansweredMemberThreads()),
      ]);
      return <MessagesKit threads={threads} unansweredCount={unansweredCount} />;
    } catch (err) {
      console.error('[admin/messages] failed to load member threads:', err);
      return <AdminDataLoadError title="Could not load messages" />;
    }
  }

  return <AdminSuperMessagesClient />;
}
