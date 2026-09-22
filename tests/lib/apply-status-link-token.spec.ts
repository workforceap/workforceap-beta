import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLICATION_STATUS_LINK_TTL_MINUTES,
  buildApplicationStatusLinkUrl,
  emailMatchesStatusLink,
  hashEmailForStatusLink,
  issueApplicationStatusLinkToken,
  verifyApplicationStatusLinkToken,
} from '@/lib/apply/statusLinkToken';

/**
 * Product call 28a: the status link is a signed, single-purpose, expiring
 * token bound to one application and one email. No table backs it, so these
 * properties are the whole security model of the link.
 */
const NOW = new Date('2026-09-22T16:00:00Z');
const args = {
  applicationId: 'app-1111',
  organizationId: 'org-2222',
  email: 'Applicant@Example.org',
  now: NOW,
};

beforeEach(() => {
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'unit-test-trust-secret');
  vi.stubEnv('APPLICATION_STATUS_LINK_SECRET', '');
  vi.stubEnv('CRON_SECRET', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('application status link token', () => {
  it('round-trips the application, its org and a keyed email hash, expiring in 30 minutes', () => {
    const token = issueApplicationStatusLinkToken(args);
    const verified = verifyApplicationStatusLinkToken(token, NOW);
    expect(verified).toMatchObject({ ok: true, applicationId: 'app-1111', organizationId: 'org-2222' });
    if (!verified.ok) throw new Error('expected ok');
    expect(verified.expiresAt.getTime() - NOW.getTime()).toBe(APPLICATION_STATUS_LINK_TTL_MINUTES * 60_000);
    expect(APPLICATION_STATUS_LINK_TTL_MINUTES).toBe(30);
    expect(emailMatchesStatusLink(verified.emailHash, 'applicant@example.org')).toBe(true);
    expect(emailMatchesStatusLink(verified.emailHash, '  APPLICANT@example.org ')).toBe(true);
    expect(emailMatchesStatusLink(verified.emailHash, 'someone-else@example.org')).toBe(false);
  });

  it('never carries the email itself, in the token or the URL', () => {
    const token = issueApplicationStatusLinkToken(args);
    const decoded = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
    expect(decoded).not.toMatch(/example\.org/i);
    expect(token).not.toMatch(/example/i);
    const url = buildApplicationStatusLinkUrl(token, 'https://www.workforceap.org/');
    expect(url).toBe(`https://www.workforceap.org/apply/status/view?t=${encodeURIComponent(token)}`);
    expect(url).not.toMatch(/applicant|example\.org/i);
    // The keyed hash is not a plain digest anyone can recompute from the address.
    expect(hashEmailForStatusLink(args.email)).not.toBe(
      Buffer.from(require('crypto').createHash('sha256').update('applicant@example.org').digest()).toString('base64url'),
    );
  });

  it('expires exactly at the deadline', () => {
    const token = issueApplicationStatusLinkToken(args);
    const justBefore = new Date(NOW.getTime() + 30 * 60_000 - 1000);
    const atDeadline = new Date(NOW.getTime() + 30 * 60_000);
    expect(verifyApplicationStatusLinkToken(token, justBefore).ok).toBe(true);
    expect(verifyApplicationStatusLinkToken(token, atDeadline)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyApplicationStatusLinkToken(token, new Date(NOW.getTime() + 24 * 3600_000))).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a payload edited to point at another application or org', () => {
    const token = issueApplicationStatusLinkToken(args);
    const [payload, signature] = token.split('.');
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    for (const edit of [{ sub: 'app-9999' }, { org: 'org-9999' }, { exp: body.exp + 86_400 }, { eh: hashEmailForStatusLink('other@example.org') }]) {
      const forged = `${Buffer.from(JSON.stringify({ ...body, ...edit })).toString('base64url')}.${signature}`;
      expect(verifyApplicationStatusLinkToken(forged, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    }
  });

  it('rejects a damaged or foreign signature, garbage, and other versions', () => {
    const token = issueApplicationStatusLinkToken(args);
    const [payload, signature] = token.split('.');
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    expect(verifyApplicationStatusLinkToken(`${payload}.${flipped}`, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyApplicationStatusLinkToken(`${payload}.short`, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyApplicationStatusLinkToken('', NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyApplicationStatusLinkToken(null, NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyApplicationStatusLinkToken('no-dot-here', NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyApplicationStatusLinkToken(`${payload}.`, NOW)).toEqual({ ok: false, reason: 'malformed' });

    // A token signed under a different secret is foreign.
    vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'a-rotated-secret');
    expect(verifyApplicationStatusLinkToken(token, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('prefers the dedicated secret and refuses to run with none', () => {
    const borrowed = issueApplicationStatusLinkToken(args);
    vi.stubEnv('APPLICATION_STATUS_LINK_SECRET', 'dedicated-secret');
    expect(verifyApplicationStatusLinkToken(borrowed, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyApplicationStatusLinkToken(issueApplicationStatusLinkToken(args), NOW).ok).toBe(true);

    vi.stubEnv('APPLICATION_STATUS_LINK_SECRET', '');
    vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', '');
    vi.stubEnv('CRON_SECRET', '');
    expect(() => issueApplicationStatusLinkToken(args)).toThrow(/APPLICATION_STATUS_LINK_SECRET/);
  });

  it('refuses to mint without the binding fields', () => {
    expect(() => issueApplicationStatusLinkToken({ ...args, applicationId: '' })).toThrow(TypeError);
    expect(() => issueApplicationStatusLinkToken({ ...args, organizationId: '' })).toThrow(TypeError);
  });
});
