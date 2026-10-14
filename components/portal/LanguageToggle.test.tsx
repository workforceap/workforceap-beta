import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LanguageToggle from './LanguageToggle';

const mockReplace = vi.fn();
const mockReload = vi.fn();
const nav = vi.hoisted(() => ({ pathname: '/es/about', locale: 'es' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => nav.pathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => nav.locale,
}));

vi.mock('@/lib/i18n/client', () => ({
  setLocaleCookie: vi.fn(),
}));

describe('LanguageToggle', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockReload.mockClear();
    nav.pathname = '/es/about';
    nav.locale = 'es';
    vi.stubGlobal('location', { reload: mockReload });
  });

  it('renders all language options', () => {
    render(<LanguageToggle />);
    expect(screen.getByLabelText('selectLanguage')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Español' })).toBeInTheDocument();
    // FR/PT are gated behind REVIEWED_LOCALES until their translations pass
    // human review — only reviewed languages are offered.
    expect(screen.queryByRole('option', { name: 'Français' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Português' })).not.toBeInTheDocument();
  });

  it('sets current locale from pathname', () => {
    render(<LanguageToggle />);
    const select = screen.getByLabelText('selectLanguage') as HTMLSelectElement;
    expect(select.value).toBe('es');
  });

  it('switches locale on prefixed path via router.replace', () => {
    render(<LanguageToggle />);
    const select = screen.getByLabelText('selectLanguage');
    fireEvent.change(select, { target: { value: 'es' } });
    expect(mockReplace).toHaveBeenCalledWith('/es/about');
  });

  it('shows the cookie locale on unprefixed portal paths so English can be picked again', () => {
    nav.pathname = '/dashboard';
    nav.locale = 'es';
    render(<LanguageToggle />);
    const select = screen.getByLabelText('selectLanguage') as HTMLSelectElement;
    expect(select.value).toBe('es');
    fireEvent.change(select, { target: { value: 'en' } });
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('offers English as a button in compact mode on a Spanish portal page', () => {
    nav.pathname = '/dashboard';
    nav.locale = 'es';
    render(<LanguageToggle compact />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
