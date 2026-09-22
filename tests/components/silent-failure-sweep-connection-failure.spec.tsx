/**
 * Repo-wide sweep of client actions that failed silently or threw unhandled.
 * Before the fix each handler below wrapped its request in
 * `try { … } finally { … }` with no `catch` (a TypeError from `fetch()` or a
 * SyntaxError from `res.json()` escaped as an unhandled rejection while the
 * control re-enabled and the person read nothing), and several also returned
 * on `!res.ok` without saying anything, so a server rejection looked like a
 * change that took.
 *
 * Each case asserts the translated `common.connectionError` sentence (never the
 * browser's raw text) in a `role="alert"` / `role="status"` slot, and that a
 * JSON `{ error }` sent on purpose still reaches the person.
 * Sibling of tests/components/employer-action-connection-failure.spec.tsx.
 */
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import MentorApplyForm from '@/app/mentor/apply/MentorApplyForm';
import EmployerPipelineClient from '@/components/employer/EmployerPipelineClient';
import EmployerApplicationsClient, { type EmployerApplicationRow } from '@/components/employer/EmployerApplicationsClient';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import EmployerJobsBoard, { type EmployerJobBoardItem } from '@/components/employer/EmployerJobsBoard';
import PartnerAttentionClient from '@/components/partner/PartnerAttentionClient';
import ElevatorPitchDeploymentLogger from '@/components/portal/tools/ElevatorPitchDeploymentLogger';
import AiResultRenderer from '@/components/portal/AiResultRenderer';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/LocalizedLink', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/analytics/events', () => ({
  trackEmployerJobAction: vi.fn(),
  trackEmployerBulkDelete: vi.fn(),
  trackEmployerImport: vi.fn(),
  trackFunnelEvent: vi.fn(),
}));
vi.mock('@/components/portal/EmployerApplicationChatClient', () => ({ default: () => null }));
vi.mock('@/components/portal/tools/SkillMapperRadar', () => ({ default: () => null }));

const CONNECTION_COPY = messages.common.connectionError;
const RAW_BROWSER_TEXT = /Failed to fetch|Unexpected token|not valid JSON/;

const fetchMock = vi.fn<typeof fetch>();
let consoleError: ReturnType<typeof vi.spyOn>;

/** What Chromium rejects with when the network drops during `fetch()`. */
const droppedConnection = () => new TypeError('Failed to fetch');
/** A proxy/platform HTML 500: `res.json()` rejects with the browser's SyntaxError. */
const htmlErrorPage = () =>
  new Response('<!doctype html><html><body><h1>500 Internal Server Error</h1></body></html>', {
    status: 500,
    headers: { 'content-type': 'text/html' },
  });
const serverMessage = (error: string, status = 409) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });
const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function withMessages(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      {ui}
    </NextIntlClientProvider>,
  );
}

async function expectAlert() {
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  return screen.getByRole('alert');
}

function expectConnectionCopy(el: HTMLElement) {
  expect(el).toHaveTextContent(CONNECTION_COPY);
  expect(el.textContent).not.toMatch(RAW_BROWSER_TEXT);
}

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MentorApplyForm', () => {
  function submitForm() {
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: 'Sample Mentor' } });
    fireEvent.change(screen.getByLabelText(/Job Title/), { target: { value: 'Engineer' } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: 'Example Co' } });
    fireEvent.change(screen.getByLabelText(/Industry/), { target: { value: 'Technology' } });
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: 'Ten years of mentoring.' } });
    const button = screen.getByRole('button', { name: 'Submit Application' });
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    return button;
  }

  it('shows the translated connection message when the connection drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<MentorApplyForm />);
    submitForm();
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('mentor-apply'), expect.any(TypeError));
    expect(screen.queryByText('Application Received!')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit Application' })).toBeEnabled());
  });

  it('keeps a server rejection visible instead of silently staying on the form', async () => {
    fetchMock.mockResolvedValue(serverMessage('Please use a work email address.', 400));
    withMessages(<MentorApplyForm />);
    submitForm();
    expect(await expectAlert()).toHaveTextContent('Please use a work email address.');
    expect(screen.queryByText('Application Received!')).not.toBeInTheDocument();
  });

  it('shows plain copy, not the browser text, for an HTML error page', async () => {
    fetchMock.mockResolvedValue(htmlErrorPage());
    withMessages(<MentorApplyForm />);
    submitForm();
    const alert = await expectAlert();
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(alert).toHaveTextContent(/could not send your application/i);
  });
});

