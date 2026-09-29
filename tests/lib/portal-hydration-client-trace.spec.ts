import { afterEach, describe, expect, it } from 'vitest';
import {
  recordMarketingNavDecision,
  recordPortalShellDecision,
  recordWorkspaceShellPathname,
} from '@/lib/observability/portalHydrationClientTrace';

const key = '__waPortalHydrationTrace';
const previous = Object.getOwnPropertyDescriptor(window, key);
function setTrace(value: unknown) {
  Object.defineProperty(window, key, { configurable: true, writable: true, value });
}

afterEach(() => {
  if (previous) Object.defineProperty(window, key, previous);
  else Reflect.deleteProperty(window, key);
});

describe('opt-in Preview hydration client trace', () => {
  it('records first and last pathname decisions without changing them', () => {
    const trace = { auditTraceVersion: 1 } as Record<string, unknown>;
    setTrace(trace);

    recordMarketingNavDecision('/dashboard', true);
    recordMarketingNavDecision(null, false);
    recordPortalShellDecision('/dashboard', false);
    recordPortalShellDecision(null, true);
    recordWorkspaceShellPathname('/dashboard');
    recordWorkspaceShellPathname('/employer/messages');

    expect(trace.firstMarketingNavPathname).toBe('/dashboard');
    expect(trace.firstMarketingNavNullPath).toBe(false);
    expect(trace.firstMarketingNavHidden).toBe(true);
    expect(trace.lastMarketingNavPathname).toBeNull();
    expect(trace.lastMarketingNavNullPath).toBe(true);
    expect(trace.lastMarketingNavHidden).toBe(false);
    expect(trace.firstPortalShellPathname).toBe('/dashboard');
    expect(trace.firstPortalShellNullPath).toBe(false);
    expect(trace.firstPortalShellShowNav).toBe(false);
    expect(trace.lastPortalShellPathname).toBeNull();
    expect(trace.lastPortalShellNullPath).toBe(true);
    expect(trace.lastPortalShellShowNav).toBe(true);
    expect(trace.firstShellPathname).toBe('/dashboard');
    expect(trace.lastShellPathname).toBe('/employer/messages');
  });

  it('ignores absent, primitive, unversioned, and frozen globals during render', () => {
    for (const value of [undefined, 'third-party-value', true, { other: true }, Object.freeze({ auditTraceVersion: 1 })]) {
      setTrace(value);
      expect(() => recordMarketingNavDecision('/dashboard', true)).not.toThrow();
      expect(() => recordPortalShellDecision('/dashboard', false)).not.toThrow();
      expect(() => recordWorkspaceShellPathname('/dashboard')).not.toThrow();
    }
    Object.defineProperty(window, key, { configurable: true, get: () => { throw new Error('bad global'); } });
    expect(() => recordMarketingNavDecision('/dashboard', true)).not.toThrow();
  });
});
