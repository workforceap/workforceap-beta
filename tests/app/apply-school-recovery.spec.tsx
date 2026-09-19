import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PROGRAMS } from '@/lib/content/programs';
import { ApplyResumeGate } from '@/components/apply/ApplyReadiness';
import { applyRecoveryHref } from '@/lib/apply/applyRecoveryHref';
import { APPLY_FLOW_DRAFT_KEY } from '@/lib/apply/applyProgramStorage';
const h = vi.hoisted(() => ({ school: vi.fn(), results: vi.fn(), account: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'server-ref-cookie' }) }) }));
vi.mock('@/lib/apply/resolveSchoolApply', () => ({ resolveSchoolApply: h.school }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async () => ({}) }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useFormatter: () => ({ dateTime: () => 'Saved date' }) }));
vi.mock('@/components/Footer', () => ({ default: () => null }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) => <a href={`/fr${href}`} onClick={onClick}>{children}</a> }));
vi.mock('@/app/apply/results/ApplyResultsClient', () => ({ default: (props: unknown) => { h.results(props); return null; } }));
vi.mock('@/app/apply/create-account/ApplyCreateAccountForm', () => ({ default: (props: unknown) => { h.account(props); return null; } }));
import ResultsPage from '@/app/apply/results/page';
import AccountPage from '@/app/apply/create-account/page';
const slug = PROGRAMS[0].slug;
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); h.school.mockResolvedValue({ partnerId: 'school-1', partnerName: 'School', schoolName: 'School', referralCode: 'trusted-school', programSlugs: [slug] }); });
afterEach(cleanup);

describe('trusted school apply recovery', () => {
 it.each(['results', 'account'])('passes the server-resolved referral and permitted program from the %s wrapper', async kind => {
  render(await (kind === 'results' ? ResultsPage : AccountPage)({ searchParams: Promise.resolve({ program: slug }) }));
  expect(h.school).toHaveBeenCalledWith('server-ref-cookie');
  expect((kind === 'results' ? h.results : h.account).mock.calls[0][0].recoveryContext).toEqual({ referralRef: 'trusted-school', programSlug: slug });
 });
 it.each(['results', 'account'])('revalidates an explicit recovery ref in the existing %s lookup', async kind => {
  render(await (kind === 'results' ? ResultsPage : AccountPage)({ searchParams: Promise.resolve({ ref: 'recovery-school', program: slug }) }));
  expect(h.school).toHaveBeenCalledTimes(1);
  expect(h.school).toHaveBeenCalledWith('recovery-school');
  // Only the verified resolver output enters recovery links, never the raw ref.
  expect((kind === 'results' ? h.results : h.account).mock.calls[0][0].recoveryContext.referralRef).toBe('trusted-school');
 });
 it('does not invent a trusted school referral from browser state and omits unrecognized or out-of-catalog programs', async () => {
  localStorage.setItem('apply_eligibility', JSON.stringify({ schoolName: 'Untrusted school' }));
  h.school.mockResolvedValueOnce(null);
  render(await ResultsPage({ searchParams: Promise.resolve({ program: 'unrecognized' }) }));
  expect(h.results.mock.calls[0][0].recoveryContext).toEqual({ referralRef: undefined, programSlug: undefined });
  cleanup();
  render(await AccountPage({ searchParams: Promise.resolve({ program: PROGRAMS[1].slug }) }));
  expect(h.account.mock.calls[0][0].recoveryContext).toEqual({ referralRef: 'trusted-school', programSlug: undefined });
 });
 it('retains school ref and program through localized resume and restart links while clearing only application drafts', () => {
  const draft = { version: 1 as const, updatedAt: new Date().toISOString(), firstName: '', lastName: '', email: '', phone: '', q1: null, q2: null };
  localStorage.setItem(APPLY_FLOW_DRAFT_KEY, JSON.stringify(draft));
  localStorage.setItem('partner_ref', 'trusted-school');
  render(<ApplyResumeGate draft={draft} recoveryContext={{ referralRef: 'trusted-school', programSlug: slug }} />);
  expect(screen.getByRole('link', { name: 'resumeContinueDetails' })).toHaveAttribute('href', `/fr/apply?ref=trusted-school&program=${slug}`);
  const restart = screen.getByRole('link', { name: 'resumeStartOver' });
  expect(restart).toHaveAttribute('href', `/fr/apply?ref=trusted-school&program=${slug}`);
  restart.addEventListener('click', event => event.preventDefault()); fireEvent.click(restart);
  expect(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)).toBeNull(); expect(localStorage.getItem('partner_ref')).toBe('trusted-school');
 });
 it('keeps program-selection recovery on the same trusted school path', () => {
  render(<ApplyResumeGate draft={null} hasEligibility recoveryContext={{ referralRef: 'trusted-school', programSlug: slug }} />);
  expect(screen.getByRole('link', { name: 'resumeChoosePrograms' })).toHaveAttribute('href', `/fr/apply/results?ref=trusted-school&program=${slug}`);
 });
 it('encodes referral values as query data and preserves ordinary cold-entry paths', () => {
  expect(applyRecoveryHref('/apply', { referralRef: 'school&other=1' })).toBe('/apply?ref=school%26other%3D1');
  expect(applyRecoveryHref('/apply/create-account')).toBe('/apply/create-account');
 });
});
