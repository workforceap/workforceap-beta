import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

describe('Career Studio consolidation', () => {
  it('uses Voice Studio as the canonical AI tools experience', () => {
    const page = source('app/(portal)/dashboard/ai-tools/page.tsx');

    expect(page).toContain('VoiceStudioKit');
    expect(page).toContain("path: '/dashboard/ai-tools'");
    expect(page).toContain(": 'coaches';");
  });

  it('keeps the member toolkit proof on VoiceStudioKit, not MemberToolkitKit', () => {
    const proof = source('app/dev/member/toolkit/page.tsx');

    expect(proof).toContain('VoiceStudioKit');
    expect(proof).not.toMatch(/from '@\/components\/portal\/kit\/pages\/member\/MemberToolkitKit'/);
  });

  it('does not load resume data for the default Coaches tab', () => {
    const page = source('app/(portal)/dashboard/ai-tools/page.tsx');
    const studio = source('components/portal/kit/pages/VoiceStudioKit.tsx');

    expect(page).toContain("initialTab === 'studio'");
    expect(page).toContain("{ hasResume: false }");
    expect(studio).toContain("new URLSearchParams(searchParams?.toString() ?? '')");
    expect(studio).toContain("router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false })");
    expect(studio).toContain("selectTab(v as StudioTab)");
  });

  it('redirects duplicate entrypoints into canonical Studio tabs', () => {
    const legacyStudio = source('app/(portal)/dashboard/ai-tools/studio/page.tsx');
    const legacyToolkit = source('app/(portal)/dashboard/toolkit/page.tsx');

    expect(legacyStudio).toContain("redirect(`/dashboard/ai-tools${query ? `?${query}` : ''}`)");
    expect(legacyToolkit).toContain("redirect('/dashboard/ai-tools?tab=toolkit')");
  });

  it('exposes one AI Career Tools entry in member navigation', () => {
    const nav = source('lib/nav/portalNav.ts');

    expect(nav).toContain("href: '/dashboard/ai-tools', label: 'AI Career Tools'");
    expect(nav).not.toContain("label: 'Voice + Career Studio'");
    expect(nav).not.toContain("href: '/dashboard/toolkit', label: 'Career Toolkit'");
  });

  it('sends the member home Career Studio link to the canonical hub', () => {
    const home = source('components/portal/kit/pages/member/MemberHomeKit.tsx');
    const loader = source('lib/member/loadMemberDashboardHome.ts');

    expect(home).toContain("toolkitHref = '/dashboard/ai-tools'");
    expect(loader).toContain("toolkitHref: '/dashboard/ai-tools'");
    expect(home).not.toContain("toolkitHref = '/dashboard/toolkit'");
    expect(loader).not.toContain("toolkitHref: '/dashboard/toolkit'");
  });

  it('does not claim local voice transcripts are saved or drop personalized context', () => {
    const studio = source('components/portal/kit/pages/VoiceStudioKit.tsx');

    expect(studio).toContain("phase === 'ended' ? 'NOT SAVED TO WAP'");
    expect(studio).not.toContain("phase === 'ended' ? 'SAVED'");
    expect(studio).not.toContain('Retry once without dynamic variables');
    expect(studio).toContain('Your personalized coach context could not be attached');
  });

  it('shows Lilley data-use terms before every session start', () => {
    const studio = source('components/portal/kit/pages/VoiceStudioKit.tsx');
    const renderedNotice = studio.indexOf("dataUseNotice && (phase === 'idle' || phase === 'ended')");
    const controls = studio.indexOf('{/* controls — real start / mute / end depending on phase */}');

    expect(studio.match(/dataUseNotice: LILLEY_DATA_USE_NOTICE/g)).toHaveLength(2);
    expect(studio).toContain("endpoint: '/api/counselor/session'");
    expect(studio).toContain("endpoint: '/api/member/career-business-coach/voice-session'");
    expect(studio).toContain('ElevenLabs processes your microphone audio and live transcript');
    expect(studio).toContain('only the saved next-step, program, and progress facts needed for Lilley');
    expect(studio).toContain('through approved read-only tools');
    expect(studio).toContain('This AI Career Tools session does not save the transcript to your WorkforceAP AI history or coach memory');
    expect(studio).toContain("dataUseNotice && (phase === 'idle' || phase === 'ended')");
    expect(studio).toContain('aria-label="Voice session data use"');
    expect(studio).toContain('href="/privacy"');
    expect(renderedNotice).toBeGreaterThan(-1);
    expect(controls).toBeGreaterThan(renderedNotice);
  });

});
