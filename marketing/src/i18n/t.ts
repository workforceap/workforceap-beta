import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import pt from './pt.json';

const MESSAGES: Record<string, unknown> = { en, es, fr, pt };

export const LOCALES = ['en', 'es', 'fr', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English', es: 'Español', fr: 'Français', pt: 'Português',
};
export const NON_DEFAULT_LOCALES = LOCALES.filter((l) => l !== 'en');

function dig(obj: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

/** Plain-text messages with named values; missing keys fall back to English. */
export function useT(locale: string) {
  const loc = (LOCALES as readonly string[]).includes(locale) ? locale : 'en';
  return (key: string, values: Record<string, string | number> = {}): string => {
    const v = dig(MESSAGES[loc], key);
    const f = dig(MESSAGES.en, key);
    const message = typeof v === 'string' ? v : typeof f === 'string' ? f : key;
    return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder,
    );
  };
}

export function isLocale(x: string | undefined): x is Locale {
  return !!x && (LOCALES as readonly string[]).includes(x);
}
