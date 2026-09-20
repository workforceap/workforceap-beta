import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import ApplyEligibilityClient from '@/app/apply/ApplyEligibilityClient';
import ApplyResultsClient from '@/app/apply/results/ApplyResultsClient';
import ApplyCreateAccountForm from '@/app/apply/create-account/ApplyCreateAccountForm';
import { APPLY_FLOW_DRAFT_KEY, APPLY_PROGRAM_RANKED_KEY } from '@/lib/apply/applyProgramStorage';
import { APPLY_STORAGE_KEY, APPLY_ACCOUNT_DRAFT_KEY, saveSelectedPrograms } from '@/lib/apply/applyBrowserState';
import { PROGRAMS } from '@/lib/content/programs';

const mocks = vi.hoisted(() => ({ push: vi.fn(), track: vi.fn(), params: new URLSearchParams('program=fixture') }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => mocks.params }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en', localizeHref: (href: string) => `/en${href}` }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: mocks.track }));
vi.mock('@/lib/analytics/conversionValue', () => ({ trackConversionWithValue: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

const wrap = (children: ReactNode) => <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{children}</NextIntlClientProvider>;
const fullDraft = (patch = {}) => ({ version: 1, updatedAt: new Date().toISOString(), firstName: 'Example', lastName: 'Applicant', email: 'example@example.org', phone: '5125550100', q1: 'yes', q2: 'no', q3: 'yes', receivingUnemployment: 'no', exhaustedUnemployment: 'no', snapWic: 'no', ageGroup: '25_50', city: 'Austin', state: 'TX', zip: '78701', county: 'Travis', primaryBarriers: ['seeking_skills_training'], hearAbout: 'Google', ...patch });
const saveDraft = (patch = {}) => localStorage.setItem(APPLY_FLOW_DRAFT_KEY, JSON.stringify(fullDraft(patch)));
const saveEligibility = () => localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify({ ...fullDraft(), qualifies: true }));
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('short eligibility panels preserve existing rules and drafts', () => {
  it('shows only funding first, validates the visible panel, then persists and focuses contact', async () => {
    render(wrap(<ApplyEligibilityClient />));
    expect(screen.queryByLabelText(en.form.firstNameRequired)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.apply.eligibilityPanelNext }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]));
    for (const radio of screen.getAllByRole('radio', { name: /yes/i })) fireEvent.click(radio);
    // WAP-53: answering yes to TANF/WIC/SNAP reveals the benefit follow-ups and blocks the panel until they are answered.
    expect(screen.getByRole('group', { name: en.apply.eligibilityPublicAssistanceProgramsPrompt })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: en.apply.eligibilityPanelNext }));
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toContain(en.apply.eligibilityPublicAssistanceProgramsError);
    expect(screen.queryByLabelText(en.form.firstNameRequired)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: en.apply.publicAssistanceTanf }));
    fireEvent.click(screen.getByRole('radio', { name: en.apply.answerYes, checked: false }));
    fireEvent.click(screen.getByRole('button', { name: en.apply.eligibilityPanelNext }));
    await waitFor(() => expect(document.activeElement).toHaveTextContent(en.apply.eligibilityPanelContact));
    expect(screen.getByLabelText(en.form.firstNameRequired)).toBeVisible();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(JSON.parse(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)!)).toMatchObject({ version: 1, panel: 'contact', q1: 'yes', q2: 'yes', snapWic: 'yes', publicAssistancePrograms: ['tanf'], publicAssistanceHelpRequested: 'yes' });
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('hydrates a legacy v1 draft, advances locally, and keeps the program URL on successful storage', () => {
    saveDraft();
    render(wrap(<ApplyEligibilityClient />));
    fireEvent.click(screen.getByRole('button', { name: en.apply.eligibilityPanelNext }));
    expect(screen.getByLabelText(en.form.firstNameRequired)).toHaveValue('Example');
    fireEvent.click(screen.getByRole('button', { name: en.apply.eligibilityPanelNext }));
    fireEvent.click(screen.getByRole('button', { name: en.apply.continueToPrograms }));
    expect(mocks.push).toHaveBeenCalledWith('/en/apply/results?program=fixture');
    expect(JSON.parse(sessionStorage.getItem(APPLY_STORAGE_KEY)!)).toMatchObject({ q1: 'yes', q2: 'no', q3: 'yes', qualifies: true, primaryBarriers: ['seeking_skills_training'] });
    expect(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)).toBeNull();
  });
  it('never deletes the saved draft or navigates when neither eligibility store can save', () => {
    saveDraft({ panel: 'background' });
    render(wrap(<ApplyEligibilityClient />));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    fireEvent.click(screen.getByRole('button', { name: en.apply.continueToPrograms }));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)).not.toBeNull();
    expect(screen.getByText(en.apply.storageContinueFailed)).toBeVisible();
    expect(screen.queryByText(en.apply.autoSavedNotice)).toBeNull();
  });
  it('does not claim autosave or explicit save succeeded on quota failure', async () => {
    vi.useFakeTimers();
    saveDraft({ panel: 'contact' });
    render(wrap(<ApplyEligibilityClient />));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    fireEvent.change(screen.getByLabelText(en.form.firstNameRequired), { target: { value: 'Updated' } });
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(screen.getByText(en.apply.storageSaveFailed)).toBeVisible();
    expect(screen.queryByText(en.apply.autoSavedNotice)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.apply.saveContinueLater }));
    expect(screen.queryByText(en.apply.saveContinueHint)).toBeNull();
  });
  it('skips funding for school students and still requires guardian details for minors', () => {
    saveDraft({ ageGroup: 'under_18', gradeLevel: '11', parentGuardianName: '', parentGuardianEmail: '', panel: 'contact' });
    render(wrap(<ApplyEligibilityClient schoolApply={{ partnerId: 'fixture', partnerName: 'Fixture School', schoolName: 'Fixture School', referralCode: 'fixture-ref', programSlugs: [PROGRAMS[0].slug] }} />));
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('heading', { name: /Part 1 of 2/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: en.apply.eligibilityPanelNext }));
    fireEvent.click(screen.getByRole('button', { name: en.apply.continueToPrograms }));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(document.getElementById('apply-guardian-name')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(document.getElementById('apply-guardian-name')!, { target: { value: 'Guardian Example' } });
    fireEvent.change(document.getElementById('apply-guardian-email')!, { target: { value: 'guardian@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: en.apply.continueToPrograms }));
    expect(mocks.push).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(APPLY_STORAGE_KEY)!)).toMatchObject({ schoolApply: true, q1: null, q2: null, q3: null, qualifies: true, primaryBarriers: ['high_school_student'], parentGuardianEmail: 'guardian@example.org' });
  });
});

