import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { DIGITAL_LITERACY_MODULES, DIGITAL_LITERACY_PROGRAM_SLUG, digitalLiteracyProviderCatalogHref } from '@/shared/digitalLiteracyPathway';

const reload = vi.hoisted(() => vi.fn());
const locale = () => document.cookie.includes('wap-locale=es') ? 'es' : 'en';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/learning/modules/digital-literacy-empowerment-class-course-1',
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => locale(),
  getTranslations: async () => createTranslator({ locale: locale(), messages: locale() === 'es' ? es : en, namespace: 'workforceApModule' }),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'synthetic-learner' })) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    courseEnrollment: { findMany: vi.fn(async () => []) },
    courseProgress: { findFirst: vi.fn(async () => null) },
  },
}));

import ModulePage from '@/app/(portal)/dashboard/learning/modules/[courseSlug]/page';
import LanguageToggle from '@/components/portal/LanguageToggle';
import { prisma } from '@/lib/db/prisma';

async function showModule(index = 0) {
  const page = await ModulePage({
    params: Promise.resolve({ courseSlug: `${DIGITAL_LITERACY_PROGRAM_SLUG}-course-${index + 1}` }),
    searchParams: Promise.resolve({ program: DIGITAL_LITERACY_PROGRAM_SLUG }),
  });
  return render(
    <NextIntlClientProvider locale={locale()} messages={locale() === 'es' ? es : en}>
      <LanguageToggle />
      {page}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = 'wap-locale=en;path=/';
  vi.stubGlobal('location', { reload, search: '' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Digital Literacy follows the portal English/Español switch', () => {
  it('changes lesson text and real provider language-entry links in both directions', async () => {
    let view = await showModule();
    expect(screen.getByRole('heading', { level: 1, name: 'Computer Basics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Start this lesson:/ })).toHaveAttribute('href', DIGITAL_LITERACY_MODULES[0].lessons[0].url);
    expect(screen.getByRole('link', { name: 'Open AT&T courses in English' })).toHaveAttribute('href', digitalLiteracyProviderCatalogHref('en'));

    fireEvent.change(screen.getByRole('combobox', { name: en.common.selectLanguage }), { target: { value: 'es' } });
    expect(document.cookie).toContain('wap-locale=es');
    expect(reload).toHaveBeenCalledTimes(1);
    view.unmount();
    view = await showModule();

    expect(screen.getByRole('heading', { level: 1, name: 'Conceptos básicos de computación' })).toBeInTheDocument();
    expect(screen.getByText('Uso del ratón y el teclado')).toBeInTheDocument();
    const lessons = view.container.querySelector<HTMLOListElement>('.wa-kit-lesson-list')!;
    const lessonLink = within(lessons).getByRole('link', { name: /Abrir cursos de AT&T en español/ });
    expect(lessonLink).toHaveAttribute('href', 'https://att.digitallearn.org/home_language_toggle?lang=es');
    expect(lessonLink).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(lessonLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(lessonLink).toHaveAttribute('target', '_blank');
    expect(lessons).toHaveTextContent('busca el tema');
    expect(screen.queryByRole('link', { name: /^Start this lesson:/ })).toBeNull();

    fireEvent.change(screen.getByRole('combobox', { name: es.common.selectLanguage }), { target: { value: 'en' } });
    expect(reload).toHaveBeenCalledTimes(2);
    view.unmount();
    await showModule();
    expect(screen.getByRole('heading', { level: 1, name: 'Computer Basics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Start this lesson:/ })).toHaveAttribute('href', DIGITAL_LITERACY_MODULES[0].lessons[0].url);
    expect(screen.getByRole('link', { name: 'Open AT&T courses in English' })).toHaveAttribute('href', digitalLiteracyProviderCatalogHref('en'));
  });

  it.each(DIGITAL_LITERACY_MODULES.map((module, index) => ({ module, index })))('keeps $module.key Spanish primary links out of English course/material destinations', async ({ module, index }) => {
    document.cookie = 'wap-locale=es;path=/';
    const { container } = await showModule(index);
    const copy = es.workforceApModule.modules[module.key as keyof typeof es.workforceApModule.modules];
    expect(screen.getByRole('heading', { level: 1, name: copy.name })).toBeInTheDocument();
    expect(screen.getByText(copy.summary)).toBeInTheDocument();
    const topics = screen.getByRole('heading', { name: 'Lo que practicarás' }).nextElementSibling as HTMLElement;
    for (const topic of Object.values(copy.topics)) expect(within(topics).getByText(topic)).toBeInTheDocument();
    const lessons = container.querySelector<HTMLOListElement>('.wa-kit-lesson-list')!;
    for (const title of Object.values(copy.lessons)) expect(within(lessons).getByText(title)).toBeInTheDocument();
    const links = within(lessons).getAllByRole('link');
    expect(links).toHaveLength(module.lessons.length);
    for (const link of links) {
      expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\/(?:att|www)\.digitallearn\.org\/home_language_toggle\?lang=es$/));
      expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(link).toHaveTextContent(/Abrir cursos de (?:AT&T|DigitalLearn) en español/);
    }
    for (const lesson of module.lessons) expect(lessons.querySelector(`a[href="${lesson.url}"]`)).toBeNull();
    expect(prisma.courseEnrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.courseProgress.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ courseSlug: `${DIGITAL_LITERACY_PROGRAM_SLUG}-course-${index + 1}` }) }));
  });

  it('keeps completion ownership and provider attribution explicit in both languages', async () => {
    let view = await showModule();
    expect(screen.getByText(/does not verify DigitalLearn activity or issue a DigitalLearn certificate/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
    expect(screen.getByRole('link', { name: 'provider terms' })).toBeInTheDocument();
    view.unmount();
    document.cookie = 'wap-locale=es;path=/';
    view = await showModule();
    expect(screen.getByText(/No verifica tu actividad en DigitalLearn ni emite un certificado de DigitalLearn/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'condiciones del proveedor' })).toBeInTheDocument();
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar módulo como completo en WorkforceAP' }));
    expect(fetch).toHaveBeenCalledWith('/api/member/courses/complete', expect.objectContaining({ body: JSON.stringify({ courseSlug: `${DIGITAL_LITERACY_PROGRAM_SLUG}-course-1`, programSlug: DIGITAL_LITERACY_PROGRAM_SLUG }) }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar módulo como completo en WorkforceAP' })).not.toBeDisabled());
  });
});
