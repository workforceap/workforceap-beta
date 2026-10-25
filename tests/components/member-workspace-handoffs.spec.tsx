import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import InterviewWorkspaceClient from '@/components/portal/InterviewWorkspaceClient';
import TrainingBridgeClient from '@/components/portal/TrainingBridgeClient';
import { MemberTrainingNav } from '@/components/portal/MemberCareerSteps';
import type { SavedSkillMapperRun } from '@/lib/member/skillMapperRun';

const selected: SavedSkillMapperRun = { id: 'owned-old', occupationTitle: 'Computer User Support Specialists', occupationCode: '15-1232.00', skills: [{ name: 'Troubleshooting', score: 90 }], radarAxes: [{ axis: 'Engineering', value: 80 }], createdAt: '2026-10-20T12:00:00Z', demo: false };
const recent: SavedSkillMapperRun = { ...selected, id: 'owned-new', occupationTitle: 'Software Developers', occupationCode: '15-1252.00' };
const show = (ui: ReactElement) => render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('member interview entry', () => {
  it('keeps four distinct modes, editable role context and human support without starting network/media', () => {
    const fetcher = vi.fn(); const getUserMedia = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    show(<InterviewWorkspaceClient initialRole="IT support" />);
    fireEvent.change(screen.getByRole('textbox', { name: /Target role/ }), { target: { value: 'Cloud & network support' } });
    const routes = ['interview-practice', 'interview-coach', 'voice-interview', 'interview-prep'];
    const links = screen.getAllByRole('link', { name: /^Open (Prepare answers|Practice with AI|Recorded mock|Prep bundle)$/ });
    expect(links).toHaveLength(4);
    links.forEach((link, index) => {
      const url = new URL(link.getAttribute('href')!, 'https://example.test');
      expect(url.pathname).toBe(`/dashboard/ai-tools/${routes[index]}`);
      expect(url.searchParams.get('role')).toBe('Cloud & network support');
    });
    expect(screen.getByText('Written questions and STAR answer frames')).toBeInTheDocument();
    expect(screen.getByText('Text or microphone')).toBeInTheDocument();
    expect(screen.getByText('Microphone; optional camera and recording consent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messages with your human counselor' })).toHaveAttribute('href', '/dashboard/messages');
    expect(fetcher).not.toHaveBeenCalled(); expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('training context handoff', () => {
  it('names the exact saved lookup and keeps its comparison link, selection, and all program actions', () => {
    show(<TrainingBridgeClient assessment={selected} recentAssessments={[recent, selected]} />);
    expect(screen.getByText(`Selected lookup: ${selected.occupationTitle}`)).toBeInTheDocument();
    expect(screen.getByText(/This lookup describes occupation requirements, not your proficiency/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open this skill comparison' })).toHaveAttribute('href', '/dashboard/ai-tools/skill-mapper?result=owned-old');
    const select = screen.getByRole('combobox', { name: 'Choose a saved Skill Mapper lookup' });
    expect(select).toHaveValue('owned-old');
    fireEvent.change(select, { target: { value: 'owned-new' } });
    expect(select.closest('form')).toHaveAttribute('method', 'get');
    expect(select.closest('form')).toHaveAttribute('action', '/dashboard/ai-tools/training-bridge');
    expect(new FormData(select.closest('form')!).get('result')).toBe('owned-new');
    expect(screen.getByRole('link', { name: 'My assigned program' })).toHaveAttribute('href', '/dashboard/program');
    expect(screen.getByRole('link', { name: 'Discuss with my human counselor' })).toHaveAttribute('href', '/dashboard/messages');
    expect(screen.getByRole('link', { name: 'View this program’s application' })).toHaveAttribute('href', expect.stringMatching(/^\/apply\?program=/));
  });
  it('requires another explicit selection after an unavailable run and does not show the newest as selected', () => {
    show(<TrainingBridgeClient assessment={null} recentAssessments={[recent]} selectionUnavailable />);
    expect(screen.getByRole('alert')).toHaveTextContent('No other result has been substituted');
    expect(screen.getByRole('combobox', { name: 'Choose a saved Skill Mapper lookup' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Use selected lookup' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Open this skill comparison' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Select a target lookup or explore training' })).toBeInTheDocument();
  });
  it('preserves a selected program slug when moving between assigned training and resources', () => {
    show(<MemberTrainingNav current="learning" programSlug="secondary-program" />);
    const nav = within(screen.getByRole('navigation', { name: 'Training and progress' }));
    expect(nav.getByRole('link', { name: 'My program' })).toHaveAttribute('href', '/dashboard/program?program=secondary-program');
    expect(nav.getByRole('link', { name: 'Learning hub & resources' })).toHaveAttribute('aria-current', 'page');
    // The tab names its destination: /dashboard/readiness is titled "My progress" (rail label and page h1).
    expect(nav.getByRole('link', { name: 'My progress' })).toHaveAttribute('href', '/dashboard/readiness');
  });
});
