import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import WioaQualificationClient from '@/components/portal/WioaQualificationClient';
import WioaQualificationLoading from '@/components/portal/WioaQualificationLoading';
import AdminMemberWioaReviewPanel from '@/components/admin/AdminMemberWioaReviewPanel';
import WioaScreeningReadonly from '@/components/admin/WioaScreeningReadonly';
import { computeWioaSignal, formatWioaReasons, type WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), voice: vi.fn(), pathname: '/wioa-qualification' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: (props: { title: string }) => { mocks.voice(props); return <div>{props.title}</div>; } }));
const messages = { en, es, fr, pt };
const answers = { ageBracket: '55_plus' as const, countyOrZip: 'Saved County', primaryBarrier: 'childcare' as const, dislocatedWorker: true, lowIncomeSelfReport: true, trainingInterest: false, completedIntakeSelfReport: true, publicAssistanceSelfReport: false };
const saved: WioaQualificationSnapshot = { version: 2, submittedAt: '2026-09-19T12:00:00Z', answers, ...computeWioaSignal(answers) };
function show(locale: keyof typeof messages, mode: 'public' | 'member' = 'member', snapshot: WioaQualificationSnapshot | null = null) {
  mocks.pathname = `/${locale}/wioa-qualification`;
  return render(<NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="America/New_York"><WioaQualificationClient mode={mode} initialSnapshot={snapshot} /></NextIntlClientProvider>);
}

describe('localized WIOA assessment', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); });

  it.each(['en', 'es', 'fr', 'pt'] as const)('renders %s initial public form and loading state without missing translations', (locale) => {
    const text = messages[locale].wioa;
    const view = show(locale, 'public');
    expect(screen.getByRole('heading', { level: 1, name: text.title })).toBeInTheDocument();
    expect(screen.getByLabelText(text.fullName)).toHaveAttribute('required');
    expect(screen.getByLabelText(text.email)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(text.phone)).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText(text.age)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: text.send })).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(/wioa\.(?:reasons|errors|signals|barriers)/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    view.unmount();
    render(<NextIntlClientProvider locale={locale} messages={messages[locale]}><WioaQualificationLoading /></NextIntlClientProvider>);
    expect(screen.getByRole('status')).toHaveTextContent(text.loading);
  });

  it.each(['en', 'es'] as const)('hydrates every saved answer and shows translated legacy results in %s', (locale) => {
    const text = messages[locale].wioa;
    show(locale, 'member', { ...saved, version: 1, reasons: [...formatWioaReasons(saved), 'Custom historical note'] });
    expect(screen.getByLabelText(text.age)).toHaveValue('55_plus');
    expect(screen.getByLabelText(text.county)).toHaveValue('Saved County');
    expect(screen.getByLabelText(text.barrier)).toHaveValue('childcare');
    expect(screen.getByRole('checkbox', { name: text.unemployed })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: text.lowIncome })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: text.training })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: text.intake })).toBeChecked();
    expect(screen.getByRole('radio', { name: text.no })).toBeChecked();
    expect(screen.getByText(text.reasons.dislocated_worker)).toBeInTheDocument();
    expect(screen.getByText(text.reasons.legacy.replace('{text}', 'Custom historical note'))).toBeInTheDocument();
  });

  it.each(['en', 'es'] as const)('submits and displays %s new reasons and honest delivery status', async (locale) => {
    const text = messages[locale].wioa;
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ snapshot: saved, emailSent: false })));
    show(locale);
    fireEvent.click(screen.getByRole('button', { name: text.save }));
    await screen.findByText(text.signals.likely.title);
    expect(screen.getByText(text.reasons.dislocated_worker)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(text.savedNoEmail);
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent.publicAssistanceSelfReport).toBeNull();
    expect(sent.trainingInterest).toBe(true);
  });

  it.each(['en', 'es'] as const)('localizes %s API and network errors without exposing server English', async (locale) => {
    const text = messages[locale].wioa;
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Raw backend detail', errorCode: 'conflict' }), { status: 409 })).mockRejectedValueOnce(new Error('offline'));
    show(locale);
    fireEvent.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.conflict);
    expect(screen.queryByText('Raw backend detail')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: text.save })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: text.save }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text.errors.network));
  });

  it('does not treat an invalid success payload as a saved assessment', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, snapshot: { version: 2, reasons: [{ code: 'unknown' }] } })));
    show('es');
    fireEvent.click(screen.getByRole('button', { name: es.wioa.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(es.wioa.errors.unknown);
    expect(screen.queryByText(es.wioa.resultMember)).not.toBeInTheDocument();
  });

  it('switches to translated voice preparation without saving or supplying completion endpoints', () => {
    show('es', 'public');
    fireEvent.click(screen.getByRole('radio', { name: es.wioa.voiceMode }));
    expect(screen.getByText(es.wioa.voiceTitle)).toBeInTheDocument();
    expect(screen.getByText(es.wioa.publicModeHelp)).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    const props = mocks.voice.mock.calls.at(-1)![0];
    expect(props).toMatchObject({ sessionEndpoint: '/api/public/wioa-qualification/voice-session', dataUseNotice: es.wioa.voiceDataUse, speakingLabel: es.wioa.speaking });
    expect(props.completionEndpoint).toBeUndefined();
    expect(props.checkpointEndpoint).toBeUndefined();
  });

  it('renders new reason objects as explanations in both staff views', () => {
    const props = { snapshot: saved, reviewStatus: null, reviewedAt: null, reviewerName: null, reviewNotes: null };
    render(<><AdminMemberWioaReviewPanel {...props} memberId="member-1" decisionHistory={[]} /><WioaScreeningReadonly {...props} /></>);
    expect(screen.getAllByText(en.wioa.reasons.dislocated_worker)).toHaveLength(2);
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });
});