describe('results and account readiness gates', () => {
  const header = <h1>Ready step hero</h1>;
  it.each(['results', 'account'])('never includes the ready hero in the initial %s server render', (page) => {
    const html = renderToString(wrap(page === 'results' ? <ApplyResultsClient readyHeader={header} /> : <ApplyCreateAccountForm readyHeader={header} />));
    expect(html).not.toContain('Ready step hero');
  });
  it.each(['results', 'account'])('gives cold-entry %s a direct start action instead of a step loop', (page) => {
    localStorage.setItem(APPLY_STORAGE_KEY, '{}');
    render(wrap(page === 'results' ? <ApplyResultsClient readyHeader={header} /> : <ApplyCreateAccountForm readyHeader={header} />));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.apply.resultsMissingResumeTitle);
    expect(screen.queryByText('Ready step hero')).toBeNull();
    expect(screen.getByRole('link', { name: en.apply.resumeStart })).toHaveAttribute('href', '/apply');
    expect(screen.queryByRole('link', { name: en.apply.resumeChoosePrograms })).toBeNull();
  });
  it('reports a valid draft and last saved date, with a direct resume action', () => {
    saveDraft({ panel: 'contact' });
    render(wrap(<ApplyResultsClient readyHeader={header} />));
    expect(screen.getByText(/Draft last saved:/)).toBeVisible();
    expect(screen.getByRole('link', { name: en.apply.resumeContinueDetails })).toHaveAttribute('href', '/apply');
    const restart = screen.getByRole('link', { name: en.apply.resumeStartOver });
    restart.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(restart);
    expect(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)).toBeNull();
  });
  it('sends account users with completed eligibility but no valid choices directly to program selection', () => {
    saveEligibility();
    sessionStorage.setItem(APPLY_PROGRAM_RANKED_KEY, '["unknown"]');
    render(wrap(<ApplyCreateAccountForm readyHeader={header} />));
    expect(screen.queryByText('Ready step hero')).toBeNull();
    expect(screen.getByRole('link', { name: en.apply.resumeChoosePrograms })).toHaveAttribute('href', '/apply/results');
  });
  it('allows local recovery for both steps when session reads throw, including account hydration', () => {
    saveEligibility();
    expect(saveSelectedPrograms([PROGRAMS[0].slug])).toBe(true);
    const get = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (this === sessionStorage) throw new Error('blocked');
      return get.call(this, key);
    });
    const results = render(wrap(<ApplyResultsClient readyHeader={header} />));
    expect(screen.getByText('Ready step hero')).toBeVisible();
    results.unmount();
    render(wrap(<ApplyCreateAccountForm readyHeader={header} />));
    expect(screen.getByText('Ready step hero')).toBeVisible();
    expect(document.getElementById('firstName')).toHaveValue('Example');
  });
  it('does not unlock the account form using a different applicant’s saved local choices', () => {
    saveEligibility();
    expect(saveSelectedPrograms([PROGRAMS[0].slug])).toBe(true);
    sessionStorage.removeItem(APPLY_PROGRAM_RANKED_KEY);
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify({ ...fullDraft(), firstName: 'Another', email: 'another@example.org', qualifies: true }));
    render(wrap(<ApplyCreateAccountForm readyHeader={header} />));
    expect(screen.queryByText('Ready step hero')).toBeNull();
    expect(screen.getByRole('link', { name: en.apply.resumeChoosePrograms })).toHaveAttribute('href', '/apply/results');
  });
  it('does not prefill another person’s contact or consent from an unbound account draft', () => {
    saveEligibility();
    expect(saveSelectedPrograms([PROGRAMS[0].slug])).toBe(true);
    sessionStorage.setItem(APPLY_ACCOUNT_DRAFT_KEY, JSON.stringify({ firstName: 'Another', email: 'another@example.org', phone: '5125550999', contactConsent: true }));
    render(wrap(<ApplyCreateAccountForm readyHeader={header} />));
    expect(document.getElementById('firstName')).toHaveValue('Example');
    expect(document.getElementById('email')).toHaveValue('example@example.org');
    expect(document.getElementById('contactConsent')).not.toBeChecked();
  });
  it('preserves compatible original same-session eligibility and raw program selection', () => {
    const { updatedAt: _timestamp, ...older } = fullDraft();
    sessionStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify({ ...older, qualifies: true }));
    sessionStorage.setItem(APPLY_PROGRAM_RANKED_KEY, JSON.stringify([PROGRAMS[0].slug]));
    render(wrap(<ApplyCreateAccountForm readyHeader={header} />));
    expect(screen.getByText('Ready step hero')).toBeVisible();
  });
  it('checks the displayed applicant and choices again before any signup request', async () => {
    saveEligibility();
    expect(saveSelectedPrograms([PROGRAMS[0].slug])).toBe(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No real submissions allowed'));
    const { container } = render(wrap(<ApplyCreateAccountForm readyHeader={header} />));
    fireEvent.change(document.getElementById('password')!, { target: { value: 'FixturePassword123!' } });
    fireEvent.change(document.getElementById('confirmPassword')!, { target: { value: 'FixturePassword123!' } });
    fireEvent.click(document.getElementById('contactConsent')!);
    localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify({ ...fullDraft(), firstName: 'Another', email: 'another@example.org', qualifies: true }));
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(screen.queryByText('Ready step hero')).toBeNull());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
