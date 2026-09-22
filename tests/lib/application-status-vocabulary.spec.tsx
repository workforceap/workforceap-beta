import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_KEYS,
  APPLICATION_STATUS_WORDS,
  INTAKE_STATUS,
  INTAKE_STATUS_KEYS,
  INTAKE_STATUS_WORDS,
  applicationStatusKey,
  applicationStatusLabel,
  applicationStatusTone,
  intakeStatusKey,
  intakeStatusLabel,
  intakeStatusTone,
  type StatusAudience,
} from '@/lib/status/applicationStatusVocabulary';
import { WIOA_REVIEW_LABELS, WIOA_REVIEW_STATUSES, wioaReviewLabel } from '@/lib/wioa/wioaReview';
import { StatusTag } from '@/components/portal/kit';

/**
 * One vocabulary for Application.status and wioaReviewStatus: every value
 * resolves for both audiences in all four locales (no raw key leaks), the
 * member words stay exactly what WAP-91 / #2471 / #2488 established, the
 * staff words are the agreed set, and the tones follow KIT_GUIDE §4.
 */

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;
const AUDIENCES: StatusAudience[] = ['member', 'staff'];

function Words({ audience }: { audience: StatusAudience }) {
  const t = useTranslations('status');
  return (
    <ul>
      {APPLICATION_STATUS_KEYS.map((key) => (
        <li key={`a-${key}`} data-message={`application.${audience}.${key}`}>
          <StatusTag tone={applicationStatusTone(key)}>{applicationStatusLabel(key, audience, t)}</StatusTag>
        </li>
      ))}
      {INTAKE_STATUS_KEYS.map((key) => (
        <li key={`i-${key}`} data-message={`intake.${audience}.${key}`}>
          <StatusTag tone={intakeStatusTone(key)}>{intakeStatusLabel(key, audience, t)}</StatusTag>
        </li>
      ))}
    </ul>
  );
}

