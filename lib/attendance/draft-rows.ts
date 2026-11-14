export type DraftRowInput = { date: string; minutes: string; code: '' | 'W' | 'CR' | 'A' };
export type DraftRowPayload = { date: string; code: 'W' | 'CR' | 'A' } | { date: string; minutes: number };

/**
 * Maps form rows to the request rows. A blank or non-numeric minutes field is an error:
 * it must never become 0 hours (unknown is not zero).
 */
export function buildDraftRows(rows: DraftRowInput[]): DraftRowPayload[] {
  return rows.map((r, i) => {
    if (r.code) return { date: r.date, code: r.code };
    const raw = r.minutes.trim();
    if (!/^\d+$/.test(raw)) throw new Error(`Row ${i + 1}: enter whole minutes or choose a code. A blank is not 0.`);
    return { date: r.date, minutes: Number(raw) };
  });
}
