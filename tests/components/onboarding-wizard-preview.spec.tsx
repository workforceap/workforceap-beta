import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('preview-only member onboarding', () => {
  it('advances and closes locally without persisting steps or completion', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onComplete = vi.fn();
    render(
      <OnboardingWizard
        portal="member"
        previewOnly
        onComplete={onComplete}
        steps={[
          { title: 'Profile preview', content: <p>Local sample fields</p> },
          { title: 'Program preview', content: <p>Local sample program</p> },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Program preview' });
    fireEvent(window, new Event('beforeunload'));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
