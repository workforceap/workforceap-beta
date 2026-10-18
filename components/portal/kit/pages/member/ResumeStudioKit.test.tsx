import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/en.json';
import { ResumeStudioKit } from './ResumeStudioKit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard/ai-tools/resume-studio',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/portal/ResumeStudioClient', () => ({
  default: () => <div data-testid="resume-studio-client" />,
}));

function renderKit(ui: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
}

const copy = messages.dashboard.resumeC;

describe('ResumeStudioKit analysis honesty', () => {
  it('shows an unknown state instead of zero fixes or fake bars when no analysis exists', () => {
    renderKit(<ResumeStudioKit hasResume />);
    expect(screen.getByRole('heading', { name: copy.claimUnknown })).toBeTruthy();
    expect(screen.getByTestId('resume-studio-analysis-unknown')).toHaveTextContent(copy.analysisUnknownTitle);
    expect(screen.getByText(copy.kpiFixesUnknown)).toBeTruthy();
    expect(screen.queryByText(copy.kpiFixes.replace('{count}', '0'))).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('link', { name: copy.runAnalysis })).toHaveAttribute(
      'href',
      '/dashboard/ai-tools/resume-studio?view=score',
    );
  });

  it('renders scores, fixes, and bars only when real analysis data is present', () => {
    renderKit(
      <ResumeStudioKit
        hasResume
        score={72}
        keywordPct={64}
        clarityPct={70}
        metricsPct={55}
        keywordsPct={64}
        fixes={[{ title: 'Add a metric', body: 'Quantify ticket volume.', tag: 'highImpact' }]}
      />,
    );
    expect(screen.getByRole('heading', { name: copy.claim.replace('{score}', '72') })).toBeTruthy();
    expect(screen.queryByTestId('resume-studio-analysis-unknown')).toBeNull();
    expect(screen.getByText(copy.kpiFixes.replace('{count}', '1'))).toBeTruthy();
    expect(screen.getByText('Add a metric')).toBeTruthy();
    expect(screen.getAllByRole('progressbar').length).toBe(3);
    expect(screen.getByRole('link', { name: copy.rewriteFixes })).toBeTruthy();
  });
});
