import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ElevatorPitchClient from './ElevatorPitchClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('./ToolFollowThrough', () => ({ default: () => null }));

/**
 * Member audit 7c: a 503 from /api/ai/elevator-pitch left the button on
 * "Writing…" with no message. Every non-2xx or network failure must show a
 * plain-language alert, re-enable the button and stop the spinner.
 */

function htmlResponse(status: number, statusText: string): Response {
  return new Response('<!doctype html><title>error</title>', {
    status,
    statusText,
    headers: { 'content-type': 'text/html' },
  });
}

async function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Jordan Williams' } });
  fireEvent.change(screen.getByLabelText(/Target role/), { target: { value: 'Cloud Support Associate' } });
  fireEvent.click(screen.getByRole('button', { name: 'Write pitch' }));
}

function expectControlRestored() {
  const button = screen.getByRole('button', { name: 'Write pitch' });
  expect(button).toBeEnabled();
  expect(button).toHaveAttribute('aria-busy', 'false');
  expect(screen.queryByText(/Writing…/)).toBeNull();
}

describe('ElevatorPitchClient failure states', () => {
  beforeEach(() => {
    // The in-flight spinner is an Astryx component that reads prefers-* media queries.
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('shows a plain-language alert and re-enables the button after a 503 with a non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(503, 'Service Unavailable')));
    render(<ElevatorPitchClient userId="member-1" />);

    await fillAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(alert).not.toHaveTextContent(/503|Service Unavailable/);
    await waitFor(expectControlRestored);
  });

  it('replaces an engineer-facing 500 body with a sentence the member can act on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Internal server error' }, { status: 500 })),
    );
    render(<ElevatorPitchClient userId="member-1" />);

    await fillAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/try again/i);
    expect(alert).not.toHaveTextContent(/Internal server error/);
    await waitFor(expectControlRestored);
  });

  it('keeps a specific validation message from a 400 answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Add a target role before writing a pitch.' }, { status: 400 })),
    );
    render(<ElevatorPitchClient userId="member-1" />);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Add a target role before writing a pitch.');
    await waitFor(expectControlRestored);
  });

  it('reports a network failure instead of spinning forever', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    render(<ElevatorPitchClient userId="member-1" />);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i);
    await waitFor(expectControlRestored);
  });
});
