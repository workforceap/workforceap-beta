import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPLY_STORAGE_KEY, APPLY_ACCOUNT_DRAFT_KEY, APPLY_DRAFT_TTL_MS, parseApplyDraft, parseSavedEligibility, readApplyDraft, readSavedEligibility, readSelectedPrograms, writeApplyDraft, writeBrowserValue, saveEligibilityForNextStep, saveSelectedPrograms, readAccountDraft, writeAccountDraft, clearApplyBrowserState, type ApplyDraft } from '@/lib/apply/applyBrowserState';
import { APPLY_FLOW_DRAFT_KEY, APPLY_PROGRAM_RANKED_KEY, APPLY_PROGRAM_SLUG_KEY } from '@/lib/apply/applyProgramStorage';
import { PROGRAMS } from '@/lib/content/programs';

const now = Date.UTC(2026, 8, 19);
const draft = () => ({ version: 1, updatedAt: new Date(now).toISOString(), firstName: 'Example', lastName: 'Applicant', email: 'example@example.org', phone: '5125550100', q1: 'yes', q2: 'no' } satisfies ApplyDraft);
const eligibility = () => ({ ...draft(), qualifies: true });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('application state validation and compatibility', () => {
  it('accepts older v1 drafts without a panel or newer optional fields', () => {
    expect(parseApplyDraft(draft(), now)).toEqual(draft());
    expect(parseApplyDraft({ ...draft(), primaryBarrier: 'employment_gap', panel: 'contact' }, now)?.panel).toBe('contact');
  });
  it.each([undefined, 'invalid', '', new Date(now - APPLY_DRAFT_TTL_MS - 1).toISOString(), new Date(now + 600_000).toISOString()])('rejects missing, malformed, expired, or future draft timestamp %s', (updatedAt) => {
    expect(parseApplyDraft({ ...draft(), updatedAt }, now)).toBeNull();
  });
  it.each([{ firstName: {} }, { phone: 5125550100 }, { primaryBarriers: [{}] }, { q1: 'maybe' }, { ageGroup: 'unknown' }, { panel: 'account' }])('rejects values that cannot safely hydrate form controls: %j', (patch) => {
    expect(parseApplyDraft({ ...draft(), ...patch }, now)).toBeNull();
  });
  it('rejects empty or incomplete completed eligibility while retaining legacy untimestamped records', () => {
    expect(parseSavedEligibility({})).toBeNull();
    expect(parseSavedEligibility({ qualifies: true })).toBeNull();
    const { updatedAt: _timestamp, ...older } = eligibility();
    expect(parseSavedEligibility(older)).toEqual(older);
    expect(parseSavedEligibility({ ...older, q1: null })).toBeNull();
    expect(parseSavedEligibility({ ...older, schoolApply: true, q1: null, q2: null })).not.toBeNull();
    expect(parseSavedEligibility({ ...older, qualifies: 'true' })).toBeNull();
  });
  it('checks the local mirror when session reads fail or contain corrupt data', () => {
    const { updatedAt: _timestamp, ...older } = eligibility();
    localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(older));
    sessionStorage.setItem(APPLY_STORAGE_KEY, '{}');
    expect(readSavedEligibility()).toEqual(older);
    const get = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (this === sessionStorage) throw new Error('session unavailable');
      return get.call(this, key);
    });
    expect(readSavedEligibility()).toEqual(older);
  });
  it('retains a seven-day draft and reports failed writes honestly', () => {
    expect(writeApplyDraft({ firstName: 'Example', lastName: '', email: '', phone: '', q1: null, q2: null, panel: 'funding' })).toBe(true);
    expect(readApplyDraft()?.panel).toBe('funding');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(writeApplyDraft({ firstName: 'Changed', lastName: '', email: '', phone: '', q1: null, q2: null })).toBe(false);
    expect(readApplyDraft()?.firstName).toBe('Example');
    expect(writeBrowserValue(APPLY_STORAGE_KEY, eligibility())).toBe(false);
  });
  it('requires real bounded program choices, accepts the original raw single-slug key, and survives unavailable session storage', () => {
    const { updatedAt: _timestamp, ...older } = eligibility();
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(older));
    localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(older));
    sessionStorage.setItem(APPLY_PROGRAM_RANKED_KEY, '["not-a-program"]');
    expect(readSelectedPrograms()).toBeNull();
    sessionStorage.setItem(APPLY_PROGRAM_SLUG_KEY, PROGRAMS[0].slug);
    expect(readSelectedPrograms()).toEqual([PROGRAMS[0].slug]);
    sessionStorage.setItem(APPLY_PROGRAM_RANKED_KEY, '{invalid');
    expect(readSelectedPrograms()).toEqual([PROGRAMS[0].slug]);
    expect(saveSelectedPrograms([PROGRAMS[1].slug])).toBe(true);
    const get = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (this === sessionStorage) throw new Error('blocked');
      return get.call(this, key);
    });
    expect(readSelectedPrograms()).toEqual([PROGRAMS[1].slug]);
  });
  it('does not advance to stale session data when only the local mirror accepts a newer write', () => {
    const first = { firstName: 'Example', lastName: 'Applicant', email: 'example@example.org', phone: '5125550100', q1: 'yes' as const, q2: 'no' as const, qualifies: true };
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(first));
    sessionStorage.setItem(APPLY_PROGRAM_RANKED_KEY, JSON.stringify([PROGRAMS[0].slug]));
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === sessionStorage) throw new Error('session writes blocked');
      set.call(this, key, value);
    });
    expect(saveEligibilityForNextStep({ ...first, firstName: 'Changed' })).toBe(false);
    expect(saveSelectedPrograms([PROGRAMS[1].slug])).toBe(false);
  });
  it('rejects both unbound and paired local choices belonging to a different session applicant', () => {
    const { updatedAt: _timestamp, ...alice } = eligibility();
    const bob = { ...alice, firstName: 'Bob', email: 'bob@example.org' };
    localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(bob));
    expect(saveSelectedPrograms([PROGRAMS[0].slug])).toBe(true);
    sessionStorage.removeItem(APPLY_PROGRAM_RANKED_KEY);
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(alice));
    expect(readSavedEligibility()).toEqual(alice);
    expect(readSelectedPrograms()).toBeNull();
    localStorage.setItem(APPLY_PROGRAM_RANKED_KEY, JSON.stringify([PROGRAMS[0].slug]));
    expect(readSelectedPrograms()).toBeNull();
    expect(saveSelectedPrograms([PROGRAMS[1].slug], bob)).toBe(false);
  });
  it('invalidates choices after any completed eligibility revision changes, even for the same email', () => {
    const first = { ...eligibility(), updatedAt: new Date().toISOString() };
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(first));
    expect(saveSelectedPrograms([PROGRAMS[0].slug])).toBe(true);
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify({ ...first, q1: 'no' }));
    expect(readSelectedPrograms()).toBeNull();
  });
  it('preserves edits within a bound account draft and rejects another applicant’s stale draft', () => {
    const { updatedAt: _timestamp, ...first } = eligibility();
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(first));
    const edits = { firstName: 'Corrected', email: 'corrected@example.org', phone: '5125550200', contactConsent: true };
    expect(writeAccountDraft(edits, first)).toBe(true);
    expect(readAccountDraft()).toEqual(edits);
    const second = { ...first, email: 'different@example.org' };
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(second));
    expect(readAccountDraft()).toBeNull();
    expect(writeAccountDraft(edits, first)).toBe(false);
  });
  it('only hydrates a legacy account draft with matching same-session identity', () => {
    const { updatedAt: _timestamp, ...first } = eligibility();
    const fields = { firstName: 'Corrected', email: first.email, phone: '(512) 555-0100', addressLine1: 'Fixture address', contactConsent: true };
    sessionStorage.setItem(APPLY_ACCOUNT_DRAFT_KEY, JSON.stringify(fields));
    localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(first));
    expect(readAccountDraft()).toBeNull();
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(first));
    expect(readAccountDraft()).toEqual(fields);
    sessionStorage.setItem(APPLY_ACCOUNT_DRAFT_KEY, JSON.stringify({ ...fields, email: 'different@example.org' }));
    expect(readAccountDraft()).toBeNull();
  });
  it('clears only application state, preserving referral and quiz context', () => {
    localStorage.setItem('find_your_path_results', 'quiz');
    localStorage.setItem('partner_ref', 'referral');
    localStorage.setItem(APPLY_FLOW_DRAFT_KEY, '{}');
    sessionStorage.setItem(APPLY_PROGRAM_RANKED_KEY, '[]');
    clearApplyBrowserState();
    expect(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem(APPLY_PROGRAM_RANKED_KEY)).toBeNull();
    expect(localStorage.getItem('find_your_path_results')).toBe('quiz');
    expect(localStorage.getItem('partner_ref')).toBe('referral');
  });
});
