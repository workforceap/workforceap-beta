import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import EmployerOutcomesDashboard from '@/components/employer/EmployerOutcomesDashboard';

const payload = {
  employer: { companyName: 'Fixture Co', hiringPipelineActive: true },
  metrics: { totalJobs: 2, activeJobs: 1, totalApplications: 0, newApplications: 0, reviewedApplications: 0, hiredApplications: 0, rejectedApplications: 0, conversionRate: 0 },
  jobs: [
    { id: 'job-1', title: 'Fixture Live Role', status: 'live', applications: 0 },
    { id: 'job-2', title: 'Fixture Filled Role', status: 'filled', applications: 0 },
  ],
  programStats: [],
};

describe('EmployerOutcomesDashboard job status labels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('title-cases JobStatusEnum values instead of printing them raw', async () => {
    render(<EmployerOutcomesDashboard />);
    await waitFor(() => expect(screen.getByText('Fixture Live Role')).toBeInTheDocument());
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Filled')).toBeInTheDocument();
    expect(screen.queryByText('live')).toBeNull();
    expect(screen.queryByText('filled')).toBeNull();
  });
});
