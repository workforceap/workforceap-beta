import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Portal audit item 11, follow-up: `PortalVoiceSession` and the analytics
 * chart grid paint from `--wa-*` tokens.
 *
 * The voice session panel used to carry ~31 hex literals and derived its
 * glow / transcript rule from `${accent}44` / `${accent}88` — a string concat
 * that only works when `accent` is a 6-digit hex. Callers already pass
 * `var(--wa-gold)` (SessionRunClient interview card) and `colorVar('accent')`
 * (CareerBusinessCoachKit), which produced the invalid `var(--wa-gold)44`.
 * The alpha steps are now `color-mix(in srgb, <accent> 27% / 53%,
 * transparent)`, so any CSS colour works.
 *
 * This spec drives the component through every phase it renders — pre,
 * error, active with a live transcript, done with suggestion cards — with
 * the ElevenLabs client, the microphone and the endpoints mocked, and
 * inspects the inline styles that reached the DOM. It is a rendered check,
 * not a source-text one: a literal creeping back through any prop path fails.
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
// jsdom normalises a bare hex in an inline style to `rgb(r, g, b)`.
const BARE_RGB = /\brgb\(\d+,\s*\d+,\s*\d+\)/g;

type SessionCallbacks = {
  onConnect?: () => void;
  onMessage?: (event: unknown) => void;
  onDisconnect?: (details: unknown) => void;
};
const startSession = vi.fn(async (cfg: SessionCallbacks) => {
  queueMicrotask(() => {
    cfg.onConnect?.();
    cfg.onMessage?.({ source: 'ai', role: 'agent', message: 'Tell me about your last role.' });
    cfg.onMessage?.({ source: 'user', role: 'user', message: 'I led a four-person support desk.' });
  });
  return { endSession: vi.fn(), sendContextualUpdate: vi.fn(), setVolume: vi.fn() };
});
vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession: (cfg: SessionCallbacks) => startSession(cfg) } }));

vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  const noAnim = (C: React.ComponentType<Record<string, unknown>>) => {
    const NoAnim = (props: Record<string, unknown>) => <C {...props} isAnimationActive={false} />;
    NoAnim.displayName = `NoAnim(${C.displayName ?? C.name ?? 'Chart'})`;
    return NoAnim;
  };
  return {
    ...actual,
    Area: noAnim(actual.Area as never),
    Bar: noAnim(actual.Bar as never),
    Pie: noAnim(actual.Pie as never),
    ResponsiveContainer: ({ children, height }: { children: React.ReactElement; height?: number }) =>
      React.cloneElement(children, { width: 900, height: height ?? 240 } as Record<string, unknown>),
  };
});

/** Every colour-bearing value that reached the DOM: inline styles + SVG paint attributes. */
function paintedValues(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    for (const attr of ['style', 'fill', 'stroke', 'stop-color', 'color']) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out;
}

function literals(root: HTMLElement): string[] {
  const values = paintedValues(root);
  return [...values.flatMap((v) => v.match(HEX) ?? []), ...values.flatMap((v) => v.match(BARE_RGB) ?? [])];
}

function styleOf(el: Element | null): string {
  return el?.getAttribute('style') ?? '';
}

function mockEndpoints(suggestions: Array<{ original?: string; suggested: string; context: string }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = String(url).includes('suggestions') ? { suggestions } : { signedUrl: 'wss://voice.example/session' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  startSession.mockClear();
});

async function renderVoice(props: Record<string, unknown> = {}) {
  const { default: PortalVoiceSession } = await import('@/components/portal/PortalVoiceSession');
  return render(
    <PortalVoiceSession
      sessionEndpoint="/api/voice/session"
      suggestionsEndpoint="/api/voice/suggestions"
      title="Interview coach"
      description="Practice answering out loud."
      liveTranscriptCoachLabel="Interviewer"
      liveTranscriptYouLabel="You"
      {...props}
    />,
  );
}

