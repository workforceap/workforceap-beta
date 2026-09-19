import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

const source = readFileSync(path.resolve(__dirname, '../../marketing/src/components/ConsentBanner.astro'), 'utf8');
const markup = source.match(/<section id="wap-consent"[\s\S]*?<\/section>/)![0];
const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)![1];
const KEY = 'wap-cookie-consent';
let height = 216.5;
let bottom = 12;
const measurements: ResizeObserverCallback[] = [];
const disconnect = vi.fn();
const gtag = vi.fn();
const consentChanged = vi.fn();

function start() {
  // Execute the actual inline Astro script against a synthetic browser DOM.
  runInNewContext(script, { document, window, navigator, localStorage, CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window), ResizeObserver });
}

beforeEach(() => {
  height = 216.5;
  bottom = 12;
  measurements.length = 0;
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = `<button id="outside">Outside action</button>${markup}`;
  document.body.style.paddingBottom = '32px';
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
  Object.defineProperty(window, 'gtag', { configurable: true, value: gtag });
  window.addEventListener('wap:consent-change', consentChanged);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { measurements.push(callback); }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const h = this.id === 'wap-consent' ? height : 0;
    return { x: 12, y: window.innerHeight - h - bottom, top: window.innerHeight - h - bottom,
      left: 12, bottom: window.innerHeight - bottom, right: 363, width: 351, height: h, toJSON: () => ({}) };
  });
});

afterEach(() => {
  // An undecided case still owns a resize listener; decide before removing DOM.
  const banner = document.getElementById('wap-consent');
  if (banner && !banner.hidden) (banner.querySelector('[data-consent="declined"]') as HTMLButtonElement).click();
  window.removeEventListener('wap:consent-change', consentChanged);
  document.body.innerHTML = '';
  document.body.style.paddingBottom = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Astro-owned cookie banner', () => {
  it('is a named nonmodal region and reserves actual height plus bottom gap without taking focus', () => {
    const outside = screen.getByRole('button', { name: 'Outside action' });
    outside.focus();
    start();
    expect(screen.getByRole('region', { name: 'Cookie preferences' })).not.toHaveAttribute('aria-modal');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(outside).toHaveFocus();
    expect(document.body.style.paddingBottom).toBe('260.5px');
    expect(gtag).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });

  it('remeasures text wrapping and viewport changes without accumulating body padding', () => {
    start();
    height = 300;
    measurements[0]([], {} as ResizeObserver);
    expect(document.body.style.paddingBottom).toBe('344px');
    height = 96;
    bottom = 0;
    fireEvent(window, new Event('resize'));
    expect(document.body.style.paddingBottom).toBe('128px');
  });

  it.each([['Accept', 'accepted', 'granted'], ['Decline', 'declined', 'denied']])('preserves %s storage, broadcast and analytics contract and releases space', (label, decision, analytics) => {
    start();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ decision, date: expect.any(String) });
    expect(consentChanged).toHaveBeenCalledTimes(1);
    expect((consentChanged.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ decision });
    expect(gtag).toHaveBeenCalledExactlyOnceWith('consent', 'update', {
      ad_storage: analytics, ad_user_data: analytics, ad_personalization: analytics, analytics_storage: analytics,
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(document.body.style.paddingBottom).toBe('32px');
    expect(disconnect).toHaveBeenCalledTimes(1);
    fireEvent(window, new Event('resize'));
    expect(document.body.style.paddingBottom).toBe('32px');
  });

  it.each([{ decision: 'accepted' }, { decision: 'declined' }, { accepted: true }, { accepted: false }])('honors an existing portal or legacy choice: %j', (record) => {
    localStorage.setItem(KEY, JSON.stringify(record));
    start();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(document.body.style.paddingBottom).toBe('32px');
    expect(measurements).toHaveLength(0);
    expect(gtag).not.toHaveBeenCalled();
    expect(consentChanged).not.toHaveBeenCalled();
  });

  it('honors GPC as the same automatic opt-out without displaying or reserving a banner', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    start();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ decision: 'declined', fromGpc: true });
    expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'denied' }));
    expect(consentChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(document.body.style.paddingBottom).toBe('32px');
    expect(measurements).toHaveLength(0);
  });
});
