import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResponsiveDetails, { APPLY_MOBILE_QUERY } from '@/components/apply/ResponsiveDetails';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Listener = (event: { matches: boolean }) => void;

/** A controllable matchMedia: `set(matches)` fires the change listeners like a real resize would. */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initialMatches,
    media: APPLY_MOBILE_QUERY,
    addEventListener: vi.fn((_: 'change', cb: Listener) => listeners.add(cb)),
    removeEventListener: vi.fn((_: 'change', cb: Listener) => listeners.delete(cb)),
  };
  const matchMedia = vi.fn(() => mql);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    mql,
    set(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((cb) => cb({ matches }));
    },
    listenerCount: () => listeners.size,
  };
}

const body = (
  <ResponsiveDetails className="apply-sidebar-next-steps" data-testid="disclosure">
    <summary>What happens next?</summary>
    <div>Submit your application and tell us what kind of work or training you want.</div>
  </ResponsiveDetails>
);

describe('ResponsiveDetails (apply funnel disclosures)', () => {
  it('server-renders open so the desktop card is never an empty box on first paint', () => {
    const html = renderToStaticMarkup(body);
    expect(html.startsWith('<details')).toBe(true);
    expect(html).toMatch(/^<details[^>]*\bopen=""/);
    expect(html).toMatch(/^<details[^>]*class="apply-sidebar-next-steps"/);
    expect(html).toContain('<summary>What happens next?</summary>');
  });

  it('stays open at desktop widths and asks the apply breakpoint', () => {
    const media = stubMatchMedia(false);
    const { getByTestId } = render(body);
    const details = getByTestId('disclosure') as HTMLDetailsElement;
    expect(media.matchMedia).toHaveBeenCalledWith(APPLY_MOBILE_QUERY);
    expect(details.open).toBe(true);
  });

  it('collapses on mobile, re-opens when the viewport grows, and unsubscribes on unmount', () => {
    const media = stubMatchMedia(true);
    const { getByTestId, unmount } = render(body);
    const details = getByTestId('disclosure') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(media.listenerCount()).toBe(1);

    act(() => media.set(false));
    expect(details.open).toBe(true);

    act(() => media.set(true));
    expect(details.open).toBe(false);

    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('passes through the landmark attributes the documents checklist relies on', () => {
    stubMatchMedia(false);
    const { getByRole } = render(
      <ResponsiveDetails role="region" aria-labelledby="docs-heading" className="apply-docs-checklist">
        <summary>Documents we may ask for later</summary>
        <h2 id="docs-heading">Documents checklist</h2>
      </ResponsiveDetails>,
    );
    const region = getByRole('region', { name: 'Documents checklist' });
    expect(region.tagName).toBe('DETAILS');
    expect(region).toHaveClass('apply-docs-checklist');
  });
});
