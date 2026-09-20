import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { alt, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element -- Test mock for next/image.
    return <img {...rest} alt={alt ?? ''} />;
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { year?: number }) =>
    key === 'copyright' ? `copyright ${values?.year ?? ''}` : key,
}));

vi.mock('@/components/LocalizedLink', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/components/portal/LanguageToggle', () => ({
  default: () => <div data-testid="language-toggle" />,
}));

vi.mock('lucide-react', () => ({
  Linkedin: () => <span data-testid="linkedin-icon" />,
  // WAP-110: the email link draws a Lucide glyph instead of an icon-font ligature.
  AtSign: () => <span data-testid="email-icon" />,
}));

function headingLevels(root: HTMLElement): number[] {
  return [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((el) => Number(el.tagName.slice(1)));
}

function skipsHeadingLevel(levels: number[]): boolean {
  return levels.some((level, index) => index > 0 && level > levels[index - 1] + 1);
}

describe('Footer column headings', () => {
  it('uses h2 for Programs, About, and Support so apply pages do not skip from h1 or h2 to h4', () => {
    render(<Footer />);

    const programs = screen.getByRole('heading', { name: 'programs' });
    const about = screen.getByRole('heading', { name: 'about' });
    const support = screen.getByRole('heading', { name: 'support' });

    expect(programs.tagName).toBe('H2');
    expect(about.tagName).toBe('H2');
    expect(support.tagName).toBe('H2');
    expect(programs).toHaveClass('text-label-upper');
    expect(about).toHaveClass('text-label-upper');
    expect(support).toHaveClass('text-label-upper');
    expect(document.querySelector('footer h4')).toBeNull();
  });

  it('keeps heading order sequential after an h1-only page (create-account / status)', () => {
    render(
      <>
        <h1>Create account</h1>
        <Footer />
      </>,
    );

    const levels = headingLevels(document.body);
    expect(levels[0]).toBe(1);
    expect(levels.slice(1)).toEqual([2, 2, 2]);
    expect(skipsHeadingLevel(levels)).toBe(false);
  });

  it('keeps heading order sequential after an h1 then h2 page (confirmation / results / WIOA)', () => {
    render(
      <>
        <h1>Results</h1>
        <h2>You qualify</h2>
        <Footer />
      </>,
    );

    const levels = headingLevels(document.body);
    expect(levels).toEqual([1, 2, 2, 2, 2]);
    expect(skipsHeadingLevel(levels)).toBe(false);
  });
});
