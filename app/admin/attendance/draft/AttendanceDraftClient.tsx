'use client';

import { useEffect, useState } from 'react';
import { buildDraftRows } from '@/lib/attendance/draft-rows';

// Fields may shrink below their intrinsic width so a 390px viewport never scrolls sideways.
const FIELD = { maxWidth: '100%', boxSizing: 'border-box' } as const;

type Row = { date: string; minutes: string; code: '' | 'W' | 'CR' | 'A' };

/** Draft only. Nothing is saved. Unentered days print as unknown; the PDF is not WFS approved. */
export default function AttendanceDraftClient() {
  const [enrollmentId, setEnrollmentId] = useState('');
  const [kind, setKind] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  const [selectedDate, setSelectedDate] = useState('');
  const [rows, setRows] = useState<Row[]>([{ date: '', minutes: '', code: '' }]);
  const [message, setMessage] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function generate() {
    setMessage(null);
    try {
      const body = { enrollmentId, kind, selectedDate, rows: buildDraftRows(rows) };
      const response = await fetch('/api/admin/attendance/draft-pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const json = await response.json().catch(() => ({})); throw new Error(`${response.status} ${json.error ?? 'error'}`); }
      setPdfUrl(URL.createObjectURL(await response.blob()));
    } catch (error) { setPdfUrl(null); setMessage(error instanceof Error ? error.message : 'Failed'); }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
      <h1>Attendance draft PDF</h1>
      <p>DRAFT, not WFS approved. Nothing is saved or sent. Days you do not enter print as unknown.</p>
      <label style={{ display: 'block' }}>Enrollment ID <input style={FIELD} value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)} /></label>
      <label style={{ display: 'block' }}> Sheet <select style={FIELD} value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="yearly" disabled>yearly (unavailable: no enrollment start month)</option></select></label>
      <label style={{ display: 'block' }}> Date in period (YYYY-MM-DD) <input style={FIELD} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} /></label>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input aria-label="Date" style={FIELD} placeholder="YYYY-MM-DD" value={r.date} onChange={e => update(i, { date: e.target.value })} />
          <input aria-label="Minutes attended" style={FIELD} placeholder="minutes" value={r.minutes} disabled={!!r.code} onChange={e => update(i, { minutes: e.target.value })} />
          <select aria-label="Code instead of minutes" style={FIELD} value={r.code} onChange={e => update(i, { code: e.target.value as Row['code'] })}>
            <option value="">minutes</option><option value="W">W</option><option value="CR">CR</option><option value="A">A</option>
          </select>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { date: '', minutes: '', code: '' }])}>Add day</button>
      <button type="button" onClick={generate}>Generate draft PDF</button>
      {message ? <p role="alert">{message}</p> : null}
      {pdfUrl ? <iframe title="Attendance draft PDF" src={pdfUrl} style={{ width: '100%', height: 800 }} /> : null}
    </main>
  );
}
