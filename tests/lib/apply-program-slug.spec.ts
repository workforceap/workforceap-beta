import { describe, expect, it } from 'vitest';
import { resolveApplyProgramSlug } from '@/lib/apply/applyProgramPage';

describe('resolveApplyProgramSlug', () => {
  it('returns a trimmed slug from a query string or catch-all array', () => {
    expect(resolveApplyProgramSlug('it-support-professional-certificate-ibm')).toBe(
      'it-support-professional-certificate-ibm',
    );
    expect(resolveApplyProgramSlug(['  digital-literacy  ', 'ignored'])).toBe('digital-literacy');
  });

  it('treats missing, blank, and non-string values as no program selection', () => {
    expect(resolveApplyProgramSlug(undefined)).toBeUndefined();
    expect(resolveApplyProgramSlug('')).toBeUndefined();
    expect(resolveApplyProgramSlug('   ')).toBeUndefined();
    expect(resolveApplyProgramSlug([])).toBeUndefined();
  });
});