describe('EmployerPipelineClient', () => {
  const match = {
    id: 'match-1',
    matchScore: 0.82,
    matchReasons: ['Completed the program'],
    status: 'suggested',
    student: { id: 'student-1', fullName: 'Sample Candidate', email: 'candidate@example.com', enrolledProgram: null },
  };
  const select = () => screen.getByLabelText('Match status for Sample Candidate');

  it('shows the translated connection message when the status change drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<EmployerPipelineClient jobId="job-1" jobTitle="Support Specialist" initialMatches={[match]} />);
    fireEvent.change(select(), { target: { value: 'employer_notified' } });
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('employer-pipeline-status'), expect.any(TypeError));
    await waitFor(() => expect(select()).toBeEnabled());
    expect(select()).toHaveValue('suggested');
  });

  it('surfaces a server rejection that used to be dropped on the floor', async () => {
    fetchMock.mockResolvedValue(serverMessage('This match was already closed by WorkforceAP.'));
    withMessages(<EmployerPipelineClient jobId="job-1" jobTitle="Support Specialist" initialMatches={[match]} />);
    fireEvent.change(select(), { target: { value: 'rejected' } });
    expect(await expectAlert()).toHaveTextContent('This match was already closed by WorkforceAP.');
    expect(select()).toHaveValue('suggested');
  });
});

const applicationRow: EmployerApplicationRow = {
  id: 'app-1',
  jobId: 'job-1',
  status: 'pending',
  appliedAt: '2026-09-01T12:00:00.000Z',
  employerNotes: null,
  job: { id: 'job-1', title: 'Support Specialist' },
  student: { id: 'student-1', fullName: 'Sample Applicant', email: 'applicant@example.com' },
};

describe('EmployerApplicationsClient', () => {
  it('shows the translated connection message when a pipeline change drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(
      <EmployerApplicationsClient initialRows={[applicationRow]} activeStatusFilter={null} activeSort="applied_desc" />,
    );
    fireEvent.change(screen.getByLabelText('Pipeline stage for Sample Applicant'), { target: { value: 'reviewing' } });
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('employer-application-status'), expect.any(TypeError));
    await waitFor(() => expect(screen.getByLabelText('Pipeline stage for Sample Applicant')).toBeEnabled());
  });
});

describe('MobileApplicationsClient', () => {
  it('shows the translated connection message when a status tap drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<MobileApplicationsClient initialRows={[applicationRow]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for Sample Applicant' }));
    // The filter chip row also has a "Reviewing" button; the action lives in the expanded card.
    const details = document.getElementById('application-details-app-1') as HTMLElement;
    fireEvent.click(within(details).getByRole('button', { name: 'Reviewing' }));
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('employer-application-status'), expect.any(TypeError));
  });
});

