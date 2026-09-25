import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { AgentInboxKit, type AgentInboxRow } from '@/components/portal/kit/pages/admin-subviews/AgentInboxKit';
import { AgentInboxClient, type CascadeCardWire } from '@/app/admin/agent-inbox/AgentInboxClient';

/**
 * WAP-193: approving and dismissing milestone cascades used to happen only on
 * /admin/agent-inbox?ui=legacy. The default kit page now renders the review
 * cards itself, so staff read (and can edit) each draft before approving.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const row: AgentInboxRow = {
  id: 'cascade-1',
  from: 'Test Learner',
  caption: 'learner@example.com',
  type: 'course completed · course-1',
  drafts: 1,
  when: 'Sep 24, 2026',
  expires: 'expires in 1h',
  urgency: 'alert',
};

const cascade: CascadeCardWire = {
  id: 'cascade-1', status: 'awaiting_approval', dispatch: null,
  userId: 'member-1', userFullName: 'Test Learner', userEmail: 'learner@example.com',
  milestoneType: 'course_completed', milestoneRef: 'course-1', programSlug: 'program-1',
  counselorBrief: 'Review this learner celebration.',
  drafts: [{ type: 'celebrate_milestone', channel: 'email', subject: 'Congratulations', body: 'Your first course is complete.', rationale: 'Verified course completion', confidence: 1 }],
  invalidDraftCount: 0, draftModel: null, draftPromptVersion: null, draftedAt: null,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
};

const kpis = { awaitingReview: 1, pendingDraft: 0, sent: 3, resolved: 2 };

describe('AgentInboxKit review slot', () => {
  it('renders the review cards on the default page and points Review & Send at them', () => {
    render(<AgentInboxKit rows={[row]} {...kpis} review={<AgentInboxClient cascades={[cascade]} />} />);

    const review = screen.getByRole('region', { name: 'Review and send' });
    expect(within(review).getByLabelText('Subject')).toHaveValue('Congratulations');
    expect(within(review).getByDisplayValue('Your first course is complete.')).toBeInTheDocument();
    expect(within(review).getByRole('button', { name: 'Approve & Send' })).toBeInTheDocument();

    for (const link of screen.getAllByRole('link', { name: /review/i })) {
      expect(link).toHaveAttribute('href', '#agent-inbox-review');
    }
  });

  it('falls back to the legacy review page without the slot', () => {
    render(<AgentInboxKit rows={[row]} {...kpis} />);
    expect(screen.queryByRole('region', { name: 'Review and send' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Review & Send' })).toHaveAttribute('href', '/admin/agent-inbox?ui=legacy');
  });
});
