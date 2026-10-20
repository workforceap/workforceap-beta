import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginStaffDataReadiness } from '../scripts/lib/portal-c-browser-readiness.mjs';

const origin = 'https://preview.test';
const memberPath = '/counselor/students/fixture-member';
const resumePath = '/api/counselor/members/fixture-member/resume';
const resume = { hasOriginal: false, hasEnhanced: false };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function staffPage() {
  const count = vi.fn(async () => 0);
  return Object.assign(new EventEmitter(), {
    waitForFunction: vi.fn(async (predicate: () => boolean) => {
      if (!predicate()) throw new Error('Fixture is not ready.');
    }),
    getByRole: () => ({ filter: () => ({ count }) }),
    count,
  });
}

function response(body: unknown = resume, url = origin + resumePath, method = 'GET') {
  return { url: () => url, request: () => ({ method: () => method }), status: () => 200, json: vi.fn(async () => body) };
}

function expectClean(page: ReturnType<typeof staffPage>) {
  expect(page.listenerCount('response')).toBe(0);
  expect(page.listenerCount('close')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
}

describe('bounded staff response and rendering readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<h1>Member</h1><p>No resume on file yet.</p><button>Refresh queue</button>';
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('accepts healthy responses observed before ready and releases its listeners and timer', async () => {
    const page = staffPage();
    const ready = beginStaffDataReadiness(page, '/partner/attention', origin, 100);
    const bodies = {
      'members/needs-attention': { members: [], counts: { all: 0, high: 0, medium: 0, low: 0, watch: 0 }, total: 0, nextCursor: null },
      outreach: { logs: [] }, 'referral-members': { members: [] }, 'team-assign': { users: [] },
    };
    for (const [path, body] of Object.entries(bodies)) page.emit('response', response(body, `${origin}/api/partner/${path}`));
    await expect(ready()).resolves.toBeUndefined();
    expect(page.waitForFunction).toHaveBeenCalledTimes(2);
    expectClean(page);
  });

  it('rejects a stalled JSON body at the original deadline and observes a late rejection safely', async () => {
    const page = staffPage();
    const body = deferred<unknown>();
    const headers = response(body.promise);
    const ready = beginStaffDataReadiness(page, memberPath, origin, 100);
    page.emit('response', headers);
    let settled = false;
    const completion = expect(ready()).rejects.toThrow('member resume response did not complete').then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(99);
    expect(headers.json).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await completion;
    expectClean(page);
    body.reject(new Error('Late private transport diagnostic'));
    await vi.advanceTimersByTimeAsync(0);
    await expect(ready()).rejects.toThrow('member resume response did not complete');
    expectClean(page);
  });

  it('does not renew the deadline after headers, body parsing, or the first rendering check', async () => {
    const page = staffPage();
    page.waitForFunction.mockImplementation(() => new Promise(() => {}));
    const body = deferred<unknown>();
    const ready = beginStaffDataReadiness(page, memberPath, origin, 100);
    const completion = expect(ready()).rejects.toThrow('rendering did not complete before the readiness deadline');
    await vi.advanceTimersByTimeAsync(30);
    page.emit('response', response(body.promise));
    await vi.advanceTimersByTimeAsync(30);
    body.resolve(resume);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.waitForFunction).toHaveBeenCalledWith(expect.any(Function), undefined, { timeout: 40 });
    await vi.advanceTimersByTimeAsync(40);
    await completion;
    expectClean(page);
  });

  it('also bounds the final error-state inspection', async () => {
    const page = staffPage();
    page.count.mockImplementation(() => new Promise(() => {}));
    const ready = beginStaffDataReadiness(page, memberPath, origin, 100);
    page.emit('response', response());
    const completion = expect(ready()).rejects.toThrow('readiness deadline');
    await vi.advanceTimersByTimeAsync(100);
    await completion;
    expect(page.count).toHaveBeenCalledTimes(1);
    expectClean(page);
  });

  it('does not accept a foreign-origin or non-GET response and cleans up missing-header waits', async () => {
    const page = staffPage();
    const ready = beginStaffDataReadiness(page, memberPath, origin, 100);
    const foreign = response(resume, `https://elsewhere.test${resumePath}`);
    const write = response(resume, origin + resumePath, 'POST');
    page.emit('response', foreign);
    page.emit('response', write);
    const completion = expect(ready()).rejects.toThrow('member resume response did not complete');
    await vi.advanceTimersByTimeAsync(100);
    await completion;
    expect(foreign.json).not.toHaveBeenCalled();
    expect(write.json).not.toHaveBeenCalled();
    expectClean(page);
  });

  it('can dispose an abandoned navigation before ready without orphaned rejection or listeners', async () => {
    const page = staffPage();
    const ready = beginStaffDataReadiness(page, memberPath, origin, 100);
    ready.dispose();
    expectClean(page);
    await expect(ready()).rejects.toThrow('member resume response did not complete');
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });

  it('stops observing on page close while a response body is pending', async () => {
    const page = staffPage();
    const body = deferred<unknown>();
    const ready = beginStaffDataReadiness(page, memberPath, origin, 100);
    page.emit('response', response(body.promise));
    const completion = expect(ready()).rejects.toThrow('member resume response did not complete');
    page.emit('close');
    await completion;
    expectClean(page);
    body.resolve(resume);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });
});