describe('PortalVoiceSession paints from --wa-* tokens with a token accent', () => {
  const GOLD = { accent: 'var(--wa-gold)', accentDark: 'var(--wa-gold-dark)' };

  it('pre phase: no literal, and the start glow is a color-mix of the caller accent, never a hex-suffix concat', async () => {
    const { container } = await renderVoice(GOLD);
    expect(literals(container)).toEqual([]);
    const start = screen.getByRole('button', { name: /start voice session/i });
    const style = styleOf(start);
    expect(style).toContain('background: var(--wa-gold)');
    expect(style).toContain('color: var(--wa-sidebar-text)');
    expect(style).toContain('box-shadow: 0 4px 20px color-mix(in srgb, var(--wa-gold) 27%, transparent)');
    expect(style).not.toContain('var(--wa-gold)44');
    // Panel chrome reads the constant sidebar set, so it is dark in both themes.
    expect(styleOf(container.firstElementChild)).toContain('background: var(--wa-sidebar-bg)');
    expect(styleOf(screen.getByRole('heading', { name: 'Interview coach' }))).toContain('color: var(--wa-sidebar-text)');
  });

  it('defaults to the brand crimson tokens when no accent is passed', async () => {
    const { container } = await renderVoice();
    expect(literals(container)).toEqual([]);
    expect(styleOf(screen.getByRole('button', { name: /start voice session/i }))).toContain('background: var(--wa-hero-crimson)');
  });

  it('error notice: crimson tints and pink text as color-mix over the panel, no literal', async () => {
    // No mediaDevices in jsdom: the microphone request throws and the panel shows the alert.
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    const { container } = await renderVoice(GOLD);
    fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Microphone: access is required/);
    const style = styleOf(alert);
    expect(style).toContain('background: color-mix(in srgb, var(--wa-hero-crimson) 15%, transparent)');
    expect(style).toContain('border: 1px solid color-mix(in srgb, var(--wa-hero-crimson) 40%, transparent)');
    expect(style).toContain('color: color-mix(in srgb, var(--wa-hero-crimson) 35%, var(--wa-sidebar-text))');
    expect(literals(container)).toEqual([]);
  });

  it('active and done phases: transcript rule, speaking pill, wells and suggestion cards are token-only', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
    });
    mockEndpoints([
      { original: 'Did support stuff.', suggested: 'Led a four-person support desk.', context: 'Quantify the team you led.' },
    ]);
    const { container } = await renderVoice(GOLD);
    fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));

    // Active: End session button, the live transcript with both speakers.
    const end = await screen.findByRole('button', { name: /end session/i });
    expect(startSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('I led a four-person support desk.'));
    expect(literals(container)).toEqual([]);
    const painted = paintedValues(container).join('\n');
    // The coach line's rule is the 53% accent step (was `${accent}88`).
    expect(painted).toContain('border-left: 2px solid color-mix(in srgb, var(--wa-gold) 53%, transparent)');
    expect(painted).not.toContain('var(--wa-gold)88');
    // Speaking / listening pill tints the accent instead of a fixed crimson rgba.
    expect(painted).toContain('background: color-mix(in srgb, var(--wa-gold) 18%, transparent)');
    // The transcript well is one step darker than the panel, bordered by the sidebar token.
    expect(styleOf(screen.getByRole('log'))).toContain('background: color-mix(in srgb, var(--wa-sidebar-bg) 70%, black)');
    expect(styleOf(screen.getByRole('log'))).toContain('border: 1px solid var(--wa-sidebar-border)');
    expect(styleOf(end)).toContain('background: var(--wa-gold)');

    // Done: suggestion cards (Before / After) from the mocked endpoint.
    fireEvent.click(end);
    await screen.findByText('Coach suggestions (1)');
    expect(literals(container)).toEqual([]);
    const before = screen.getByText('Before').parentElement!;
    expect(styleOf(before)).toContain('background: var(--wa-surface-2)');
    expect(styleOf(before)).toContain('border: 1px solid var(--wa-border)');
    expect(styleOf(screen.getByText('Before'))).toContain('color: var(--wa-muted)');
    const after = screen.getByText('After').parentElement!;
    expect(styleOf(after)).toContain('background: var(--wa-success-soft)');
    expect(styleOf(after)).toContain('border: 1px solid color-mix(in srgb, var(--wa-success) 35%, transparent)');
    expect(styleOf(screen.getByText('After'))).toContain('color: var(--wa-success-dark)');
    expect(styleOf(screen.getByText('Led a four-person support desk.'))).toContain('color: var(--wa-success-dark)');
    expect(styleOf(screen.getByRole('button', { name: /approve/i }))).toContain('background: var(--wa-gold)');
  });
});

describe('AdminAnalyticsCharts grid', () => {
  it('draws every CartesianGrid line from --wa-border so it resolves in light mode too', async () => {
    const { default: Charts } = await import('@/components/admin/AdminAnalyticsCharts');
    const days = Array.from({ length: 14 }, (_, i) => ({ date: `9/${i + 8}`, events: 5 + ((i * 7) % 11), aiTools: 2 + ((i * 3) % 6), applications: (i * 5) % 4 }));
    const programs = ['IT Support', 'Cybersecurity', 'Data Analytics', 'Project Mgmt'];
    const { container } = render(
      <Charts dailyActivity={days} enrollmentByProgram={programs.map((program, i) => ({ program, count: 40 - i * 4 }))}
        placementStats={{ enrolled: 120, placed: 48, certifications: 77, placementRate: 40 }} inactive14Days={9} applicationsSubmitted={210} resourcesCompleted={512}
        aiToolStats={{ runsLastNDays: 88, trend: 12, totalRuns: 1400, breakdown: [{ toolType: 'cover_letter', count: 30 }, { toolType: 'gap_analyzer', count: 14 }] }} />,
    );
    const grids = container.querySelectorAll('.recharts-cartesian-grid');
    expect(grids.length).toBe(3);
    const lines = Array.from(container.querySelectorAll('.recharts-cartesian-grid line'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.getAttribute('stroke')).toBe('var(--wa-border)');
    // The old `rgba(255,255,255,0.05)` was white-on-white in light mode.
    expect(lines.some((l) => /rgba\(255,\s*255,\s*255/.test(l.getAttribute('stroke') ?? ''))).toBe(false);
  });
});
