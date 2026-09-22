'use client';

import { useCallback, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { statusLabel } from '@/lib/employer/statusLabel';
import { employerJobStatusLabel } from '@/lib/employer/jobStatusDisplay';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/portal/ui/DataTable';

interface Metrics {
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  newApplications: number;
  reviewedApplications: number;
  hiredApplications: number;
  rejectedApplications: number;
  conversionRate: number;
}

interface Job {
  id: string;
  title: string;
  status: string;
  applications: number;
}

interface ProgramStat {
  name: string;
  applications: number;
  hired: number;
  conversionRate: number;
}

interface EmployerOutcomesData {
  employer: {
    companyName: string;
    hiringPipelineActive: boolean;
  };
  metrics: Metrics;
  jobs: Job[];
  programStats: ProgramStat[];
}

export default function EmployerOutcomesDashboard() {
  const tCommon = useTranslations('common');
  const [data, setData] = useState<EmployerOutcomesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/employer/outcomes');
      if (!res.ok) {
        throw new Error(`Failed to load: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Failed to load outcomes' }, 'employer-outcomes'));
    } finally {
      setLoading(false);
    }
  }, [tCommon]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="wa-flex wa-items-center wa-justify-center wa-h-64">
        <div className="wa-text-slate-500">Loading hiring outcomes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-portal-error-state="employer-outcomes-load" className="wa-rounded-lg wa-bg-red-50 wa-border wa-border-red-200 wa-p-4 wa-text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return <div data-portal-error-state="employer-outcomes-empty-response" />;

  const { employer, metrics, jobs, programStats } = data;

  return (
    <div className="wa-space-y-8">
      <div className="wa-flex wa-items-center wa-justify-between">
        <div>
          <h1 className="wa-text-2xl wa-font-bold wa-text-slate-900">
            {employer.companyName} — Hiring Outcomes
          </h1>
          <p className="wa-text-slate-500 wa-mt-1">
            Pipeline effectiveness and conversion metrics
          </p>
        </div>
        <Button onClick={fetchData} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Pipeline Status */}
      {!employer.hiringPipelineActive && (
        <div className="wa-rounded-lg wa-bg-amber-50 wa-border wa-border-amber-200 wa-p-4 wa-text-amber-800">
          Your hiring pipeline is currently inactive. 
          <a href="/employer/loi" className="wa-underline wa-font-medium wa-ml-1">
            Submit a Letter of Intent
          </a> to activate partnerships.
        </div>
      )}

      {/* Key Metrics */}
      <div className="wa-grid wa-gap-4 md:wa-grid-cols-2 lg:wa-grid-cols-4">
        <Card className="wa-p-6">
          <div className="wa-text-sm wa-text-slate-500">Total Jobs</div>
          <div className="wa-text-3xl wa-font-bold wa-text-slate-900 wa-mt-1">
            {metrics.totalJobs}
          </div>
        </Card>
        <Card className="wa-p-6">
          <div className="wa-text-sm wa-text-slate-500">Active Jobs</div>
          <div className="wa-text-3xl wa-font-bold wa-text-blue-600 wa-mt-1">
            {metrics.activeJobs}
          </div>
        </Card>
        <Card className="wa-p-6">
          <div className="wa-text-sm wa-text-slate-500">Total Applications</div>
          <div className="wa-text-3xl wa-font-bold wa-text-slate-900 wa-mt-1">
            {metrics.totalApplications}
          </div>
        </Card>
        <Card className="wa-p-6">
          <div className="wa-text-sm wa-text-slate-500">Conversion Rate</div>
          <div className="wa-text-3xl wa-font-bold wa-text-emerald-600 wa-mt-1">
            {metrics.conversionRate}%
          </div>
          <div className="wa-text-xs wa-text-slate-400 wa-mt-1">
            {metrics.hiredApplications} hired / {metrics.totalApplications} applied
          </div>
        </Card>
      </div>

      {/* Application Funnel */}
      <Card className="wa-p-6">
        <h2 className="wa-text-lg wa-font-bold wa-text-slate-900 wa-mb-4">Application Funnel</h2>
        <div className="wa-grid wa-gap-4 md:wa-grid-cols-5">
          {[
            { label: 'New', value: metrics.newApplications, color: 'wa-bg-slate-100 wa-text-slate-700' },
            { label: 'Reviewed', value: metrics.reviewedApplications, color: 'wa-bg-blue-100 wa-text-blue-700' },
            { label: 'Hired', value: metrics.hiredApplications, color: 'wa-bg-emerald-100 wa-text-emerald-700' },
            { label: 'Rejected', value: metrics.rejectedApplications, color: 'wa-bg-red-100 wa-text-red-700' },
          ].map((stage) => (
            <div key={stage.label} className={`wa-rounded-lg wa-p-4 wa-text-center ${stage.color}`}>
              <div className="wa-text-2xl wa-font-bold">{stage.value}</div>
              <div className="wa-text-sm">{stage.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Jobs Table */}
      <Card className="wa-p-6">
        <h2 className="wa-text-lg wa-font-bold wa-text-slate-900 wa-mb-4">Job Postings</h2>
        <DataTable
          columns={[
            { key: 'title', header: 'Title', cell: (job) => <span className="wa-font-medium wa-text-slate-900">{job.title}</span> },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              cell: (job) => (
                <span className={`wa-inline-flex wa-px-2 wa-py-1 wa-rounded-full wa-text-xs wa-font-medium ${
                  job.status === 'live' ? 'wa-bg-emerald-100 wa-text-emerald-700' :
                  job.status === 'filled' ? 'wa-bg-blue-100 wa-text-blue-700' :
                  'wa-bg-slate-100 wa-text-slate-700'
                }`}>
                  {employerJobStatusLabel(job.status)}
                </span>
              ),
            },
            { key: 'applications', header: 'Applications', align: 'right', cell: (job) => <span className="wa-text-slate-600">{job.applications}</span> },
          ]}
          rows={jobs}
          rowKey={(job) => job.id}
          density="compact"
          variant="portal"
          emptyState={<p className="wa-text-sm wa-text-slate-500 wa-py-4">No job postings yet.</p>}
        />
      </Card>

      {/* Program Stats */}
      <Card className="wa-p-6">
        <h2 className="wa-text-lg wa-font-bold wa-text-slate-900 wa-mb-4">Program Effectiveness</h2>
        <p className="wa-text-sm wa-text-slate-500 wa-mb-4">
          Which training programs produce the best candidates for your roles
        </p>
        <DataTable
          columns={[
            { key: 'name', header: 'Program', cell: (p) => <span className="wa-font-medium wa-text-slate-900">{p.name}</span> },
            { key: 'applications', header: 'Applications', align: 'right', cell: (p) => <span className="wa-text-slate-600">{p.applications}</span> },
            { key: 'hired', header: 'Hired', align: 'right', cell: (p) => <span className="wa-text-slate-600">{p.hired}</span> },
            {
              key: 'conversionRate',
              header: 'Conversion %',
              align: 'right',
              cell: (p) => (
                <span className={`wa-inline-flex wa-px-2 wa-py-1 wa-rounded-full wa-text-xs wa-font-medium ${
                  p.conversionRate >= 50 ? 'wa-bg-emerald-100 wa-text-emerald-700' :
                  p.conversionRate >= 25 ? 'wa-bg-amber-100 wa-text-amber-700' :
                  'wa-bg-red-100 wa-text-red-700'
                }`}>
                  {p.conversionRate}%
                </span>
              ),
            },
          ]}
          rows={programStats}
          rowKey={(p) => p.name}
          density="compact"
          variant="portal"
          emptyState={<p className="wa-text-sm wa-text-slate-500 wa-py-4">No program data yet.</p>}
        />
      </Card>
    </div>
  );
}
