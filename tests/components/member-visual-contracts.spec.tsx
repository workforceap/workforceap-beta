import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';
import { MemberCertificatesKit } from '@/components/portal/kit/pages/member/MemberCertificatesKit';
import { MemberProgressKit } from '@/components/portal/kit/pages/member/MemberProgressKit';
import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';
import MemberDashboardVoiceSection from '@/components/portal/MemberDashboardVoiceSection';
import VoiceCoachesPromo from '@/components/portal/VoiceCoachesPromo';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/(portal)/dashboard/_actions/analyticsActions', () => ({ logCourseraLaunchFromPortal: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stat(label: string) {
  const labelElement = [...document.querySelectorAll('.wa-kit-stat-label')].find((element) => element.textContent === label)!;
  return labelElement.parentElement!.querySelector('.wa-kit-stat-value') as HTMLElement;
}

describe('categorical totals retain their value without status-like colors', () => {
  it.each([0, 3])('job totals remain neutral at %i and real application status stays distinct', (value) => {
    render(<MemberJobsKit saved={value} applied={value} interviewing={value} offers={value} applications={[{ id: 'fixture', role: 'Fixture role', company: 'Fixture company', location: 'Remote', applied: 'Sep19', stage: 'Interview scheduled', tone: 'warn' }]} />);
    for (const label of ['Saved', 'Applied', 'Interviewing', 'Offers']) {
      expect(stat(label)).toHaveTextContent(String(value));
      expect(stat(label).style.color).toBe('');
      expect(stat(label).closest('.wa-kit-card')!.className).not.toMatch(/wa-kit-tone--/);
    }
    expect(screen.getAllByText('Interview scheduled').length).toBeGreaterThan(0);
  });

  it.each([0, 2])('credential totals keep the Verified label and value %i without inventing a verification state', (value) => {
    render(<MemberCertificatesKit earnedCount={value} inProgressCount={value} verifiedCount={value} />);
    for (const label of ['Earned', 'In progress', 'Verified']) {
      expect(stat(label)).toHaveTextContent(String(value));
      expect(stat(label).style.color).toBe('');
      expect(stat(label).closest('.wa-kit-card')!.className).not.toMatch(/wa-kit-tone--/);
    }
    expect(document.querySelectorAll('.wa-kit-stat-value')).toHaveLength(3);
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument();
  });

  it('keeps readiness category percentages unchanged and distinguishes a failed read from zero', () => {
    const view = render(<MemberProgressKit readinessScore={25} weekStats={[{ value: '0%', label: 'Profile fixture', color: 'var(--wa-gold)' }, { value: '100%', label: 'Resume fixture', color: 'var(--wa-success)' }]} />);
    for (const [label, value] of [['Profile fixture', '0%'], ['Resume fixture', '100%']]) {
      const number = screen.getByText(label).previousElementSibling as HTMLElement;
      expect(number).toHaveTextContent(value);
      expect(number.style.color).toBe('var(--wa-text)');
    }
    view.rerender(<MemberProgressKit loadFailed />);
    expect(screen.getByText("Couldn't load your readiness score")).toBeInTheDocument();
    expect(screen.queryByText('Profile fixture')).not.toBeInTheDocument();
  });
});

describe('program and coach presentation preserves actions', () => {
  it.each([false, true])('uses the independent hero action pair without changing course navigation (Coursera=%s)', (coursera) => {
    const href = coursera ? '/api/member/coursera/launch?course=fixture' : '/dashboard/learning';
    render(<MemberProgramKit courseraLaunchHref={coursera ? href : undefined} resumeHref={href} missionsHref="/dashboard/missions" />);
    const action = screen.getByRole('link', { name: coursera ? 'Resume in Coursera' : 'Open Learning Hub' });
    expect(action).toHaveAttribute('href', href);
    expect(action.style.background).toBe('var(--wa-hero-action-bg)');
    expect(action.style.color).toBe('var(--wa-hero-action-text)');
    expect(action.style.whiteSpace).toBe('normal');
    expect(action).toHaveClass('wa-kit-focus--on-dark');
    if (coursera) expect(action).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Open missions' }).style.color).toBe('var(--wa-gold-dark)');
  });

  it('uses dark text-bearing coach gradients without opening a voice session', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<VoiceStudioKit />);
    const readiness = screen.getByRole('heading', { name: 'Readiness Coach' }).closest('button')!;
    expect(readiness.style.background).toContain('--wa-hero-gold');
    const resume = screen.getByRole('heading', { name: 'Resume Coach' }).closest('button')!;
    expect(resume.style.background).toContain('--wa-hero-crimson');
    expect(readiness.querySelector('button, a')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('gold is a fill, not a text foreground (WAP-100)', () => {
  it.each([
    ['home AI coaches band', () => <MemberDashboardVoiceSection />],
    ['toolkit voice promo', () => <VoiceCoachesPromo />],
  ])('%s puts white CTA text on the hero-gold floor, never on brand gold', (_name, Surface) => {
    render(<Surface />);
    const ctas = screen.getAllByRole('link').filter((link) => (link as HTMLElement).style.color === 'rgb(255, 255, 255)');
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      const background = (cta as HTMLElement).style.background;
      expect(background).not.toMatch(/#a47f38|#9b7834|#c79a45/i);
      if (/gold/i.test(background)) expect(background).toContain('--wa-hero-gold');
    }
    // The Elevator Introduction and Readiness Coach CTAs are the gold surfaces on these bands.
    const build = screen.getByRole('link', { name: /Build intro/ }) as HTMLElement;
    expect(build.style.background).toContain('var(--wa-hero-gold)');
    const goldSessions = screen.getAllByRole('link', { name: 'Start voice session' }).filter((link) => /gold/i.test((link as HTMLElement).style.background));
    expect(goldSessions.length).toBeGreaterThanOrEqual(1);
    for (const cta of goldSessions) expect((cta as HTMLElement).style.background).toContain('var(--wa-hero-gold)');
  });
});

describe('focus ownership', () => {
  it('keeps the generic portal fallback on native controls and off both opted-in kit variants', () => {
    const css = readFileSync(path.resolve(__dirname, '../../css/portal-a11y.css'), 'utf8');
    const selector = css.match(/(\.portal-touch-target :is[^{}]+)\{/)![1].replaceAll(':focus-visible', '').trim();
    const view = render(<div className="portal-touch-target"><button>Native</button><textarea aria-label="Native notes" /><button className="wa-kit-focus">Kit</button><button className="wa-kit-focus--on-dark">Dark kit</button></div>);
    expect(screen.getByRole('button', { name: 'Native' }).matches(selector)).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Native notes' }).matches(selector)).toBe(true);
    expect(screen.getByRole('button', { name: 'Kit' }).matches(selector)).toBe(false);
    expect(screen.getByRole('button', { name: 'Dark kit' }).matches(selector)).toBe(false);
    expect(view.container.querySelector('[tabindex]')).toBeNull();
  });
});