describe('EmployerJobsBoard', () => {
  const draft: EmployerJobBoardItem = {
    id: 'job-1',
    title: 'Support Specialist',
    location: 'Remote',
    salaryMin: null,
    salaryMax: null,
    locationType: 'remote',
    jobType: 'fulltime',
    descriptionPreview: 'Help customers.',
    descriptionLength: 120,
    requirementsCount: 2,
    suggestedProgramsCount: 1,
    status: 'draft',
    statusLabel: 'Draft',
    applicationsCount: 0,
    updatedAt: '2026-09-01T12:00:00.000Z',
    readinessLevel: 'usable',
    readinessIssues: [],
  };
  const boardProps = {
    jobs: [draft],
    filter: 'all' as const,
    page: 1,
    pageSize: 20,
    totalInFilter: 1,
    totalInDb: 1,
    deletableInFilter: [{ id: 'job-1', title: 'Support Specialist', status: 'draft' }],
    closableInFilter: [],
    titleByIdInFilter: { 'job-1': 'Support Specialist' },
  };

  it('shows the translated connection message when sending for review drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<EmployerJobsBoard {...boardProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('employer-job-submit-review'), expect.any(TypeError));
    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled());
  });

  it('shows plain copy, not the browser text, for an HTML error page', async () => {
    fetchMock.mockResolvedValue(htmlErrorPage());
    withMessages(<EmployerJobsBoard {...boardProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    const alert = await expectAlert();
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(alert).toHaveTextContent('Could not submit for review.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('PartnerAttentionClient', () => {
  const member = {
    memberId: 'member-1',
    fullName: 'Sample Member',
    stage: 'training',
    stageLabel: 'In training',
    programTitle: 'Sample Program',
    staleDays: 12,
    riskTier: 'high' as const,
    nextBestAction: 'Check in about module 3.',
    assignedPartnerUserId: null,
    assignedToName: null,
    lastTouchName: null,
  };
  const team = [{ id: 'user-1', fullName: 'Sample Owner', email: 'owner@example.com' }];

  /** The four loads on mount succeed; only the action under test fails. */
  function routeLoads(onAction: (url: string, init?: RequestInit) => Promise<Response>) {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        if (url.startsWith('/api/partner/members/needs-attention')) return okJson({ members: [member], counts: { all: 1, high: 1, medium: 0, low: 0, watch: 0 }, total: 1, nextCursor: null });
        if (url.startsWith('/api/partner/outreach')) return okJson({ logs: [] });
        if (url.startsWith('/api/partner/referral-members')) return okJson({ members: [{ id: 'member-1', fullName: 'Sample Member' }] });
        if (url.startsWith('/api/partner/team-assign')) return okJson({ users: team });
      }
      return onAction(url, init);
    });
  }

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    });
  });

  it('shows the translated connection message when assigning an owner drops', async () => {
    routeLoads(() => Promise.reject(droppedConnection()));
    withMessages(<PartnerAttentionClient />);
    const select = await screen.findByLabelText('Assign owner for Sample Member');
    await waitFor(() => expect(select).toBeEnabled());
    fireEvent.change(select, { target: { value: 'user-1' } });
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('partner-assign-owner'), expect.any(TypeError));
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('surfaces a server rejection of the owner change instead of silently keeping the old owner', async () => {
    routeLoads(async () => serverMessage('That teammate no longer has access to this member.', 403));
    withMessages(<PartnerAttentionClient />);
    const select = await screen.findByLabelText('Assign owner for Sample Member');
    await waitFor(() => expect(select).toBeEnabled());
    fireEvent.change(select, { target: { value: 'user-1' } });
    expect(await expectAlert()).toHaveTextContent('That teammate no longer has access to this member.');
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('shows the translated connection message when logging outreach drops', async () => {
    routeLoads(() => Promise.reject(droppedConnection()));
    withMessages(<PartnerAttentionClient />);
    await screen.findByLabelText('Assign owner for Sample Member');
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'member-1' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Called and left a message.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expectConnectionCopy(screen.getByRole('status'));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('partner-outreach'), expect.any(TypeError));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save log' })).toBeEnabled());
  });
});

describe('ElevatorPitchDeploymentLogger', () => {
  function routePost(onPost: () => Promise<Response>) {
    fetchMock.mockImplementation(async (_input, init) =>
      (init?.method ?? 'GET') === 'POST' ? onPost() : okJson({ deployments: [] }),
    );
  }

  async function openAndSubmit() {
    fireEvent.click(screen.getByRole('button', { name: /Log a use/ }));
    const dialogInput = await screen.findByPlaceholderText(/Amazon, local staffing agency/);
    fireEvent.change(dialogInput, { target: { value: 'Example Employer' } });
    fireEvent.submit(dialogInput.closest('form') as HTMLFormElement);
  }

  it('shows the translated connection message when saving a use drops', async () => {
    routePost(() => Promise.reject(droppedConnection()));
    withMessages(<ElevatorPitchDeploymentLogger />);
    await openAndSubmit();
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('pitch-deployment-log'), expect.any(TypeError));
    expect(screen.queryByText('Logged!')).not.toBeInTheDocument();
  });

  it('keeps a server rejection visible', async () => {
    routePost(async () => serverMessage('Enter a date in the past.', 400));
    withMessages(<ElevatorPitchDeploymentLogger />);
    await openAndSubmit();
    expect(await expectAlert()).toHaveTextContent('Enter a date in the past.');
  });
});

describe('AiResultRenderer download', () => {
  const output = 'Dear Hiring Manager,\n\nI am writing to apply.';

  it('shows the translated connection message when the PDF request drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<AiResultRenderer toolType="cover_letter" output={output} showCopy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expectConnectionCopy(await expectAlert());
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('ai-export-pdf'), expect.any(TypeError));
    await waitFor(() => expect(screen.getByRole('button', { name: /Download PDF/ })).toBeEnabled());
  });

  it('says the PDF could not be created instead of silently doing nothing on a server error', async () => {
    fetchMock.mockResolvedValue(htmlErrorPage());
    withMessages(<AiResultRenderer toolType="cover_letter" output={output} showCopy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    const alert = await expectAlert();
    expect(alert).toHaveTextContent(/could not create the PDF/i);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(within(alert).queryByRole('button')).toBeNull();
  });
});
