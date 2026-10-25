import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NavigationPending from '@/components/portal/NavigationPending';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

const transition = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({ useLinkStatus: () => transition }));
afterEach(() => { cleanup(); transition.pending = false; });

describe('navigation transition feedback', () => {
  it('announces only the actual pending transition and clears when it ends', () => {
    const view = () => <NextIntlClientProvider locale="en" messages={en}>
      <NavigationPending />
    </NextIntlClientProvider>;
    const { rerender } = render(view());
    expect(screen.queryByRole('status')).toBeNull();
    transition.pending = true;
    rerender(view());
    expect(screen.getByRole('status')).toHaveTextContent(en.nav.menuLoading);
    transition.pending = false;
    rerender(view());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses the active language for the loading announcement', () => {
    transition.pending = true;
    render(<NextIntlClientProvider locale="es" messages={es}><NavigationPending /></NextIntlClientProvider>);
    expect(screen.getByRole('status')).toHaveTextContent(es.nav.menuLoading);
  });
});
