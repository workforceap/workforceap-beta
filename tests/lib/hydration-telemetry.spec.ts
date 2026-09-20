import { describe, expect, it, vi } from 'vitest';
import {
  createHydrationErrorListener,
  extractReactErrorCode,
  isHydrationError,
  isUntaggedGlobalHandlerHydrationEvent,
  redactRouteIds,
  tagHydrationError,
} from '@/lib/observability/hydrationTelemetry';

const MINIFIED_418 =
  'Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]=Sun%2C%20Sep%2014 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.';
const DEV_HYDRATION = "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client.";

describe('hydration telemetry (WAP-16)', () => {
  it('reads the React error code from minified messages and react.dev links', () => {
    expect(extractReactErrorCode(MINIFIED_418)).toBe('418');
    expect(extractReactErrorCode('Error at https://react.dev/errors/423?x=1')).toBe('423');
    expect(extractReactErrorCode(DEV_HYDRATION)).toBeNull();
    expect(extractReactErrorCode('Minified React error #310')).toBe('310');
  });

  it('classifies hydration and Suspense-hydration recoveries but not other errors', () => {
    expect(isHydrationError(new Error(MINIFIED_418))).toBe(true);
    expect(isHydrationError(new Error('Minified React error #423; visit https://react.dev/errors/423'))).toBe(true);
    expect(isHydrationError(new Error('Minified React error #425'))).toBe(true);
    expect(isHydrationError(new Error(DEV_HYDRATION))).toBe(true);
    expect(isHydrationError(new Error('Text content does not match server-rendered HTML.'))).toBe(true);
    // Rendered more hooks (#310) is a render bug, not a hydration recovery.
    expect(isHydrationError(new Error('Minified React error #310; visit https://react.dev/errors/310'))).toBe(false);
    expect(isHydrationError(new TypeError("Cannot read properties of null (reading 'parentNode')"))).toBe(false);
    expect(isHydrationError(null)).toBe(false);
    expect(isHydrationError(undefined, 'Script error.')).toBe(false);
    // ErrorEvent without an error object still carries the message.
    expect(isHydrationError(undefined, DEV_HYDRATION)).toBe(true);
  });

  it('redacts ids so routes stay a bounded, PII-free tag', () => {
    expect(redactRouteIds('/admin/members/3f9c2a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f/program')).toBe('/admin/members/[id]/program');
    expect(redactRouteIds('/dashboard/jobs/48213')).toBe('/dashboard/jobs/[id]');
    expect(redactRouteIds('/counselor/students/cm1x2y3z4a5b6c7d8e9f0g1h2')).toBe('/counselor/students/[id]');
    expect(redactRouteIds('/dashboard/weekly-recap')).toBe('/dashboard/weekly-recap');
    expect(redactRouteIds('')).toBe('/');
  });

  it('tags a recoverable error with its locale-stripped route and code', () => {
    expect(tagHydrationError(new Error(MINIFIED_418), '/es/dashboard/weekly-recap')).toEqual({
      route: '/dashboard/weekly-recap',
      locale: 'es',
      reactErrorCode: '418',
      message: 'Minified React error #418; visit https://react.dev/errors/418 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
    });
    expect(tagHydrationError(new Error(DEV_HYDRATION), '/dashboard/referrals')).toMatchObject({
      route: '/dashboard/referrals',
      locale: null,
      reactErrorCode: null,
    });
    expect(tagHydrationError(new Error(MINIFIED_418), '/en/admin/members/3f9c2a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f')).toMatchObject({
      route: '/admin/members/[id]',
      locale: 'en',
    });
    expect(tagHydrationError(new Error('boom'), '/dashboard')).toBeNull();
  });

  it('listener forwards only hydration recoveries, with the current pathname', () => {
    const forward = vi.fn();
    let pathname = '/fr/dashboard/points';
    const listener = createHydrationErrorListener({ getPathname: () => pathname, forward });

    const other = new Error('Network request failed');
    listener({ error: other, message: other.message });
    expect(forward).not.toHaveBeenCalled();

    const hydration = new Error(MINIFIED_418);
    listener({ error: hydration, message: hydration.message });
    expect(forward).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ route: '/dashboard/points', locale: 'fr', reactErrorCode: '418' }),
      hydration,
    );

    pathname = '/dashboard/program/start';
    listener({ message: DEV_HYDRATION });
    expect(forward).toHaveBeenCalledTimes(2);
    const [report, error] = forward.mock.calls[1]!;
    expect(report).toMatchObject({ route: '/dashboard/program/start', locale: null, reactErrorCode: null });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(DEV_HYDRATION);
  });

  it('beforeSend drops only the untagged onerror copy of a hydration recovery', () => {
    const onerror = (value: string, tags?: Record<string, string>) => ({
      tags,
      exception: { values: [{ type: 'Error', value, mechanism: { type: 'onerror' } }] },
    });
    // Sentry's global handler copy: same window event the listener already forwarded.
    expect(isUntaggedGlobalHandlerHydrationEvent(onerror(MINIFIED_418))).toBe(true);
    expect(isUntaggedGlobalHandlerHydrationEvent(onerror(DEV_HYDRATION))).toBe(true);
    // The route-tagged copy is kept.
    expect(isUntaggedGlobalHandlerHydrationEvent(onerror(MINIFIED_418, { hydration: 'true', route: '/dashboard' }))).toBe(false);
    // Non-hydration global errors and error-boundary captures are kept.
    expect(isUntaggedGlobalHandlerHydrationEvent(onerror('Network request failed'))).toBe(false);
    expect(isUntaggedGlobalHandlerHydrationEvent({
      exception: { values: [{ type: 'Error', value: MINIFIED_418, mechanism: { type: 'generic' } }] },
    })).toBe(false);
    expect(isUntaggedGlobalHandlerHydrationEvent({})).toBe(false);
  });
});
