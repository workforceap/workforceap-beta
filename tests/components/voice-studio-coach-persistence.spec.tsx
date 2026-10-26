import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import {
  VoiceStudioKit,
  type VoiceStudioAgentKey,
  type VoiceStudioKitProps,
} from '@/components/portal/kit/pages/VoiceStudioKit';

const navigation = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  usePathname: () => '/dashboard/ai-tools',
  useSearchParams: () => navigation.params,
}));

beforeEach(() => {
  navigation.params = new URLSearchParams('source=dashboard');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mount(props: VoiceStudioKitProps = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={pickPortalClientMessages(en)}>
      <VoiceStudioKit {...props} />
    </NextIntlClientProvider>,
  );
}

function lastNavigation() {
  const [href, options] = navigation.router.replace.mock.lastCall!;
  expect(options).toEqual({ scroll: false });
  const url = new URL(href, 'https://workforceap.org');
  expect(url.pathname).toBe('/dashboard/ai-tools');
  expect(url.searchParams.get('source')).toBe('dashboard');
  return url.searchParams;
}

const coaches: [VoiceStudioAgentKey, string][] = [
  ['readiness', 'Readiness Coach'],
  ['resume', 'Resume Coach'],
  ['mock', 'Mock Interview'],
  ['counselor', 'Lilley · AI career coach'],
  ['business', 'Career & Business Coach'],
];

describe('voice coach selection across tabs and refresh', () => {
  it.each(coaches)('retains %s through every other tab and refresh', (key, label) => {
    let view = mount();

    // The default Practice view must not invent a selected coach in the URL.
    fireEvent.click(screen.getByRole('radio', { name: 'Practice' }));
    expect(lastNavigation().has('agent')).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: 'Coaches' }));

    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
    expect(lastNavigation().get('agent')).toBe(key);
    expect(lastNavigation().get('tab')).toBe('session');

    const otherTabs: [string, VoiceStudioKitProps['initialTab']][] = [
      ['Resume', 'studio'],
      ['All Tools', 'toolkit'],
      ['Coaches', 'coaches'],
    ];

    for (const [tabLabel, tab] of otherTabs) {
      // Search params deliberately lag router.replace until a refresh, as
      // they can during rapid tab changes in the real Next.js router.
      fireEvent.click(screen.getByRole('radio', { name: tabLabel }));
      const params = lastNavigation();
      expect(params.get('agent')).toBe(key);
      expect(params.get('tab')).toBe(tab === 'coaches' ? null : tab);

      view.unmount();
      navigation.params = params;
      view = mount({ initialTab: tab, initialAgent: params.get('agent') as VoiceStudioAgentKey });
      expect(screen.getByRole('region', { name: tabLabel })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: 'Practice' }));
      expect(within(screen.getByRole('region', { name: 'Practice' }))
        .getByRole('heading', { name: label })).toBeInTheDocument();
      expect(lastNavigation().get('agent')).toBe(key);
      expect(lastNavigation().get('tab')).toBe('session');
    }

    expect(fetch).not.toHaveBeenCalled();
  });
});
