'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

type Props = {
  data: { range: string; count: number }[];
};

const COLORS = [
  'var(--color-accent)',
  'var(--color-gold)',
  'var(--color-blue)',
  'var(--color-green)',
];

export default function ProgressDistributionChart({ data }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: '0.875rem',
        padding: '1.25rem',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <h3
        style={{
          fontSize: '0.9rem',
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          margin: '0 0 1rem',
        }}
      >
        Progress Distribution
      </h3>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="range"
              tick={{ fontSize: 13, fill: 'var(--color-on-surface-variant)' }}
              axisLine={{ stroke: 'var(--outline-variant)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 13, fill: 'var(--color-on-surface-variant)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--color-accent) 6%, transparent)' }}
              contentStyle={{
                background: 'var(--surface-container-high)',
                border: '1px solid var(--outline-variant)',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                color: 'var(--color-on-surface)',
              }}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
