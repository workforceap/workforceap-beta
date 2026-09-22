import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDate } from '@/lib/formatDate';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { StatusTag } from '@/components/portal/kit';
import { badgeVariantToKitTone } from '@/lib/ui/statusToneAdapters';
import {
  employerJobPostingApplicationStatusBadgeVariant,
  employerJobPostingApplicationStatusLabel,
} from '@/lib/employer/jobPostingApplicationStatus';
import PortalCard from '@/components/portal/ui/PortalCard';
import ApplicationStatusUpdater from '@/components/employer/ApplicationStatusUpdater';
import { programDisplayTitle } from '@/lib/content/programTitle';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadata({
    title: t('applicationReviewMetaTitle'),
    description: t('applicationReviewMetaDesc'),
    path: '/employer/applications',
  });
}

export default async function EmployerApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/applications');

  const superAdmin = await isSuperAdmin(user.id);
  const ctx = await getEmployerForUser(user.id, { isSuperAdminHint: superAdmin });
  if (!ctx) {
    redirect(await unlinkedEmployerHref(user.id));
  }

  const { id } = await params;

  const application = await prisma.jobPostingApplication.findFirst({
    where: {
      id,
      job: { employerId: ctx.employerId },
    },
    include: {
      job: {
        select: { id: true, title: true, employerId: true },
      },
      student: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          enrolledProgram: true,
          profile: {
            select: {
              profileLinkedin: true,
              profileBio: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { fullName: true, id: true } },
        },
      },
    },
  });

  if (!application) redirect('/employer');

  const t = await getTranslations('employer');
  const candidateName = application.student.fullName ?? t('candidate');

  return (
    <PortalPageFrame maxWidth="64rem">
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={candidateName}
        subtitle={t('applyingForJob', { title: application.job.title })}
        action={
          <Link href="/employer/applications" className="btn btn-outline btn-sm">
            {t('backToApplicants')}
          </Link>
        }
      />

      <div
        className="portal-pad-x"
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '2rem' }}
      >
        {/* Status Card */}
        <PortalCard className="portal-card--flat">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                Current Status
              </p>
              <StatusTag tone={badgeVariantToKitTone(employerJobPostingApplicationStatusBadgeVariant(application.status))}>
                {employerJobPostingApplicationStatusLabel(application.status)}
              </StatusTag>
            </div>
            <ApplicationStatusUpdater applicationId={application.id} currentStatus={application.status} />
          </div>
        </PortalCard>

        {/* Applicant Info */}
        <PortalCard className="portal-card--flat">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Applicant Details</h3>
          <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</span>
              <p style={{ margin: '0.125rem 0 0' }}>{application.student.email}</p>
            </div>
            {application.student.phone && (
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</span>
                <p style={{ margin: '0.125rem 0 0' }}>{application.student.phone}</p>
              </div>
            )}
            {application.student.enrolledProgram && (
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Program</span>
                <p style={{ margin: '0.125rem 0 0' }}>{programDisplayTitle(application.student.enrolledProgram)}</p>
              </div>
            )}
            {application.student.profile?.profileLinkedin && (
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>LinkedIn</span>
                <p style={{ margin: '0.125rem 0 0' }}>
                  <a href={application.student.profile.profileLinkedin} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wa-accent-text)' }}>
                    View Profile
                  </a>
                </p>
              </div>
            )}
            {application.student.profile?.profileBio && (
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bio</span>
                <p style={{ margin: '0.125rem 0 0', lineHeight: 1.5 }}>{application.student.profile.profileBio}</p>
              </div>
            )}
            {application.resumePath && (
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resume</span>
                <p style={{ margin: '0.125rem 0 0' }}>
                  <a
                    href={`/api/employer/applications/${encodeURIComponent(application.id)}/resume`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--wa-accent-text)' }}
                  >
                    Download Resume
                  </a>
                </p>
              </div>
            )}
          </div>
        </PortalCard>

        {/* Employer Notes */}
        <PortalCard className="portal-card--flat">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Employer Notes</h3>
          {application.employerNotes ? (
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{application.employerNotes}</p>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>No notes yet — add context in the admin panel whenever you're ready.</p>
          )}
        </PortalCard>

        {/* Message History */}
        {application.messages.length > 0 && (
          <PortalCard className="portal-card--flat">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Message History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {application.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    background: msg.authorId === user.id ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'var(--surface-container)',
                    border: `1px solid ${msg.authorId === user.id ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--outline-variant)'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{msg.author?.fullName ?? 'User'}</span>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      {formatPortalDate(msg.createdAt)}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>{msg.body}</p>
                </div>
              ))}
            </div>
          </PortalCard>
        )}
      </div>
    </PortalPageFrame>
  );
}
