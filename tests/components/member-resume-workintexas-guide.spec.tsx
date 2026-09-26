import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResumeClient from '@/app/(portal)/dashboard/resume/ResumeClient';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));

const contact = {
  name: 'Jordan Example',
  email: 'jordan@example.org',
  phone: '',
  recentEmployer: '',
  targetJob: '',
  skills: '',
};

async function showGuide(status: { hasOriginal: boolean; originalUrl: string | null }) {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    ...status,
    hasEnhanced: false,
    originalExt: status.hasOriginal ? 'pdf' : null,
    enhancedExt: null,
    previewOriginalPath: null,
    previewEnhancedPath: null,
  })));
  render(<ResumeClient completeness={60} witData={contact} hasOriginal={status.hasOriginal} hasEnhanced={false} />);
  const heading = await screen.findByText('WorkInTexas guide');
  const guide = heading.closest('section');
  expect(guide).not.toBeNull();
  return within(guide!);
}

describe('WorkInTexas guide source and missing-field copy', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('names incomplete fields rather than labeling contact-only data prefilled', async () => {
    const guide = await showGuide({ hasOriginal: false, originalUrl: null });
    expect(guide.getByText('Partially filled')).toBeInTheDocument();
    expect(guide.getByText(/Add your phone/)).toBeInTheDocument();
    expect(guide.getByText(/Add your jobs and dates/)).toBeInTheDocument();
    expect(guide.getByText(/Choose the job title you want to pursue/)).toBeInTheDocument();
    expect(guide.getByText(/List skills you can demonstrate/)).toBeInTheDocument();
    expect(guide.getByText(/Upload your original resume above first/)).toBeInTheDocument();
    expect(guide.queryByText(/Download your original resume from above/)).toBeNull();
  });

  it('does not promise a download for an on-file original with no signed URL', async () => {
    const guide = await showGuide({ hasOriginal: true, originalUrl: null });
    expect(guide.getByText(/Original file on record; download currently unavailable/)).toBeInTheDocument();
    expect(guide.getByText(/Use the jobs and dates on your original resume/)).toBeInTheDocument();
  });

  it('points to the original when its download URL is available', async () => {
    const guide = await showGuide({ hasOriginal: true, originalUrl: 'https://example.test/original.pdf' });
    expect(guide.getByText(/Download your original resume from above/)).toBeInTheDocument();
  });
});
