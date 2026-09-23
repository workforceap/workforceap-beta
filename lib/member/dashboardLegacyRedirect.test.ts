import { describe, expect, it } from 'vitest';
import { legacyDashboardRedirectTarget, wellFormedProgramSlug } from './dashboardLegacyRedirect';

describe('legacyDashboardRedirectTarget (WAP-195)', () => {
  it('renders the home when no retired switch is present', () => {
    expect(legacyDashboardRedirectTarget(undefined)).toBeNull();
    expect(legacyDashboardRedirectTarget({})).toBeNull();
    expect(legacyDashboardRedirectTarget({ program: 'it-support' })).toBeNull();
    // Only `ui=legacy` is the retired home; other ui values are not ours to redirect.
    expect(legacyDashboardRedirectTarget({ ui: 'kit' })).toBeNull();
  });

  it('sends ?ui=legacy and any ?tab= to the one home', () => {
    expect(legacyDashboardRedirectTarget({ ui: 'legacy' })).toBe('/dashboard');
    expect(legacyDashboardRedirectTarget({ ui: ' legacy ' })).toBe('/dashboard');
    expect(legacyDashboardRedirectTarget({ tab: 'learning' })).toBe('/dashboard');
    expect(legacyDashboardRedirectTarget({ tab: 'opportunities' })).toBe('/dashboard');
    expect(legacyDashboardRedirectTarget({ tab: '' })).toBe('/dashboard');
    expect(legacyDashboardRedirectTarget({ ui: 'legacy', tab: 'home' })).toBe('/dashboard');
    expect(legacyDashboardRedirectTarget({ ui: ['legacy', 'kit'] })).toBe('/dashboard');
  });

  it('keeps a well-formed ?program= slug through the redirect', () => {
    expect(legacyDashboardRedirectTarget({ ui: 'legacy', program: 'google-it-support' })).toBe(
      '/dashboard?program=google-it-support',
    );
    expect(legacyDashboardRedirectTarget({ tab: 'learning', program: ['data-analytics-professional-certificate-google', 'x'] })).toBe(
      '/dashboard?program=data-analytics-professional-certificate-google',
    );
    expect(legacyDashboardRedirectTarget({ tab: 'learning', program: '  IT-Support ' })).toBe('/dashboard?program=it-support');
  });

  it('drops a ?program= value that could never be a slug', () => {
    for (const program of ['', '   ', '../admin', 'it support', 'it-support?x=1', 'a--b', '-lead', 'x'.repeat(121), '<script>']) {
      expect(legacyDashboardRedirectTarget({ ui: 'legacy', program }), JSON.stringify(program)).toBe('/dashboard');
    }
  });
});

describe('wellFormedProgramSlug', () => {
  it('accepts lowercase hyphenated slugs and nothing else', () => {
    expect(wellFormedProgramSlug('comptia-a-plus')).toBe('comptia-a-plus');
    expect(wellFormedProgramSlug(undefined)).toBeNull();
    expect(wellFormedProgramSlug([])).toBeNull();
    expect(wellFormedProgramSlug('it_support')).toBeNull();
  });
});
