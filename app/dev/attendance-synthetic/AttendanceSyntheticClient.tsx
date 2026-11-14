'use client';

import { useEffect, useState } from 'react';

type Props = { label: string; organizationId: string; memberId: string; enrollmentId: string };
type Kind = 'weekly' | 'monthly' | 'yearly';
type EntryKind = 'verified-duration' | 'W' | 'CR' | 'A';

/** LOCAL SYNTHETIC demo client. Sends identifiers and entry DTOs only; the server decides actor, profile and evidence. */
export default function AttendanceSyntheticClient({ label, organizationId, memberId, enrollmentId }: Props) {
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState('2026-11-09');
  const [entryKind, setEntryKind] = useState<EntryKind>('verified-duration');
  const [minutes, setMinutes] = useState('240');
  const [sourceKey, setSourceKey] = useState('synthetic-register-1');
  const [sheetKind, setSheetKind] = useState<Kind>('weekly');
  const [selectedDate, setSelectedDate] = useState('2026-11-09');
  const [message, setMessage] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/dev/attendance-synthetic', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, memberId, enrollmentId, ...body }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`${response.status} ${json.error ?? 'error'}`);
    return json as Record<string, unknown>;
  }

  async function addEntry() {
    try {
      const row = { sourceKey, date, kind: entryKind, reference: 'synthetic-only', reason: 'Synthetic demo entry',
        ...(entryKind === 'verified-duration' ? { minutes: Number(minutes) } : {}) };
      const result = await post({ action: 'import', expectedRevision: revision, rows: [row] });
      setRevision(Number(result.revision));
      setMessage(result.duplicate ? 'No change: identical entry already current.' : `Entry saved in memory. Revision ${String(result.revision)} (non-durable).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Entry failed'); }
  }

  async function preview() {
    try {
      const result = await post({ action: 'preview', kind: sheetKind, selectedDate });
      const bytes = Uint8Array.from(atob(String(result.pdfBase64)), c => c.charCodeAt(0));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      setHash(String(result.hash));
      setMessage('Draft preview generated. Not signed, not archived, not certified.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Preview failed'); }
  }

  async function tryProtected(action: string) {
    try { await post({ action }); setMessage('Unexpected success'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unavailable'); }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '1.5rem auto', padding: '0 1rem' }}>
      <h1>Attendance sheet — local synthetic demo</h1>
      <p role="note" style={{ background: '#fff3cd', border: '2px solid #b8860b', padding: '0.75rem' }}>
        <strong>{label}</strong> Entries live in server memory and vanish on restart. Signing, finalization and archived
        download are unavailable. P ≥ 4 verified hours/day is a proposed draft rule, not approved policy. Original template unverified.
      </p>
      <fieldset><legend>1. Admin entry (synthetic fixture admin)</legend>
        <label>Date <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>{' '}
        <label>Type <select value={entryKind} onChange={e => setEntryKind(e.target.value as EntryKind)}>
          <option value="verified-duration">verified duration</option><option value="W">W</option><option value="CR">CR</option><option value="A">A</option>
        </select></label>{' '}
        {entryKind === 'verified-duration' ? <label>Minutes <input type="number" min={0} max={1440} value={minutes} onChange={e => setMinutes(e.target.value)} /></label> : null}{' '}
        <label>Source key <input value={sourceKey} onChange={e => setSourceKey(e.target.value)} /></label>{' '}
        <button type="button" onClick={() => void addEntry()}>Save entry (revision {revision})</button>
      </fieldset>
      <fieldset><legend>2. Student selection (synthetic fixture student)</legend>
        <label>Sheet <select value={sheetKind} onChange={e => setSheetKind(e.target.value as Kind)}>
          <option value="weekly">weekly</option><option value="monthly">monthly (adapted draft)</option><option value="yearly">yearly</option>
        </select></label>{' '}
        <label>Date in period <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} /></label>{' '}
        <button type="button" onClick={() => void preview()}>Preview draft</button>
      </fieldset>
      <fieldset><legend>3. Unavailable operations</legend>
        {['finalize', 'student-attest', 'request-signature', 'sign', 'download-archive'].map(action => (
          <button key={action} type="button" onClick={() => void tryProtected(action)} style={{ marginRight: 8 }}>{action}</button>
        ))}
      </fieldset>
      {message ? <p role="status">{message}</p> : null}
      {hash ? <p>Snapshot hash: <code>{hash}</code></p> : null}
      {pdfUrl ? <iframe title="Synthetic attendance draft preview" src={pdfUrl} style={{ width: '100%', height: '75vh', border: '1px solid #888' }} /> : null}
    </main>
  );
}
