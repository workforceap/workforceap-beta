import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AddMemberWizard from '@/app/admin/members/new/AddMemberWizard';
import type { Program } from '@/lib/content/programs';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/components/ProgramIcon', () => ({
  ProgramIcon: () => null,
}));

const programs: Program[] = [
  {
    slug: 'program-a',
    title: 'Program A',
    category: 'business',
    categoryLabel: 'Business',
    categoryColor: '',
    borderColor: '',
    icon: '',
    duration: '160 hours',
    skills: [],
    courses: [],
    partner: 'Partner A',
  },
  {
    slug: 'program-b',
    title: 'Program B',
    category: 'business',
    categoryLabel: 'Business',
    categoryColor: '',
    borderColor: '',
    icon: '',
    duration: '160 hours',
    skills: [],
    courses: [],
    partner: 'Partner B',
  },
];

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function goToStep(step: number) {
  fireEvent.click(screen.getByRole('button', { name: String(step) }));
}

function chooseProgram(title: string) {
  goToStep(2);
  fireEvent.click(screen.getByText(title));
  goToStep(4);
}

function getResumeInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('#wizard-resume-input')!;
}

async function uploadParsedResume(container: HTMLElement, fileName = 'resume-a.pdf') {
  const file = new File(['resume'], fileName, { type: 'application/pdf' });
  fireEvent.change(getResumeInput(container), { target: { files: [file] } });
  await screen.findByText(/Experienced workforce learner with project leadership/);
  return file;
}

describe('AddMemberWizard resume enhancement ownership', () => {
  beforeEach(() => {
    router.push.mockReset();
    router.refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the enhanced draft and summary as soon as the source file changes', async () => {
    const secondExtraction = deferred<Response>();
    let extractionCount = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/ai/extract-resume-text') {
        extractionCount += 1;
        if (extractionCount === 2) return secondExtraction.promise;
        return Promise.resolve(jsonResponse({
          text: 'Experienced workforce learner with project leadership, customer service, and technical training accomplishments.',
        }));
      }
      if (url === '/api/admin/members/parse-resume') {
        return Promise.resolve(jsonResponse({ extracted: {} }));
      }
      if (url === '/api/admin/members/enhance-resume') {
        return Promise.resolve(jsonResponse({
          enhancedResume: 'PROGRAM A ENHANCED RESUME',
          improvementSummary: ['Targeted the resume to Program A'],
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<AddMemberWizard programs={programs} partners={[]} subgroups={[]} />);
    chooseProgram('Program A');
    await uploadParsedResume(container);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Enhanced Resume' }));
    expect(await screen.findByText('PROGRAM A ENHANCED RESUME')).toBeInTheDocument();
    expect(screen.getByText('Targeted the resume to Program A')).toBeInTheDocument();

    const replacement = new File(['replacement'], 'resume-b.pdf', { type: 'application/pdf' });
    fireEvent.change(getResumeInput(container), { target: { files: [replacement] } });

    expect(screen.queryByText('PROGRAM A ENHANCED RESUME')).not.toBeInTheDocument();
    expect(screen.queryByText('Targeted the resume to Program A')).not.toBeInTheDocument();
    expect(screen.getByText('Parsing…')).toBeInTheDocument();

    await act(async () => {
      secondExtraction.resolve(jsonResponse({
        text: 'Experienced workforce learner with a new source resume focused on database administration and SQL operations.',
      }));
      await secondExtraction.promise;
    });

    await waitFor(() => expect(screen.queryByText('Parsing…')).not.toBeInTheDocument());
  });

  it('ignores an older enhancement response after the selected program changes', async () => {
    const firstEnhancement = deferred<Response>();
    const secondEnhancement = deferred<Response>();
    let enhancementCount = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/ai/extract-resume-text') {
        return Promise.resolve(jsonResponse({
          text: 'Experienced workforce learner with project leadership, customer service, and technical training accomplishments.',
        }));
      }
      if (url === '/api/admin/members/parse-resume') {
        return Promise.resolve(jsonResponse({ extracted: {} }));
      }
      if (url === '/api/admin/members/enhance-resume') {
        enhancementCount += 1;
        return enhancementCount === 1 ? firstEnhancement.promise : secondEnhancement.promise;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<AddMemberWizard programs={programs} partners={[]} subgroups={[]} />);
    chooseProgram('Program A');
    await uploadParsedResume(container);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Enhanced Resume' }));
    expect(screen.getByText('Generating…')).toBeInTheDocument();

    chooseProgram('Program B');
    fireEvent.click(screen.getByRole('button', { name: 'Generate Enhanced Resume' }));

    await act(async () => {
      secondEnhancement.resolve(jsonResponse({
        enhancedResume: 'PROGRAM B ENHANCED RESUME',
        improvementSummary: ['Targeted the resume to Program B'],
      }));
      await secondEnhancement.promise;
    });
    expect(await screen.findByText('PROGRAM B ENHANCED RESUME')).toBeInTheDocument();

    await act(async () => {
      firstEnhancement.resolve(jsonResponse({
        enhancedResume: 'STALE PROGRAM A RESUME',
        improvementSummary: ['Stale Program A summary'],
      }));
      await firstEnhancement.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('PROGRAM B ENHANCED RESUME')).toBeInTheDocument();
      expect(screen.queryByText('STALE PROGRAM A RESUME')).not.toBeInTheDocument();
      expect(screen.queryByText('Stale Program A summary')).not.toBeInTheDocument();
    });

    const enhancementCalls = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/admin/members/enhance-resume');
    expect(JSON.parse(String(enhancementCalls[0]?.[1]?.body))).toMatchObject({ programTitle: 'Program A' });
    expect(JSON.parse(String(enhancementCalls[1]?.[1]?.body))).toMatchObject({ programTitle: 'Program B' });
  });

  it('ignores dropped files while enhancement is running', async () => {
    const enhancement = deferred<Response>();
    let extractionCount = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/ai/extract-resume-text') {
        extractionCount += 1;
        return Promise.resolve(jsonResponse({
          text: 'Experienced workforce learner with project leadership, customer service, and technical training accomplishments.',
        }));
      }
      if (url === '/api/admin/members/parse-resume') {
        return Promise.resolve(jsonResponse({ extracted: {} }));
      }
      if (url === '/api/admin/members/enhance-resume') return enhancement.promise;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<AddMemberWizard programs={programs} partners={[]} subgroups={[]} />);
    chooseProgram('Program A');
    await uploadParsedResume(container, 'resume-a.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Generate Enhanced Resume' }));
    const dropZone = container.querySelector<HTMLElement>('.counselor-resume-upload')!;
    expect(dropZone).toHaveAttribute('aria-disabled', 'true');

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [new File(['replacement'], 'resume-b.pdf', { type: 'application/pdf' })],
      },
    });

    expect(extractionCount).toBe(1);
    expect(screen.getByText('resume-a.pdf')).toBeInTheDocument();

    await act(async () => {
      enhancement.resolve(jsonResponse({ enhancedResume: 'CURRENT RESUME', improvementSummary: [] }));
      await enhancement.promise;
    });
    expect(await screen.findByText('CURRENT RESUME')).toBeInTheDocument();
  });
});
