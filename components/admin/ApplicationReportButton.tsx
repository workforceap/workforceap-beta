'use client';

import { useState } from 'react';

export default function ApplicationReportButton({ memberId, applicationId }: { memberId: string; applicationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}/applications/${encodeURIComponent(applicationId)}/report`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || 'The report could not be downloaded. Please try again.');
      }
      const pdf = response.headers.get('Content-Type')?.startsWith('application/pdf');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `application-${applicationId}.${pdf ? 'pdf' : 'html'}`;
      document.body.appendChild(link); link.click(); link.remove();
      // Give the browser time to start reading the download before revocation.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage(pdf ? 'Report saved on this profile and downloaded. Open the PDF to print one page.' : 'Report saved and downloaded as printable HTML to preserve all answers. Open it in your browser to print.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check your connection and try downloading the report again.');
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" className="btn btn-outline" onClick={() => void download()} disabled={busy}>
      {busy ? 'Preparing report…' : 'Download application report'}
    </button>
    <p>Printable filing copy. Older applications are recovered from current records and labeled accordingly.</p>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </>;
}
