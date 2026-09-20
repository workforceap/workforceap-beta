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

    render(<MemberProgressTimeline events={events} programAvgDays={90} />);
    expect(screen.getByText('Progress Timeline')).toBeInTheDocument();
    expect(screen.getByText('Enrollment')).toBeInTheDocument();
    expect(screen.getByText('Assessment')).toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();
    expect(screen.getByText('Certification')).toBeInTheDocument();
    expect(screen.getByText('Placement')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('3 of 5 stages complete')).toBeInTheDocument();
  });

  it('shows "On track" for durations under program average', () => {
    const events = [
      { stage: 'enrollment' as const, label: 'Enrollment', date: '2026-01-01T00:00:00Z', durationDays: 0, status: 'completed' as const },
      { stage: 'assessment' as const, label: 'Assessment', date: '2026-01-03T00:00:00Z', durationDays: 2, status: 'completed' as const },
    ];

    render(<MemberProgressTimeline events={events} programAvgDays={30} />);
    expect(screen.getAllByText('On track').length).toBeGreaterThanOrEqual(1);
  });
});
