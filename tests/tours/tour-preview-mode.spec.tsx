import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TourProvider, useTour } from '@/components/onboarding/TourContext';
import TourProviderWrapper from '@/components/onboarding/TourProviderWrapper';

const { refresh, trackTourEvent } = vi.hoisted(() => ({ refresh: vi.fn(), trackTourEvent: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/analytics/events', () => ({ trackTourEvent }));
// The provider owns persistence; visual tour behavior is covered by member-tour.
vi.mock('@/components/portal/kit/GuidedTour', () => ({ GuidedTour: () => null }));
vi.mock('@/components/onboarding/TourAutoStart', () => ({ default: () => null }));

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function Controls() {
  const tour = useTour();
  return (
    <>
      <output>{tour.isOpen ? `Open at step ${tour.currentStep}` : 'Closed'}</output>
      <button onClick={() => tour.start('member.home')}>Start</button>
      <button onClick={() => tour.startTour([{ targetId: 'sample', titleKey: 'sample.title', bodyKey: 'sample.body' }], 'member')}>Start legacy</button>
      <button onClick={tour.nextStep}>Next</button>
      <button onClick={tour.endTour}>Dismiss</button>
      <button onClick={() => void tour.completeTour()}>Complete</button>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('fixture tours', () => {
  it('starts, advances, dismisses and reopens locally through the preview wrapper', () => {
    render(<TourProviderWrapper previewMode><Controls /></TourProviderWrapper>);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('status')).toHaveTextContent('Open at step 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status')).toHaveTextContent('Open at step 1');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByRole('status')).toHaveTextContent('Closed');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('status')).toHaveTextContent('Open at step 0');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trackTourEvent).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(['Start', 'Start legacy'])('completes %s without progress writes, analytics or a route refresh', async (name) => {
    render(<TourProviderWrapper previewMode><Controls /></TourProviderWrapper>);
    fireEvent.click(screen.getByRole('button', { name }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Complete' })));
    expect(screen.getByRole('status')).toHaveTextContent('Closed');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trackTourEvent).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('preserves live default persistence, analytics and completion refresh', async () => {
    render(<TourProvider><Controls /></TourProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Complete' })));
    expect(screen.getByRole('status')).toHaveTextContent('Closed');
    const posts = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(posts.filter(([url]) => url === '/api/tours/member.home').map(([, init]) => JSON.parse(String(init.body)).status))
      .toEqual(['STARTED', 'DISMISSED', 'STARTED', 'COMPLETED']);
    expect(posts.filter(([url]) => url === '/api/onboarding/tour-complete')).toHaveLength(1);
    expect(trackTourEvent.mock.calls.map(([event]) => event)).toEqual(['started', 'dismissed', 'started', 'completed']);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
