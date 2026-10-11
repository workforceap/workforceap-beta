import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';
import PortalVoiceSession from '@/components/portal/PortalVoiceSession';
import { MEMBER_REQUEST_FAILURE, MEMBER_REQUEST_TIMEOUT_MS } from '@/lib/portal/memberRequestFailure';

const { startSession } = vi.hoisted(() => ({ startSession: vi.fn() }));
vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard/ai-tools',
  useSearchParams: () => new URLSearchParams('tab=session&agent=resume'),
}));

beforeEach(() => {
  startSession.mockReset();
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const surfaces = [
  { name: 'AI Career Tools hub', render: () => <NextIntlClientProvider locale="en" messages={pickPortalClientMessages(en)}><VoiceStudioKit initialTab="session" initialAgent="resume" /></NextIntlClientProvider>, button: /^start session$/i },
  { name: 'shared voice coach', render: () => <PortalVoiceSession sessionEndpoint="/api/member/resume-coach/session" title="Resume coach" description="Practice with your coach." />, button: /^start voice session$/i },
];

describe.each(surfaces)('$name startup recovery', ({ render: renderSurface, button }) => {
  it('microphone denial gives permission guidance and never requests a session', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    render(renderSurface());
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/microphone.*allow.*try again/i);
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'HTML service outage', fetch: async () => new Response('<title>Bad Gateway</title>', { status: 502 }), message: MEMBER_REQUEST_FAILURE.unavailable },
    { name: 'expired authentication', fetch: async () => Response.json({ error: 'Unauthorized' }, { status: 401 }), message: MEMBER_REQUEST_FAILURE.session },
    { name: 'interrupted connection', fetch: async () => { throw new TypeError('Failed to fetch'); }, message: MEMBER_REQUEST_FAILURE.network },
  ])('recovers from $name with an alert and enabled retry', async ({ fetch, message }) => {
    vi.stubGlobal('fetch', vi.fn(fetch));
    render(renderSurface());
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('a hung request stops connecting at the deadline and enables retry', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    })));
    render(renderSurface());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: button })));
    expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(MEMBER_REQUEST_TIMEOUT_MS); });
    expect(screen.getByRole('alert')).toHaveTextContent(MEMBER_REQUEST_FAILURE.timeout);
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('unmounting cancels the pending session request before the client starts', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true }));
    });
    vi.stubGlobal('fetch', fetch);
    const { unmount } = render(renderSurface());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: button })));
    expect(fetch).toHaveBeenCalledOnce();
    unmount();
    expect(requestSignal?.aborted).toBe(true);
    expect(startSession).not.toHaveBeenCalled();
  });

  it('the restored start control retries the same coach successfully', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ signedUrl: 'wss://voice.example.test/session', dynamicVariables: { first_name: 'Alex' } })));
    startSession.mockImplementation(async (options) => {
      options.onConnect();
      return { endSession: vi.fn(), getInputVolume: () => 0, getOutputVolume: () => 0 };
    });
    render(renderSurface());
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MEMBER_REQUEST_FAILURE.network);
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('button', { name: /^end session$/i })).toBeEnabled();
    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ signedUrl: 'wss://voice.example.test/session', dynamicVariables: { first_name: 'Alex' } }));
  });

  it('ends a client connection that fulfills after the surface unmounts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ signedUrl: 'wss://voice.example.test/session' })));
    const endSession = vi.fn().mockResolvedValue(undefined);
    let fulfill: (conversation: unknown) => void = () => {};
    startSession.mockImplementation(() => new Promise((resolve) => { fulfill = resolve; }));
    const { unmount } = render(renderSurface());
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    unmount();
    await act(async () => { fulfill({ endSession }); });
    expect(endSession).toHaveBeenCalledOnce();
  });
});

it('stops a camera stream granted after the shared voice coach unmounts', async () => {
  const microphoneStop = vi.fn();
  const cameraStop = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  let grantCamera: (stream: unknown) => void = () => {};
  vi.mocked(navigator.mediaDevices.getUserMedia)
    .mockResolvedValueOnce({ getTracks: () => [{ stop: microphoneStop }] } as unknown as MediaStream)
    .mockImplementationOnce(() => new Promise((resolve) => { grantCamera = resolve as (stream: unknown) => void; }));
  const videoStreamRef = { current: null };
  const { unmount } = render(<PortalVoiceSession
    sessionEndpoint="/api/interview/session"
    title="Mock interview"
    description="Practice out loud."
    acquireVideoForRecording
    videoStreamRef={videoStreamRef}
  />);
  fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));
  await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2));
  unmount();
  await act(async () => { grantCamera({ getTracks: () => [{ stop: cameraStop }] }); });
  expect(microphoneStop).toHaveBeenCalledOnce();
  expect(cameraStop).toHaveBeenCalledOnce();
  expect(videoStreamRef.current).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(startSession).not.toHaveBeenCalled();
});
