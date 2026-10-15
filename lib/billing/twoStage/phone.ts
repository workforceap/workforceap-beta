import { formatPhone } from '@/lib/formatPhone';

/** Billing's US display standard, without truncating international numbers,
 * extensions, or incomplete input. Empty values stay empty for required gates. */
export function formatBillingPhone(raw: string | null | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value) return '';
  const extension = value.match(/\s*((?:ext\.?|extension|x|#)\s*\d+)$/iu);
  const number = extension ? value.slice(0, extension.index).trim() : value;
  // Explicit non-US country codes must not resemble ten-digit US numbers.
  if (!/^\+?[\d\s().-]+$/u.test(number) || (number.startsWith('+') && !number.startsWith('+1'))) return value;
  const digits = number.replace(/\D/gu, '');
  if (number.startsWith('+1') && digits.length !== 11) return value;
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith('1'))) return value;
  return `${formatPhone(number)}${extension ? ` ${extension[1]}` : ''}`;
}
