import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import DevVoiceStudioLayout from '@/app/dev/voice-studio/layout';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';
import { pickRootClientMessages } from '@/lib/i18n/pickRootClientMessages';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

vi.mock('next-intl/server', () => ({ getLocale: vi.fn(), getMessages: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dev/voice-studio',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('standalone voice-studio fixture messages', () => {
  it.each([
    ['en', en],
    ['es', es],
    ['fr', fr],
    ['pt', pt],
  ] as const)('renders localized guidance beneath the root message slice (%s)', async (locale, catalog) => {
    vi.mocked(getLocale).mockResolvedValue(locale);
    vi.mocked(getMessages).mockResolvedValue(catalog);
    const intlError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const layout = await DevVoiceStudioLayout({ children: <VoiceStudioKit /> });

    render(
      <NextIntlClientProvider
        locale={locale}
        messages={pickRootClientMessages(catalog)}
        onError={intlError}
      >
        {layout}
      </NextIntlClientProvider>,
    );

    expect(intlError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.getByText(catalog.aiToolsDiscovery.hubIntro)).toBeVisible();
    const startingPoints = within(screen.getByRole('region', { name: catalog.aiToolsDiscovery.startTitle }));
    expect(startingPoints.getByRole('link', { name: catalog.aiToolsDiscovery.resume }))
      .toHaveAttribute('href', '/dashboard/resume');
    expect(startingPoints.getByRole('link', { name: catalog.memberWorkspace.interviews.title }))
      .toHaveAttribute('href', '/dashboard/ai-tools/interviews');
    expect(startingPoints.getByRole('link', { name: catalog.aiToolsDiscovery.coverLetter }))
      .toHaveAttribute('href', '/dashboard/ai-tools/cover-letter');
  });
});
