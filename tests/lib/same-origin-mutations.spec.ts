// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EnrollmentAgreementError, enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { requireSameOrigin } from '@/lib/enrollmentAgreements/http';
import { ApiError, requireSameOriginMutation } from '@/lib/billing/twoStage/api/http';
import { requireLabMutationOrigin } from '@/lib/member/labApi';

const ENROLLMENT = 'https://portal.test/api/enrollment-agreements/template/send';
const BILLING = 'https://admin.test/api/admin/members/1/billing/two-stage/cases/1/j5/draft';
const LAB = 'https://portal.test/api/member/labs/ticket-triage/draft';

function request(url: string, headers: HeadersInit = {}, method = 'POST') {
  return new Request(url, { method, headers });
}

describe('enrollment agreement same-origin gate', () => {
  it('allows a same-origin browser POST and a same-site request with no Origin', () => {
    expect(() =>
      requireSameOrigin(request(ENROLLMENT, { origin: 'https://portal.test', 'sec-fetch-site': 'same-origin' })),
    ).not.toThrow();
    expect(() => requireSameOrigin(request(ENROLLMENT))).not.toThrow();
  });

  it('refuses a cross-site fetch and an Origin that is not this host', () => {
    const refused: HeadersInit[] = [
      { origin: 'https://portal.test', 'sec-fetch-site': 'cross-site' },
      { origin: 'https://evil.test' },
    ];
    for (const headers of refused) {
      try {
        requireSameOrigin(request(ENROLLMENT, headers));
        expect.unreachable('cross-origin enrollment mutation must throw');
      } catch (error) {
        expect(error).toBeInstanceOf(EnrollmentAgreementError);
        expect(error).toMatchObject({ status: 403, code: 'INVALID_ORIGIN' });
      }
    }
  });
});

describe('billing and lab mutation same-origin gates', () => {
  it('requires a matching Origin on J5/J6 mutations', () => {
    expect(() =>
      requireSameOriginMutation(request(BILLING, { origin: 'https://admin.test' })),
    ).not.toThrow();
    expect(() => requireSameOriginMutation(request(BILLING))).toThrow(ApiError);
    try {
      requireSameOriginMutation(request(BILLING, { origin: 'https://evil.test' }));
      expect.unreachable('cross-origin billing mutation must throw');
    } catch (error) {
      expect(error).toMatchObject({ status: 403, body: { code: 'ORIGIN_REJECTED' } });
    }
    try {
      requireSameOriginMutation(
        request(BILLING, { origin: 'https://admin.test', 'sec-fetch-site': 'cross-site' }),
      );
      expect.unreachable('cross-site billing mutation must throw');
    } catch (error) {
      expect(error).toMatchObject({ status: 403, body: { code: 'ORIGIN_REJECTED' } });
    }
  });

  it('requires a matching Origin and JSON content type on lab evidence writes', async () => {
    const allowed = requireLabMutationOrigin(
      request(LAB, { origin: 'https://portal.test', 'content-type': 'application/json; charset=utf-8' }),
    );
    expect(allowed).toBeNull();

    const missingOrigin = requireLabMutationOrigin(
      request(LAB, { 'content-type': 'application/json' }),
    );
    expect(missingOrigin?.status).toBe(403);
    expect(await missingOrigin?.json()).toMatchObject({ error: 'This request must come from the current site.' });

    const wrongType = requireLabMutationOrigin(
      request(LAB, { origin: 'https://portal.test', 'content-type': 'text/plain' }),
    );
    expect(wrongType?.status).toBe(415);
  });
});

describe('enrollmentAgreementErrorResponse', () => {
  it('keeps typed refusal codes without leaking provider diagnostics', async () => {
    const typed = enrollmentAgreementErrorResponse(
      new EnrollmentAgreementError(403, 'FORBIDDEN', 'Administrator access is required.'),
    );
    expect(typed.status).toBe(403);
    expect(typed.headers.get('cache-control')).toContain('no-store');
    expect(await typed.json()).toEqual({
      error: 'Administrator access is required.',
      code: 'FORBIDDEN',
    });
  });

  it('maps an unexpected error to a generic 503 without path, SQL, or ENOENT text', async () => {
    const leaked = new Error('ENOENT: no such file or directory, open /var/secrets/workforceap-enrollment-2026.pdf');
    const response = enrollmentAgreementErrorResponse(leaked);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body).toEqual({
      error: 'Enrollment agreements are temporarily unavailable. Please try again later.',
      code: 'ENROLLMENT_AGREEMENTS_UNAVAILABLE',
    });
    expect(JSON.stringify(body)).not.toMatch(/ENOENT|secrets|enrollment-2026|\.pdf|SQL/i);
  });
});
