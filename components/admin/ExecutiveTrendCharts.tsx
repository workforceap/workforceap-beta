'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

type TrendDatum = { week: string; count: number };

type Props = {
  signupData: TrendDatum[];
  enrollmentData: TrendDatum[];
  viewData: TrendDatum[];
};

export default function ExecutiveTrendCharts({ signupData, enrollmentData, viewData }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}
    >
      {/* Signups */}
      <div style={{ background: 'var(--surface-container-low)', borderRadius: 12, padding: '1rem', border: '1px solid var(--outline-variant)' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Member Signups</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={signupData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" />
              <XAxis dataKey="week" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 13 }} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Enrollments */}
      <div style={{ background: 'var(--surface-container-low)', borderRadius: 12, padding: '1rem', border: '1px solid var(--outline-variant)' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Program Enrollments</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrollmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" />
              <XAxis dataKey="week" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 13 }} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--color-green)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dashboard views */}
      <div style={{ background: 'var(--surface-container-low)', borderRadius: 12, padding: '1rem', border: '1px solid var(--outline-variant)' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Dashboard Views</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={viewData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" />
              <XAxis dataKey="week" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 13 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="var(--color-blue)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
