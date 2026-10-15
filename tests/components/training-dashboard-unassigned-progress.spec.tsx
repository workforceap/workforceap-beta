import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AdminTrainingDashboardTable from '@/components/admin/AdminTrainingDashboardTable';
import type { TrainingDashboardRow } from '@/lib/admin/trainingDashboard';
afterEach(cleanup);

const observedRow = (activity: TrainingDashboardRow['observedActivity']): TrainingDashboardRow => ({
  id: 'synthetic', fullName: 'Synthetic Learner', email: 'learner@learners.invalid', phone: null,
  enrolledProgram: 'comptia-a-professional-certificate', programTitle: 'CompTIA A+', enrolledAt: null,
  progressPercent: 0, completedCount: 0, totalCourses: 0, activeCourseCount: 0,
  lastTrainingActivityAt: null, staleTrainingDetectedAt: null, partnerName: null, counselorName: null,
  careerPlanSignal: null, programSlugsAll: ['comptia-a-professional-certificate'], noProgram: true, observedActivity: activity,
});

describe('unassigned recorded activity in training reporting', () => {
  it('keeps actual records visible while the assigned denominator and percentage remain unknown', () => {
    const row = observedRow({ completedRecords: 2, activeRecords: 1 });
    render(<AdminTrainingDashboardTable rows={[row]} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by training status' }), { target: { value: 'needs_assignment' } });
    expect(screen.getByRole('link', { name: 'Synthetic Learner' })).toHaveAttribute('href', '/admin/members/synthetic');
    expect(screen.getByText('Assigned curriculum progress unavailable')).toBeVisible();
    expect(screen.getByText('2 recorded completions · 1 active record')).toBeVisible();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText(/0\/0 complete/)).not.toBeInTheDocument();
  });
  it('shows a positive saved rollup separately and omits empty course-record counts', () => {
    render(<AdminTrainingDashboardTable rows={[observedRow({ completedRecords: 0, activeRecords: 0, rollup: { coursesCompleted: 5, averagePercent: 60 } })]} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by training status' }), { target: { value: 'needs_assignment' } });
    expect(screen.getByText('Assigned curriculum progress unavailable')).toBeVisible();
    expect(screen.getByText('Saved program rollup (unverified): 5 reported completions · 60% reported')).toBeVisible();
    expect(screen.queryByText(/0 recorded completions/)).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
  it('keeps individual course records and a saved rollup distinct instead of summing them', () => {
    render(<AdminTrainingDashboardTable rows={[observedRow({ completedRecords: 2, activeRecords: 1, rollup: { coursesCompleted: 5, averagePercent: 60 } })]} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by training status' }), { target: { value: 'needs_assignment' } });
    expect(screen.getByText('2 recorded completions · 1 active record')).toBeVisible();
    expect(screen.getByText('Saved program rollup (unverified): 5 reported completions · 60% reported')).toBeVisible();
    expect(screen.queryByText(/7 recorded/)).not.toBeInTheDocument();
  });

});