function renderWords(locale: Locale, audience: StatusAudience) {
  return render(
    <NextIntlClientProvider locale={locale} messages={LOCALES[locale]} onError={() => undefined}>
      <Words audience={audience} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe('application status vocabulary — every value × audience × locale resolves', () => {
  it.each(Object.keys(LOCALES) as Locale[])('%s: both audiences render a word for every status, never the key', (locale) => {
    for (const audience of AUDIENCES) {
      const { container, unmount } = renderWords(locale, audience);
      const items = Array.from(container.querySelectorAll<HTMLLIElement>('li'));
      expect(items).toHaveLength(APPLICATION_STATUS_KEYS.length + INTAKE_STATUS_KEYS.length);
      for (const li of items) {
        const key = li.dataset.message!;
        const word = li.textContent ?? '';
        expect(word.trim().length, `${locale} ${key}`).toBeGreaterThan(0);
        expect(word, `${locale} ${key}`).not.toBe(key);
        expect(word, `${locale} ${key}`).not.toBe(`status.${key}`);
        expect(word, `${locale} ${key}`).not.toMatch(/^(application|intake|status)\./);
      }
      unmount();
    }
  });

  it('English messages match the words the module falls back to without a translator', () => {
    renderWords('en', 'member');
    for (const key of APPLICATION_STATUS_KEYS) {
      expect(screen.getAllByText(APPLICATION_STATUS_WORDS.member[key]).length).toBeGreaterThan(0);
      expect(applicationStatusLabel(key, 'member')).toBe(APPLICATION_STATUS_WORDS.member[key]);
    }
    cleanup();
    renderWords('en', 'staff');
    for (const key of INTAKE_STATUS_KEYS) {
      expect(screen.getAllByText(INTAKE_STATUS_WORDS.staff[key]).length).toBeGreaterThan(0);
      expect(intakeStatusLabel(key, 'staff')).toBe(INTAKE_STATUS_WORDS.staff[key]);
    }
  });

  it.each(Object.keys(LOCALES) as Locale[])('%s: member words are exactly the memberApproval card words (WAP-91 / #2471 / #2488)', (locale) => {
    const catalog = LOCALES[locale] as unknown as {
      memberApproval: { applicationStatus: Record<string, string>; intakeStatus: Record<string, string> };
    };
    const { container } = renderWords(locale, 'member');
    const byKey = new Map(
      Array.from(container.querySelectorAll<HTMLLIElement>('li')).map((li) => [li.dataset.message!, li.textContent]),
    );
    for (const key of APPLICATION_STATUS_KEYS) {
      expect(byKey.get(`application.member.${key}`), `${locale} ${key}`).toBe(catalog.memberApproval.applicationStatus[key]);
    }
    for (const key of INTAKE_STATUS_KEYS) {
      const established = key === 'not_reviewed' ? catalog.memberApproval.intakeStatus.unknown : catalog.memberApproval.intakeStatus[key];
      expect(byKey.get(`intake.member.${key}`), `${locale} ${key}`).toBe(established);
    }
  });
});

describe('staff words and tones', () => {
  it('uses the agreed staff words for Application.status', () => {
    renderWords('en', 'staff');
    expect(screen.getAllByText('Awaiting decision')).toHaveLength(1);
    expect(screen.getAllByText('Waiting on applicant')).toHaveLength(1);
    expect(screen.getAllByText('Approved')).toHaveLength(1);
    expect(screen.getAllByText('Denied')).toHaveLength(1);
    expect(screen.getAllByText('No application on file')).toHaveLength(1);
  });

  it('uses the agreed staff words for intake and never says "Eligible"', () => {
    const { container } = renderWords('en', 'staff');
    for (const word of ['Not reviewed', 'Awaiting review', 'In review', 'Needs more information', 'Intake verified', 'Not eligible']) {
      expect(screen.getAllByText(word)).toHaveLength(1);
    }
    expect(container.textContent).not.toMatch(/(^|[^t] )Eligible/);
    expect(screen.queryByText(/^Eligible$/)).toBeNull();
    expect(screen.queryByText(/Verified \(staff\)/)).toBeNull();
  });

  it('paints denied / not eligible as danger, waiting on the applicant as alert (KIT_GUIDE §4)', () => {
    const { container } = renderWords('en', 'staff');
    const tagFor = (message: string) => container.querySelector(`[data-message="${message}"] .wa-kit-tag`) as HTMLElement;
    expect(tagFor('application.staff.denied').className).toContain('wa-kit-tag--danger');
    expect(tagFor('intake.staff.not_eligible').className).toContain('wa-kit-tag--danger');
    expect(tagFor('application.staff.needs_info').className).toContain('wa-kit-tag--alert');
    expect(tagFor('intake.staff.needs_info').className).toContain('wa-kit-tag--alert');
    expect(tagFor('application.staff.pending').className).toContain('wa-kit-tag--warn');
    expect(tagFor('intake.staff.pending').className).toContain('wa-kit-tag--warn');
    expect(tagFor('intake.staff.in_review').className).toContain('wa-kit-tag--info');
    expect(tagFor('application.staff.approved').className).toContain('wa-kit-tag--ok');
    expect(tagFor('intake.staff.verified').className).toContain('wa-kit-tag--ok');
    expect(tagFor('application.staff.not_submitted').className).toContain('wa-kit-tag--muted');
    expect(tagFor('intake.staff.not_reviewed').className).toContain('wa-kit-tag--muted');
    // The tone table has an entry for every key, and denied is never the brand `alert`.
    expect(Object.keys(APPLICATION_STATUS).sort()).toEqual([...APPLICATION_STATUS_KEYS].sort());
    expect(Object.keys(INTAKE_STATUS).sort()).toEqual([...INTAKE_STATUS_KEYS].sort());
    expect(APPLICATION_STATUS.denied.tone).toBe('danger');
  });
});

describe('enum → key mapping', () => {
  it('maps Application.status and nothing-on-file', () => {
    expect(applicationStatusKey('PENDING')).toBe('pending');
    expect(applicationStatusKey('NEEDS_INFO')).toBe('needs_info');
    expect(applicationStatusKey('APPROVED')).toBe('approved');
    expect(applicationStatusKey('DENIED')).toBe('denied');
    expect(applicationStatusKey(null)).toBe('not_submitted');
    expect(applicationStatusKey(undefined)).toBe('not_submitted');
    expect(applicationStatusKey('REJECTED')).toBe('unknown');
  });

  it('maps wioaReviewStatus, including the lowercase column values the admin page once compared in uppercase', () => {
    for (const s of WIOA_REVIEW_STATUSES) expect(intakeStatusKey(s)).toBe(s);
    expect(intakeStatusKey(null)).toBe('not_reviewed');
    expect(intakeStatusKey('NOT_ELIGIBLE')).toBe('unknown');
  });

  it('wioaReview.ts staff labels are the vocabulary words', () => {
    for (const s of WIOA_REVIEW_STATUSES) {
      expect(WIOA_REVIEW_LABELS[s]).toBe(INTAKE_STATUS_WORDS.staff[s]);
      expect(wioaReviewLabel(s)).toBe(INTAKE_STATUS_WORDS.staff[s]);
    }
    expect(wioaReviewLabel(null)).toBe('Not reviewed');
    expect(wioaReviewLabel('bogus')).toBe('Status not recorded');
  });
});
