import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LanguageToggle from './LanguageToggle';

const mockAssign = vi.fn();
const mockReload = vi.fn();
const nav = vi.hoisted(() => ({ pathname: '/es/about', locale: 'es' }));
const i18n = vi.hoisted(() => ({ setLocaleCookie: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => nav.locale,
}));

vi.mock('@/lib/i18n/client', () => ({
  setLocaleCookie: i18n.setLocaleCookie,
}));

describe('LanguageToggle', () => {
  beforeEach(() => {
    mockAssign.mockClear();
    mockReload.mockClear();
    i18n.setLocaleCookie.mockClear();
    nav.pathname = '/es/about';
    nav.locale = 'es';
    vi.stubGlobal('location', { reload: mockReload, assign: mockAssign, search: '' });
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

  it('switches locale on a prefixed path with a full page load', () => {
    render(<LanguageToggle />);
    const select = screen.getByLabelText('selectLanguage');
    fireEvent.change(select, { target: { value: 'en' } });
    expect(i18n.setLocaleCookie).toHaveBeenCalledWith('en');
    expect(mockAssign).toHaveBeenCalledWith('/en/about');
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('keeps apply/login query strings on a prefixed full page load', () => {
    vi.stubGlobal('location', {
      reload: mockReload,
      assign: mockAssign,
      search: '?program=it-support-professional-certificate-ibm&ref=partner-1',
    });
    render(<LanguageToggle />);
    fireEvent.change(screen.getByLabelText('selectLanguage'), { target: { value: 'en' } });
    expect(mockAssign).toHaveBeenCalledWith(
      '/en/about?program=it-support-professional-certificate-ibm&ref=partner-1',
    );
  });

  it('shows the cookie locale on unprefixed portal paths so English can be picked again', () => {
    nav.pathname = '/dashboard';
    nav.locale = 'es';
    render(<LanguageToggle />);
    const select = screen.getByLabelText('selectLanguage') as HTMLSelectElement;
    expect(select.value).toBe('es');
    fireEvent.change(select, { target: { value: 'en' } });
    expect(i18n.setLocaleCookie).toHaveBeenCalledWith('en');
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it('offers English as a button in compact mode on a Spanish portal page', () => {
    nav.pathname = '/dashboard';
    nav.locale = 'es';
    render(<LanguageToggle compact />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(i18n.setLocaleCookie).toHaveBeenCalledWith('en');
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('keeps an unreviewed bookmarked locale visible so English can still be chosen', () => {
    nav.pathname = '/fr/apply';
    nav.locale = 'fr';
    render(<LanguageToggle />);
    const select = screen.getByLabelText('selectLanguage') as HTMLSelectElement;
    expect(select.value).toBe('fr');
    expect(screen.getByRole('option', { name: 'Français' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'en' } });
    expect(i18n.setLocaleCookie).toHaveBeenCalledWith('en');
    expect(mockAssign).toHaveBeenCalledWith('/en/apply');
  });

  it('ignores a forged locale code so the page and cookie stay put', () => {
    render(<LanguageToggle />);
    fireEvent.change(screen.getByLabelText('selectLanguage'), { target: { value: 'zh' } });
    expect(i18n.setLocaleCookie).not.toHaveBeenCalled();
    expect(mockAssign).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });
});
