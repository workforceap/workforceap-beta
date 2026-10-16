import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import PlacementSurveysWhatsThis from '@/components/admin/PlacementSurveysWhatsThis';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import { ClipboardCheck, Star, Users, MessageSquare, TrendingUp, Clock } from 'lucide-react';
import {
  PlacementSurveysKit,
  type PlacementSurveyRow,
} from '@/components/portal/kit/pages/admin-subviews/PlacementSurveysKit';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { CONFIRMED_PROGRAM_ENROLLMENTS_SELECT, resolveConfirmedProgramAssignment } from '@/lib/member/confirmedProgramAssignment';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Placement surveys',
    description: 'Post-placement survey results and statistics.',
    path: '/admin/placement-surveys',
  });
}

/** Survey wave → display stage label (mockup uses "30-day" / "90-day"). */
const WAVE_LABEL: Record<string, string> = {
  thirty_day: '30-day',
  sixty_day: '60-day',
  ninety_day: '90-day',
  hundred_eighty_day: '180-day',
};

function waveLabel(wave: string): string {
  return WAVE_LABEL[wave] ?? wave.replace(/_/g, ' ');
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadSurveyStats(scope: import("@/lib/tenant/adminPageScope").AdminPageTenantOk) {
  try {
    const userOrg = inheritUserOrg(scope);
    const [
      surveys,
      total,
      completedCount,
      pendingCount,
      stillEmployedCount,
      testimonialCount,
      avgJobSatisfactionAgg,
      avgTrainingRelevanceAgg,
    ] = await withAdminPageScope(scope, (db) => Promise.all([
      db.placementSurvey.findMany({
        where: { sentAt: { not: null }, ...userOrg },
        orderBy: { sentAt: 'desc' },
        take: 100,
        select: {
          id: true,
          wave: true,
          sentAt: true,
          completedAt: true,
          stillEmployed: true,
          jobSatisfaction: true,
          trainingRelevance: true,
          supportQuality: true,
          allowTestimonial: true,
          user: {
            select: { fullName: true, email: true, enrolledProgram: true, courseEnrollments: CONFIRMED_PROGRAM_ENROLLMENTS_SELECT },
          },
        },
      }),
      db.placementSurvey.count({ where: { sentAt: { not: null }, ...userOrg } }),
      db.placementSurvey.count({ where: { sentAt: { not: null }, completedAt: { not: null }, ...userOrg } }),
      db.placementSurvey.count({ where: { sentAt: { not: null }, completedAt: null, ...userOrg } }),
      db.placementSurvey.count({
        where: { completedAt: { not: null }, stillEmployed: true, ...userOrg },
      }),
      db.placementSurvey.count({
        where: { completedAt: { not: null }, allowTestimonial: true, ...userOrg },
      }),
      db.placementSurvey.aggregate({
        where: { completedAt: { not: null }, ...userOrg },
        _avg: { jobSatisfaction: true },
      }),
      db.placementSurvey.aggregate({
        where: { completedAt: { not: null }, ...userOrg },
        _avg: { trainingRelevance: true },
      }),
    ]));

    return {
      total,
      surveys: surveys.map((survey) => ({
        ...survey,
        currentProgramSlug: survey.user ? resolveConfirmedProgramAssignment(survey.user).programSlug : null,
      })),
      stats: {
        completed: completedCount,
        pending: pendingCount,
        stillEmployed: stillEmployedCount,
        avgJobSatisfaction: avgJobSatisfactionAgg._avg.jobSatisfaction
          ? Math.round(avgJobSatisfactionAgg._avg.jobSatisfaction * 10) / 10
          : null,
        avgTrainingRelevance: avgTrainingRelevanceAgg._avg.trainingRelevance
          ? Math.round(avgTrainingRelevanceAgg._avg.trainingRelevance * 10) / 10
          : null,
        testimonialCount,
      },
    };
  } catch {
    return null;
  }
}

export default async function PlacementSurveysPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  const data = await loadSurveyStats(scope);
  if (!data) {
    return <AdminDataLoadError title="Could not load placement surveys" />;
  }
  const stats = data?.stats;
  const surveys = data?.surveys ?? [];

  // --- LEGACY: original stats grid + responses table (escape hatch) ---
  if (requestedUi === 'legacy') {
    return (
      <PortalPageFrame>
        <PageHeader title="Placement Surveys" subtitle="Post-placement member feedback and outcomes" />

        <PlacementSurveysWhatsThis />

        {/* Stats cards */}
        <div className="wa-grid wa-grid-cols-2 md:wa-grid-cols-3 lg:wa-grid-cols-6 wa-gap-4 wa-mb-8">
          <StatCard
            label="Total Sent"
            value={data?.total ?? 0}
            icon={<Users className="wa-w-5 wa-h-5" />}
          />
          <StatCard
            label="Completed"
            value={stats?.completed ?? 0}
            icon={<ClipboardCheck className="wa-w-5 wa-h-5" />}
          />
          <StatCard
            label="Pending"
            value={stats?.pending ?? 0}
            icon={<Clock className="wa-w-5 wa-h-5" />}
          />
          <StatCard
            label="Avg Satisfaction"
            value={stats?.avgJobSatisfaction ?? '—'}
            icon={<Star className="wa-w-5 wa-h-5" />}
          />
          <StatCard
            label="Avg Training"
            value={stats?.avgTrainingRelevance ?? '—'}
            icon={<TrendingUp className="wa-w-5 wa-h-5" />}
          />
          <StatCard
            label="Testimonials"
            value={stats?.testimonialCount ?? 0}
            icon={<MessageSquare className="wa-w-5 wa-h-5" />}
          />
        </div>

        {/* Survey responses table */}
        <div className="wa-bg-white wa-rounded-lg wa-shadow wa-overflow-hidden">
          <div className="wa-px-6 wa-py-4 wa-border-b">
            <h2 className="wa-text-lg wa-font-semibold">Recent Responses</h2>
          </div>
          {surveys.length === 0 ? (
            <div className="wa-px-6 wa-py-12 wa-text-center wa-text-gray-500">
              No survey responses yet.
            </div>
          ) : (
            <div className="wa-overflow-x-auto">
              <table className="wa-w-full wa-text-sm">
                <thead className="wa-bg-gray-50">
                  <tr>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-left wa-font-medium wa-text-gray-600">Member</th>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-left wa-font-medium wa-text-gray-600">Program</th>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-center wa-font-medium wa-text-gray-600">Satisfaction</th>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-center wa-font-medium wa-text-gray-600">Training</th>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-center wa-font-medium wa-text-gray-600">Support</th>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-center wa-font-medium wa-text-gray-600">Employed</th>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-center wa-font-medium wa-text-gray-600">Testimonial</th>
                    <th scope="col" className="wa-px-4 wa-py-3 wa-text-left wa-font-medium wa-text-gray-600">Completed</th>
                  </tr>
                </thead>
                <tbody className="wa-divide-y">
                  {surveys.map((s) => (
                    <tr key={s.id} className="hover:wa-bg-gray-50">
                      <td className="wa-px-4 wa-py-3">
                        <div className="wa-font-medium">{s.user?.fullName ?? '—'}</div>
                        <div className="wa-text-gray-500 wa-text-xs">{s.user?.email ?? '—'}</div>
                      </td>
                      <td className="wa-px-4 wa-py-3 wa-text-gray-600">{s.currentProgramSlug ? programDisplayTitle(s.currentProgramSlug) : '—'}</td>
                      <td className="wa-px-4 wa-py-3 wa-text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {s.jobSatisfaction ? (
                          <span className="wa-inline-flex wa-items-center wa-gap-1">
                            {s.jobSatisfaction} <Star className="wa-w-3 wa-h-3 wa-text-amber-500 wa-fill-amber-500" />
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="wa-px-4 wa-py-3 wa-text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {s.trainingRelevance ?? '—'}
                      </td>
                      <td className="wa-px-4 wa-py-3 wa-text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {s.supportQuality ?? '—'}
                      </td>
                      <td className="wa-px-4 wa-py-3 wa-text-center">
                        {s.stillEmployed === true ? (
                          <span className="wa-text-green-600 wa-font-medium">Yes</span>
                        ) : s.stillEmployed === false ? (
                          <span className="wa-text-red-600">No</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="wa-px-4 wa-py-3 wa-text-center">
                        {s.allowTestimonial ? (
                          <span className="wa-text-green-600">✓</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="wa-px-4 wa-py-3 wa-text-gray-500 wa-text-xs">
                        {s.completedAt
                          ? new Date(s.completedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'Pending'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PortalPageFrame>
    );
  }

  // --- DEFAULT: design-kit follow-up tracking ---

  const sent = data?.total ?? 0;
  const completed = stats?.completed ?? 0;
  const stillEmployed = stats?.stillEmployed ?? 0;

  const responseRate = sent > 0 ? `${Math.round((completed / sent) * 100)}%` : '—';
  const stillEmployedRate =
    completed > 0 ? `${Math.round((stillEmployed / completed) * 100)}%` : '—';

  const rows: PlacementSurveyRow[] = surveys.map((s) => ({
    id: s.id,
    student: s.user?.fullName?.trim() || '—',
    stage: waveLabel(s.wave),
    // The query excludes pre-acceptance rows; guard keeps the nullable schema
    // truthful even if a test double returns one.
    sent: s.sentAt ? shortDate(new Date(s.sentAt)) : '—',
    status: s.completedAt ? 'Complete' : 'Sent',
    stillEmployed:
      s.stillEmployed === true ? 'Yes' : s.stillEmployed === false ? 'No' : '—',
  }));

  return (
    <PlacementSurveysKit
      rows={rows}
      sent={sent}
      completed={completed}
      responseRate={responseRate}
      stillEmployedRate={stillEmployedRate}
    />
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="wa-bg-white wa-rounded-lg wa-shadow wa-p-4">
      <div className="wa-flex wa-items-center wa-gap-2 wa-text-gray-500 wa-mb-2">{icon}<span className="wa-text-xs wa-font-medium wa-uppercase">{label}</span></div>
      <div className="wa-text-2xl wa-font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
