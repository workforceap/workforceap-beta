'use client';

import { useEffect, useState } from 'react';
import { buildDraftRows } from '@/lib/attendance/draft-rows';
import { ACTIVITY_OBSERVED_LABEL, CUMULATIVE_ESTIMATE_LABEL, type AssistiveSignals } from '@/lib/attendance/assistive-signals';
import { WEEK_LABELS, buildMonthlyGrid } from '@/lib/attendance/monthly-grid';
import type { Day } from '@/lib/attendance/evidence';
import { DataTable } from '@/components/portal/kit/DataTable';

type Row = { date: string; minutes: string; code: '' | 'W' | 'CR' | 'A' };

/** Draft only. Nothing is saved. Unentered days stay blank; activity counts are not hours. */
export default function AttendanceDraftClient() {
  const [enrollmentId, setEnrollmentId] = useState('');
  const [kind, setKind] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [selectedDate, setSelectedDate] = useState('');
  const [rows, setRows] = useState<Row[]>([{ date: '', minutes: '', code: '' }]);
  const [message, setMessage] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [signals, setSignals] = useState<AssistiveSignals | null>(null);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function generate() {
      setMessage(null);
      try {
        if (kind === 'monthly' && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
          const signalsResponse = await fetch('/api/admin/attendance/draft-signals', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enrollmentId, selectedDate }),
          });
          setSignals(signalsResponse.ok ? await signalsResponse.json() as AssistiveSignals : null);
        } else setSignals(null);
        const body = { enrollmentId, kind, selectedDate, rows: buildDraftRows(rows) };
        const response = await fetch('/api/admin/attendance/draft-pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) { const json = await response.json().catch(() => ({})); throw new Error(`${response.status} ${json.error ?? 'error'}`); }
        setPdfUrl(URL.createObjectURL(await response.blob()));
      } catch (error) { setPdfUrl(null); setMessage(error instanceof Error ? error.message : 'Failed'); }
    }

    const entered: Day[] = rows.flatMap((row): Day[] => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return [];
          if (row.code === 'A') return [{ date: row.date, actualMinutes: null, estimatedMinutes: null, codes: ['A'], evidenceKeys: [] }];
          if (!/^\d+$/.test(row.minutes.trim())) return [];
          return [{ date: row.date, actualMinutes: Number(row.minutes), estimatedMinutes: null, codes: [], evidenceKeys: [] }];
        });
    const grid = kind === 'monthly' && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? buildMonthlyGrid(selectedDate, entered) : null;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
          <h1>Attendance draft PDF</h1>
          <p>DRAFT, not WFS approved. Nothing is saved, signed, sent, or archived. Days you do not enter stay blank.</p>
      <label>Enrollment ID <input value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)} /></label>
      <label> Sheet <select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="yearly" disabled>yearly (unavailable: no enrollment start month)</option></select></label>
      <label> Date in period (YYYY-MM-DD) <input value={selectedDate} onChange={e => setSelectedDate(e.target.value)} /></label>
      {rows.map((r, i) => (
        <div key={i}>
          <input aria-label="Date" placeholder="YYYY-MM-DD" value={r.date} onChange={e => update(i, { date: e.target.value })} />
          <input aria-label="Class minutes" placeholder="class minutes" value={r.minutes} disabled={!!r.code} onChange={e => update(i, { minutes: e.target.value })} />
                    <select aria-label="Code instead of minutes" value={r.code} onChange={e => update(i, { code: e.target.value as Row['code'] })}>
                      <option value="">class minutes</option><option value="W">W</option><option value="CR">CR</option><option value="A">A</option>
          </select>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { date: '', minutes: '', code: '' }])}>Add day</button>
      <button type="button" onClick={generate}>Generate draft PDF</button>
            <p>Sign, send and archive stay disabled.</p>
            {message ? <p role="alert">{message}</p> : null}
            {grid ? (
              <section aria-label="Monthly draft calendar">
                <h2>Monthly draft calendar</h2>
                <p>Class Hrs are the minutes you entered. Lab Hrs stay blank. Unknown days stay blank.</p>
                                <DataTable
                                  caption="Monthly draft calendar"
                                  mobile="scroll"
                                  rowKey={row => row.key}
                                  columns={[
                                    ...WEEK_LABELS.map((label, index) => ({ key: label, header: label, render: (row: { days: string[] }) => row.days[index] })),
                                    { key: 'classHours', header: 'Class', render: (row: { classHours: string }) => row.classHours },
                                    { key: 'labHours', header: 'Lab', render: (row: { labHours: string }) => row.labHours },
                                    { key: 'totalHours', header: 'Total', render: (row: { totalHours: string }) => row.totalHours },
                                  ]}
                                  rows={grid.weeks.map((week, index) => ({
                                    key: `week-${index + 1}`,
                                    days: week.map(cell => cell.date ? `${cell.date.slice(8)} ${cell.classHours ?? ''}` : ''),
                                    classHours: grid.weekTotals[index].classHours ?? '',
                                    labHours: grid.weekTotals[index].labHours ?? '',
                                    totalHours: grid.weekTotals[index].totalHours ?? '',
                                  }))}
                                />
                <p>Running Total Hrs: Class {grid.running.classHours ?? 'blank'}, Lab {grid.running.labHours ?? 'blank'}, Total {grid.running.totalHours ?? 'blank'}.</p>
              </section>
            ) : null}
            {signals ? (
              <aside aria-label="Activity signals">
                <h2>{ACTIVITY_OBSERVED_LABEL}</h2>
                <p>{CUMULATIVE_ESTIMATE_LABEL}: {signals.catalogHours ?? 'not stored'} catalog hours; {signals.coursera?.learningHours ?? 'not stored'} learning hours; {signals.coursera?.coursesCompleted ?? 'not stored'} courses completed.</p>
                <ul>
                  {signals.days.map(day => <li key={day.date}>{day.date}: Coursera points {day.courseraPoints}, site points {day.sitePoints}. Not Class Hrs or Lab Hrs.</li>)}
                </ul>
              </aside>
            ) : null}
      {pdfUrl ? <iframe title="Attendance draft PDF" src={pdfUrl} style={{ width: '100%', height: 800 }} /> : null}
    </main>
  );
}
