import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

vi.mock('next/navigation', () => ({ usePathname: () => '/en/login' }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/components/theme/ThemeToggle', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => null }));
vi.mock('@/lib/auth/currentUserClient', () => ({ CURRENT_USER_MAX_AGE_MS: 1000, fetchCurrentUser: async () => ({ role: null }) }));

import MainNav from '@/components/MainNav';

afterEach(cleanup);

describe('public mobile navigation', () => {
  it.each([['en', en], ['es', es], ['fr', fr], ['pt', pt]] as const)(
    'shows the localized menu label and preserves Escape focus in %s',
    (locale, messages) => {
      render(<NextIntlClientProvider locale={locale} messages={messages}><MainNav /></NextIntlClientProvider>);
      const toggle = screen.getByRole('button', { name: messages.nav.menu });
      expect(toggle).toHaveTextContent(messages.nav.menu);
      expect(toggle).toHaveAccessibleName(messages.nav.menu);
      toggle.focus();
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveTextContent(messages.nav.menu);
      expect(toggle).toHaveAccessibleName(messages.nav.menu);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAccessibleName(messages.nav.menu);
      expect(toggle).toHaveFocus();
    },
  );
});
