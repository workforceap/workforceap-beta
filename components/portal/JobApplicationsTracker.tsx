'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { JobApplication } from '@/types/job-application';
import JobApplicationForm from './JobApplicationForm';
import JobApplicationKanban from './JobApplicationKanban';
import ApplicationAiFeedbackPrompt from '@/components/portal/ApplicationAiFeedbackPrompt';
import type { RecentToolOption } from '@/components/portal/ApplicationAiFeedbackPrompt';
import { KitEmptyState } from '@/components/portal/kit';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';

interface JobApplicationsTrackerProps {
  userId: string;
}

export default function JobApplicationsTracker({ userId }: JobApplicationsTrackerProps) {
  void userId;
  const t = useTranslations('dashboard');
  const te = useTranslations('empty');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackPrompt, setFeedbackPrompt] = useState<{
    jobApplicationId: string;
    recentTools: RecentToolOption[];
  } | null>(null);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch('/api/member/job-applications');
        if (!res.ok) {
          const msg = await getErrorMessageFromResponse(res);
          setError(msg);
          return;
        }
        const data = await res.json();
        setApplications(data);
        setError(null);
      } catch {
        setError(t('jobApplicationsLoadError'));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchApplications();
  }, [t]);

  const handleAddApplication = async (formData: Partial<JobApplication>) => {
    try {
      setError(null);
      const res = await fetch('/api/member/job-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
        return;
      }

      const payload = await res.json();
      const newApp = (payload.application ?? payload) as JobApplication;
      setApplications([newApp, ...applications]);
      setIsModalOpen(false);
      setError(null);
      if (payload.promptAiFeedback && payload.recentTools?.length && newApp.id) {
        setFeedbackPrompt({
          jobApplicationId: newApp.id,
          recentTools: payload.recentTools as RecentToolOption[],
        });
      } else {
        setFeedbackPrompt(null);
      }
    } catch {
      setError(t('jobApplicationsAddError'));
    }
  };

  const handleUpdateApplication = async (id: string, updates: Partial<JobApplication>) => {
    try {
      setError(null);
      const res = await fetch(`/api/member/job-applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
        return;
      }

      const updated = await res.json();
      const nextApplication = updated.application ?? updated;
      setApplications(applications.map((app) => (app.id === id ? nextApplication : app)));
      setError(null);
    } catch {
      setError(t('jobApplicationsUpdateError'));
    }
  };

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-label={t('jobApplicationsLoading')}>
        <div className="wa-mb-6 wa-flex wa-justify-between wa-items-center">
          <div className="skeleton skeleton-text wa-h-6 wa-w-40" />
          <div className="skeleton skeleton-rounded wa-h-9 wa-w-36" />
        </div>
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 xl:wa-grid-cols-6 wa-gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wa-space-y-3">
              <div className="skeleton skeleton-text wa-h-8" />
              <div className="skeleton skeleton-rounded wa-h-24" />
              {i % 2 === 0 && <div className="skeleton skeleton-rounded wa-h-24" />}
            </div>
          ))}
        </div>
        <span className="wa-sr-only">{t('jobApplicationsLoading')}</span>
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div
          role="alert"
          className="wa-mb-6 wa-p-4"
          style={{
            borderRadius: 'var(--wa-radius-sm)',
            background: 'color-mix(in srgb, var(--wa-danger) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--wa-danger) 30%, transparent)',
            color: 'var(--wa-danger)',
            fontSize: 'var(--wa-type-body)',
          }}
        >
          {error}
        </div>
      ) : null}

      {feedbackPrompt ? (
        <ApplicationAiFeedbackPrompt
          jobApplicationId={feedbackPrompt.jobApplicationId}
          recentTools={feedbackPrompt.recentTools}
          onDone={() => setFeedbackPrompt(null)}
          onSkip={() => setFeedbackPrompt(null)}
        />
      ) : null}

      <div className="wa-mb-6 wa-flex wa-justify-between wa-items-center wa-gap-3" style={{ flexWrap: 'wrap' }}>
        <h2
          className="wa-font-semibold"
          style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', margin: 0 }}
        >
          {t('jobApplicationsCount', { count: applications.length })}
        </h2>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
        >
          {t('addApplication')}
        </button>
      </div>

      {isModalOpen ? (
        <JobApplicationForm onSubmit={handleAddApplication} onClose={() => setIsModalOpen(false)} />
      ) : null}

      {applications.length === 0 ? (
        <div className="wa-kit-card">
          <KitEmptyState
            kind="first"
            title={te('applications.title')}
            description={te('applications.body')}
            primaryAction={{ label: te('applications.add'), onClick: () => setIsModalOpen(true) }}
            secondaryAction={{ label: te('applications.action'), href: '/dashboard/jobs' }}
          />
        </div>
      ) : (
        <JobApplicationKanban applications={applications} onStatusChange={handleUpdateApplication} />
      )}
    </div>
  );
}
