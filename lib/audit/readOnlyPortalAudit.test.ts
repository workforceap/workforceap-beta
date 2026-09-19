import { describe, expect, it } from 'vitest';
import {
  READ_ONLY_PORTAL_AUDIT_HEADER,
  isValidReadOnlyPortalAuditToken,
  isReadOnlyPortalAuditHeader,
} from './readOnlyPortalAudit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('read-only portal audit header', () => {
  it('requires the exact internal header value', () => {
    expect(
      isReadOnlyPortalAuditHeader(new Headers({ [READ_ONLY_PORTAL_AUDIT_HEADER]: '1' })),
    ).toBe(true);
    expect(
      isReadOnlyPortalAuditHeader(new Headers({ [READ_ONLY_PORTAL_AUDIT_HEADER]: 'true' })),
    ).toBe(false);
    expect(isReadOnlyPortalAuditHeader(new Headers())).toBe(false);
  });

  it('accepts only an exact capability token of at least 32 characters', () => {
    const token = 'a'.repeat(32);
    expect(isValidReadOnlyPortalAuditToken(token, token)).toBe(true);
    expect(isValidReadOnlyPortalAuditToken(`${token}x`, token)).toBe(false);
    expect(isValidReadOnlyPortalAuditToken('short', 'short')).toBe(false);
    expect(isValidReadOnlyPortalAuditToken(null, token)).toBe(false);
  });

  it('requires middleware to strip public audit headers and re-mint only after auth', () => {
    const source = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');
    expect(source).toContain('requestHeaders.delete(READ_ONLY_PORTAL_AUDIT_HEADER)');
    expect(source).toContain('requestHeaders.delete(READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER)');
    expect(source).toMatch(/if \(user\?\.id && validReadOnlyAuditToken\)\s*\{\s*requestHeaders\.set\(READ_ONLY_PORTAL_AUDIT_HEADER, '1'\)/);
  });
});
