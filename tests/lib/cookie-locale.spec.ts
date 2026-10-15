import { afterEach, describe, expect, it } from 'vitest';
import { WAP_LOCALE_COOKIE } from '@/lib/i18n/config';
import { getAppLocaleFromCookieStore } from '@/lib/i18n/cookieLocale';
import { setLocaleCookie } from '@/lib/i18n/client';

function cookieStore(cookies: Record<string, string | undefined>) {
  return {
    get(name: string) {
      const value = cookies[name];
      return value === undefined ? undefined : { value };
    },
  };
}

describe('getAppLocaleFromCookieStore', () => {
  it('prefers wap-locale over the legacy i18next cookie', () => {
    expect(
      getAppLocaleFromCookieStore(cookieStore({ [WAP_LOCALE_COOKIE]: 'es', i18next: 'en' })),
    ).toBe('es');
  });

  it('falls through an invalid wap-locale to a language-tagged i18next value', () => {
    expect(
      getAppLocaleFromCookieStore(cookieStore({ [WAP_LOCALE_COOKIE]: 'ES', i18next: 'es-MX' })),
    ).toBe('es');
  });

  it('reads the legacy i18next cookie when wap-locale is absent', () => {
    expect(getAppLocaleFromCookieStore(cookieStore({ i18next: 'pt-BR' }))).toBe('pt');
  });

  it('defaults to English when both cookies are missing or unsupported', () => {
    expect(getAppLocaleFromCookieStore(cookieStore({}))).toBe('en');
    expect(
      getAppLocaleFromCookieStore(cookieStore({ [WAP_LOCALE_COOKIE]: 'zh', i18next: 'zh-CN' })),
    ).toBe('en');
  });
});

describe('setLocaleCookie', () => {
  afterEach(() => {
    document.cookie.split('; ').forEach((part) => {
      const name = part.split('=')[0];
      if (name) document.cookie = `${name}=;path=/;max-age=0`;
    });
  });

  it('writes the same wap-locale assignment the public site switcher uses', () => {
    const writes: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        return original?.get?.call(this) ?? '';
      },
      set(value: string) {
        writes.push(value);
        original?.set?.call(this, value);
      },
    });
    try {
      setLocaleCookie('es');
    } finally {
      if (original) Object.defineProperty(document, 'cookie', original);
    }
    expect(writes).toEqual([`${WAP_LOCALE_COOKIE}=es;path=/;max-age=31536000;SameSite=Lax`]);
  });
});
