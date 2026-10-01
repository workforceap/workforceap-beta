import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { buildFeedbackUserScope } from '@/app/api/admin/feedback/_feedbackScope';
import PageHeader from '@/components/portal/PageHeader';
import AdminFeedbackClient from '@/components/admin/AdminFeedbackClient';
import {
  FEEDBACK_PAGE_SIZE,
  feedbackFilterWhere,
  feedbackPageHref,
  parseFeedbackFilters,
  type FeedbackFilters,
} from '@/lib/admin/feedbackFilters';
import {
  FeedbackKit,
  type FeedbackRow,
  type FeedbackSentiment,
} from '@/components/portal/kit/pages/admin-subviews/FeedbackKit';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Member Feedback',
    description: 'View and analyze member feedback submissions.',
    path: '/admin/feedback',
  });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function sentimentOf(rating: number): FeedbackSentiment {
  if (rating >= 4) return 'Positive';
  if (rating === 3) return 'Neutral';
  return 'Critical';
}

const SUMMARY_FALLBACK = 'No comment left';

interface FeedbackKitData {
  feedback: FeedbackRow[];
  total: number;
  recent: number;
  critical: number;
  avgRating: string;
  /** Rows matching the URL filters (the table and pager). */
  matching: number;
}

const EMPTY_KIT_DATA: FeedbackKitData = {
  feedback: [],
  total: 0,
  recent: 0,
  critical: 0,
  avgRating: '—',
  matching: 0,
};

/**
 * Load feedback rows + KPI aggregates for the kit's read table. Reuses the
 * per-actor scope from the legacy API loader so tenant/counselor scoping and
 * RLS match exactly. Re-establishes the auth GUC because RSC renders outside
 * the root layout's gucContextStorage scope.
 */
async function loadFeedbackKitData(staffUserId: string, filters: FeedbackFilters): Promise<FeedbackKitData> {
  return withAuthGuc(async () => {
    const userScope = await buildFeedbackUserScope(staffUserId);
    if (userScope === null) return EMPTY_KIT_DATA;

    // KPIs describe the actor's whole scope; the table and pager follow the
    // URL filters on top of that same scope (WAP-193 slice 2).
    const where = userScope ? { user: userScope } : {};
    const filtered = { ...where, ...feedbackFilterWhere(filters) };
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [items, matching, total, recent, critical, agg] = await Promise.all([
      prisma.memberFeedback.findMany({
        where: filtered,
        orderBy: { createdAt: 'desc' },
        take: FEEDBACK_PAGE_SIZE,
        skip: (filters.page - 1) * FEEDBACK_PAGE_SIZE,
        include: { user: { select: { fullName: true, email: true } } },
      }),
      prisma.memberFeedback.count({ where: filtered }),
      prisma.memberFeedback.count({ where }),
      prisma.memberFeedback.count({
        where: { ...where, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.memberFeedback.count({ where: { ...where, rating: { lte: 2 } } }),
      prisma.memberFeedback.aggregate({ where, _avg: { rating: true } }),
    ]);

    const feedback: FeedbackRow[] = items.map((f) => {
      const memberName = f.user.fullName?.trim() || f.user.email || 'Unknown member';
      const summaryRaw = f.comment?.trim();
      const summary = summaryRaw
        ? summaryRaw.length > 120
          ? `${summaryRaw.slice(0, 117)}…`
          : summaryRaw
        : SUMMARY_FALLBACK;
      return {
        id: f.id,
        memberName,
        memberEmail: f.user.email ?? '',
        initials: initialsOf(memberName),
        summary,
        type: f.type,
        rating: f.rating,
        sentiment: sentimentOf(f.rating),
        submitted: f.createdAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      };
    });

    const avg = agg._avg.rating;
    return {
      feedback,
      total,
      recent,
      critical,
      avgRating: avg != null ? avg.toFixed(1) : '—',
      matching,
    };
  });
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/feedback');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // Redesigned kit is the DEFAULT, with the type/rating/date filters and
  // paging that used to exist only at ?ui=legacy (WAP-193 slice 2). The legacy
  // view stays reachable at ?ui=legacy. Runs AFTER the auth guard so access
  // control is preserved.
  if (requestedUi !== 'legacy') {
    const filters = parseFeedbackFilters(params);
    let feedbackLoadFailed = false;
    const { matching, ...data } = await loadFeedbackKitData(user.id, filters).catch((err) => {
      feedbackLoadFailed = true;
      console.error('[admin/feedback] failed to load feedback:', err);
      return EMPTY_KIT_DATA;
    });
    const lastPage = Math.max(1, Math.ceil(matching / FEEDBACK_PAGE_SIZE));
    return (
      <>
        {feedbackLoadFailed ? <span hidden data-portal-error-state="admin-feedback-load" /> : null}
        <FeedbackKit
          {...data}
          filters={{
            values: filters,
            matching,
            pageSize: FEEDBACK_PAGE_SIZE,
            prevHref: filters.page > 1 ? feedbackPageHref(filters, filters.page - 1) : null,
            nextHref: filters.page < lastPage ? feedbackPageHref(filters, filters.page + 1) : null,
          }}
        />
      </>
    );
  }

  return (
    <div className="admin-main-content">
      <PageHeader
        title="Member Feedback"
        subtitle="Review feedback from members on training, counselors, and the platform."
      />
      <AdminFeedbackClient />
    </div>
  );
}
