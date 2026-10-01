/**
 * `<PartnerRefCapture>` is the shared `?ref=` capture behind both doors.
 * `/apply` keeps its clear-on-bare-visit rule (a leftover school ref on a
 * family device must not stamp an organic applicant); `/signup` must not
 * clear, because it is reached *after* the ref was captured upstream.
 *
 * Behaviour only: these assert on persisted state, not on source text.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.params }));

import PartnerRefCapture from '@/components/marketing/PartnerRefCapture';
import ApplyRefCapture from '@/components/apply/ApplyRefCapture';
import { APPLY_REFERRAL_SESSION_KEY, readPersistedPartnerRef } from '@/lib/apply/applyReferralCapture';

function visit(query: string, element: React.ReactElement) {
  mocks.params = new URLSearchParams(query);
  render(element);
}

beforeEach(() => {
  sessionStorage.clear();
  document.cookie = 'wap_partner_ref=; Path=/; Max-Age=0';
});

afterEach(cleanup);

describe('partner ref capture', () => {
  it('persists a normalized ?ref= on the signup door', () => {
    visit('ref=Acme-HS', <PartnerRefCapture />);

    expect(readPersistedPartnerRef()).toBe('acme-hs');
  });

  it('leaves an upstream ref intact when the signup door carries none', () => {
    sessionStorage.setItem(APPLY_REFERRAL_SESSION_KEY, 'concordia-hs');

    visit('', <PartnerRefCapture />);

    expect(readPersistedPartnerRef()).toBe('concordia-hs');
  });

  it('still expires a stale ref on a bare /apply landing', () => {
    sessionStorage.setItem(APPLY_REFERRAL_SESSION_KEY, 'concordia-hs');

    visit('', <ApplyRefCapture />);

    expect(readPersistedPartnerRef()).toBeNull();
  });

  it('still persists ?ref= on /apply', () => {
    visit('ref=concordia-hs', <ApplyRefCapture />);

    expect(readPersistedPartnerRef()).toBe('concordia-hs');
  });

  it('ignores a malformed ref instead of persisting it', () => {
    visit('ref=not%20a%20ref!!', <PartnerRefCapture />);

    expect(readPersistedPartnerRef()).toBeNull();
  });
});
