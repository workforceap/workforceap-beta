import { afterEach, describe, expect, it } from 'vitest';
import { claimEarlyTap, EARLY_TAP_ATTR, EARLY_TAP_GLOBAL, EARLY_TAP_SCRIPT } from '@/lib/portal/earlyShellTap';

/**
 * Taps that land before hydration are recorded by a tiny inline script and
 * replayed once the owner mounts (lib/portal/earlyShellTap.ts). The script is
 * evaluated here exactly as the browser would run it from <head>.
 */

const win = window as unknown as Record<string, unknown>;

function runInlineScript() {
  new Function(EARLY_TAP_SCRIPT)();
}

function addControl(kind: string) {
  const button = document.createElement('button');
  button.setAttribute(EARLY_TAP_ATTR, kind);
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  button.appendChild(icon);
  document.body.appendChild(button);
  return { button, icon };
}

afterEach(() => {
  delete win[EARLY_TAP_GLOBAL];
  document.body.innerHTML = '';
});

describe('early shell tap capture and replay', () => {
  it('records a tap before the owner mounts and replays it exactly once', () => {
    runInlineScript();
    const { button } = addControl('menu');
    button.click();
    expect(claimEarlyTap('menu')).toBe(true);
    expect(claimEarlyTap('menu')).toBe(false);
  });

  it('counts a tap on a descendant of the control (the icon inside the button)', () => {
    runInlineScript();
    const { icon } = addControl('menu');
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(claimEarlyTap('menu')).toBe(true);
  });

  it('ignores clicks elsewhere and keeps each control separate', () => {
    runInlineScript();
    addControl('menu');
    const more = addControl('more');
    document.body.click();
    more.button.click();
    expect(claimEarlyTap('menu')).toBe(false);
    expect(claimEarlyTap('more')).toBe(true);
  });

  it('leaves taps after the owner mounted to React', () => {
    runInlineScript();
    const { button } = addControl('menu');
    expect(claimEarlyTap('menu')).toBe(false);
    button.click();
    expect(claimEarlyTap('menu')).toBe(false);
  });

  it('is idempotent and never throws when a control carries no kind', () => {
    runInlineScript();
    const state = win[EARLY_TAP_GLOBAL];
    runInlineScript();
    expect(win[EARLY_TAP_GLOBAL]).toBe(state);
    const button = document.createElement('button');
    button.setAttribute(EARLY_TAP_ATTR, '');
    document.body.appendChild(button);
    expect(() => button.click()).not.toThrow();
  });

  it('reports no tap when the script never ran (non-document renders)', () => {
    expect(claimEarlyTap('menu')).toBe(false);
  });
});
