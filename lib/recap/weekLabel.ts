/** Serialize the existing server-local reporting period before crossing to the browser.
 * This does not change recap storage/query boundaries or introduce a viewer timezone.
 */
export function recapCalendarDateKey(weekStart: Date): string {
  return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
}

/** Calendar arithmetic uses UTC only after the server has supplied a date-only key. */
export function formatRecapWeekLabel(weekStart: string, locale = 'en-US'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return '';
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (!Number.isFinite(start.getTime())) return '';
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const first = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const last = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${first.format(start)} – ${last.format(end)}`;
}
