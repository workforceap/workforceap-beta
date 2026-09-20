import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MemberProgressTimeline from '@/components/portal/counselor/MemberProgressTimeline';

describe('MemberProgressTimeline', () => {
  it('renders timeline with all stages', () => {
    const events = [
      { stage: 'enrollment' as const, label: 'Enrollment', date: '2026-01-01T00:00:00Z', durationDays: 0, status: 'completed' as const },
      { stage: 'assessment' as const, label: 'Assessment', date: '2026-01-05T00:00:00Z', durationDays: 4, status: 'completed' as const },
      { stage: 'training' as const, label: 'Training', date: '2026-02-01T00:00:00Z', durationDays: 27, status: 'completed' as const },
      { stage: 'certification' as const, label: 'Certification', date: null, durationDays: null, status: 'in_progress' as const },
      { stage: 'placement' as const, label: 'Placement', date: null, durationDays: null, status: 'pending' as const },
    ];

    render(<MemberProgressTimeline events={events} />);
    expect(screen.getByText('Progress Timeline')).toBeInTheDocument();
    expect(screen.getByText('Enrollment')).toBeInTheDocument();
    expect(screen.getByText('Assessment')).toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();
    expect(screen.getByText('Certification')).toBeInTheDocument();
    expect(screen.getByText('Placement')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('3 of 5 stages complete')).toBeInTheDocument();
  });

  // The "Avg program: Nd" caption and the per-stage "On track / Slower than
  // avg" verdict it drove were removed: the number behind them was
  // 100 / mean(memberProgramProgress.average_percent) * 30 — a completion
  // percentage inverted into a day count (375d for software-dev, 1143d for
  // ai-practitioner), with no org, time-window or completion filter.
  it('shows no cohort-duration comparison', () => {
    const events = [
      { stage: 'enrollment' as const, label: 'Enrollment', date: '2026-01-01T00:00:00Z', durationDays: 0, status: 'completed' as const },
      { stage: 'assessment' as const, label: 'Assessment', date: '2026-01-03T00:00:00Z', durationDays: 2, status: 'completed' as const },
    ];

    render(<MemberProgressTimeline events={events} />);
    expect(screen.queryByText(/Avg program/)).toBeNull();
    expect(screen.queryByText('On track')).toBeNull();
    expect(screen.queryByText('Slower than avg')).toBeNull();
    // Real per-stage durations stay: they are measured, not derived.
    expect(screen.getByText(/2d/)).toBeInTheDocument();
  });
});
