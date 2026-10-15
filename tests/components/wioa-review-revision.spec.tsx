import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminMemberWioaReviewPanel from '@/components/admin/AdminMemberWioaReviewPanel';
import CounselorIntakeReviewPanel from '@/components/counselor/CounselorIntakeReviewPanel';
import type { WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import type { ApplyWioaReviewScreeningDto } from '@/lib/wioa/reviewEvidence';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.fn<typeof fetch>();
const initialReviewedAt = '2026-09-18T12:00:00.000Z';
const nextReviewedAt = '2026-09-19T12:00:00.000Z';
const snapshot: WioaQualificationSnapshot = {
  version: 1, submittedAt: '2026-09-01T00:00:00Z', signal: 'likely', reasons: ['Staff review needed'],
  answers: { ageBracket: '25_54', countyOrZip: '30301', primaryBarrier: 'none', dislocatedWorker: false, lowIncomeSelfReport: false, trainingInterest: true, completedIntakeSelfReport: true },
};

function show(role: 'admin' | 'counselor') {
  if (role === 'admin') {
    render(<AdminMemberWioaReviewPanel memberId="member-1" snapshot={snapshot} reviewStatus="pending" reviewedAt={initialReviewedAt} reviewerName="Reviewer" reviewNotes={null} decisionHistory={[]} />);
    return 'Save review';
  }
  render(<CounselorIntakeReviewPanel memberId="member-1" applications={[]} wioa={{ hasScreening: true, submittedAt: snapshot.submittedAt, reviewStatus: 'pending', reviewedAt: initialReviewedAt, reviewNotes: null }} />);
  return 'Save intake status';
}

beforeEach(() => { fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each(['admin', 'counselor'] as const)('%s WIOA review revision', (role) => {
  it('sends the loaded screening and review revision, then advances only to a saved review revision', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, wioaReviewedAt: nextReviewedAt }));
    const label = show(role);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({ expectedSubmittedAt: snapshot.submittedAt, expectedReviewedAt: initialReviewedAt });
    await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeEnabled());
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, wioaReviewedAt: nextReviewedAt }));
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toMatchObject({ expectedSubmittedAt: snapshot.submittedAt, expectedReviewedAt: nextReviewedAt });
  });

  it('retains review notes and the original revision after a conflict without retrying automatically', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Reload and review the latest submission before saving.' }, { status: 409 }));
    const label = show(role);
    fireEvent.change(screen.getByRole('textbox', { name: 'Internal notes' }), { target: { value: 'Documents checked' } });
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload and review');
    expect(screen.getByRole('textbox', { name: 'Internal notes' })).toHaveValue('Documents checked');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Reload and review the latest submission before saving.' }, { status: 409 }));
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toMatchObject({ expectedReviewedAt: initialReviewedAt, notes: 'Documents checked' });
  });
});

it('labels enrollment funding evidence as a human-readable decision source', () => {
  render(<AdminMemberWioaReviewPanel memberId="member-1" snapshot={snapshot} reviewStatus="pending" reviewedAt={null} reviewerName={null} reviewNotes={null} decisionHistory={[
    { id: 'snapshot-1', source: 'enrollment_funding', decision: 'GRANT', notes: null, actorEmailSnapshot: null, actorRoleSnapshot: 'admin', createdAt: new Date(nextReviewedAt) },
  ]} />);
  expect(screen.getByText('Enrollment funding decision: GRANT')).toBeInTheDocument();
});

describe.each(['admin', 'counselor'] as const)('%s review of application screening', (role) => {
  it('shows partial source answers and submits the loaded evidence revision without inventing a questionnaire', async () => {
    const screening: ApplyWioaReviewScreeningDto = {
      id: 'apply-1', organizationId: 'org-1', createdAt: '2026-09-01T00:00:00.000Z',
      q1: null, q2: null, q3: null, qualifies: true, yesCount: 0,
      receivingUnemployment: 'yes', exhaustedUnemployment: null, layoffCompany: null,
      snapWic: 'yes', publicAssistancePrograms: ['wic'], publicAssistanceHelpRequested: 'yes',
    };
    const revision = 'a'.repeat(64);
    fetchMock.mockResolvedValue(Response.json({ ok: true, wioaReviewedAt: nextReviewedAt }));
    if (role === 'admin') {
      render(<AdminMemberWioaReviewPanel memberId="member-1" snapshot={null} applyScreening={screening}
        expectedEvidenceRevision={revision} expectedSubmittedAt={screening.createdAt}
        reviewStatus={null} reviewedAt={null} reviewerName={null} reviewNotes={null} decisionHistory={[]} />);
    } else {
      render(<CounselorIntakeReviewPanel memberId="member-1" applications={[]} wioa={{
        hasScreening: true, submittedAt: screening.createdAt, evidenceRevision: revision, applyScreening: screening,
        reviewStatus: null, reviewedAt: null, reviewNotes: null,
      }} />);
    }
    expect(screen.getByRole('region', { name: 'Application eligibility screening' })).toHaveTextContent('Unemployed or underemployed: Not answered');
    expect(screen.getByRole('region', { name: 'Application eligibility screening' })).toHaveTextContent('Receiving unemployment: Yes');
    expect(screen.queryByText('Portal signal:')).not.toBeInTheDocument();
    const label = role === 'admin' ? 'Save review' : 'Save intake status';
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({
      expectedSubmittedAt: screening.createdAt, expectedEvidenceRevision: revision, expectedReviewedAt: null,
    });
  });
});
