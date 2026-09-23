'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { csvCell } from '@/lib/csv/cells';

type CsvKind = 'course-activity' | 'learning-path-activity';

type UnresolvedCourseRow = { email: string; name: string; courseId: string; course: string };
type UnresolvedBadgeRow = { email: string; name: string; badgeSlug: string; badgeTitle: string };

type CourseImportResult = {
  ok: true;
  kind: 'course-activity';
  filename: string | null;
  parsed: number;
  inserted: number;
  updated: number;
  resolvedToUsers: number;
  unresolved: number;
  errors: string[];
  unresolvedRows: UnresolvedCourseRow[];
  promoted?: number;
  promotionErrors?: number;
};

type BadgeImportResult = {
  ok: true;
  kind: 'learning-path-activity';
  filename: string | null;
  parsed: number;
  inserted: number;
  updated: number;
  resolvedToUsers: number;
  unresolved: number;
  errors: string[];
  unresolvedRows: UnresolvedBadgeRow[];
};

type ImportResult = CourseImportResult | BadgeImportResult;

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-container-lowest)',
  border: '1px solid var(--outline-variant)',
  borderRadius: '1rem',
  padding: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 700,
  color: 'var(--color-on-surface-variant)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '0.375rem',
};

const buttonPrimaryStyle: React.CSSProperties = {
  padding: '0.7rem 1.1rem',
  borderRadius: '0.65rem',
  border: 'none',
  background: 'var(--color-primary)',
  color: 'var(--color-on-primary)',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: '0.95rem',
};

function downloadUnresolvedCsv(result: ImportResult) {
  const isCourse = result.kind === 'course-activity';
  const header = isCourse ? 'email,name,course_id,course\n' : 'email,name,badge_slug,badge_title\n';
  const body = isCourse
    ? (result.unresolvedRows as UnresolvedCourseRow[])
        .map(
          (r) =>
            `${csvCell(r.email)},${csvCell(r.name)},${csvCell(r.courseId)},${csvCell(r.course)}`
        )
        .join('\n')
    : (result.unresolvedRows as UnresolvedBadgeRow[])
        .map(
          (r) =>
            `${csvCell(r.email)},${csvCell(r.name)},${csvCell(r.badgeSlug)},${csvCell(r.badgeTitle)}`
        )
        .join('\n');
  const blob = new Blob([header + body + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileSuffix = isCourse ? 'unresolved-courses' : 'unresolved-badges';
  a.download = `coursera-${fileSuffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function describeKind(kind: CsvKind | null) {
  if (kind === 'course-activity') return 'CourseActivity (per-course progress)';
  if (kind === 'learning-path-activity') return 'LearningPathActivity (badge / specialization progress)';
  return null;
}

export default function CourseraCsvImportClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError('Choose a CSV file to upload.');
      return;
    }

    const form = new FormData();
    form.append('csv', file);

    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/coursera/csv-import', {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(payload?.error || `Import failed (HTTP ${response.status}).`);
          return;
        }
        setResult(payload as ImportResult);
        router.refresh();
      } catch {
        setError('Network error while uploading CSV.');
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Upload Coursera CSV</h2>
        <p style={{ marginTop: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.95rem' }}>
          Drop either the <code>CourseActivity ... .csv</code> (per-course progress) or the{' '}
          <code>LearningPathActivity ... .csv</code> (badge / specialization progress) file from
          the latest Coursera enterprise export. The importer auto-detects which type you
          uploaded from its header row and routes to the right ingester.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}
        >
          <div>
            <label htmlFor="coursera-csv-file" style={labelStyle}>
              CSV file
            </label>
            <input
              id="coursera-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: 'block' }}
              disabled={isPending}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              Max 5 MB. Idempotent — re-uploads update existing rows in place.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="submit" style={buttonPrimaryStyle} disabled={isPending || !file}>
              {isPending ? 'Importing…' : 'Import CSV'}
            </button>
            {file ? (
              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                {file.name} ({Math.round(file.size / 1024)} KB)
              </span>
            ) : null}
          </div>
        </form>

        {error ? (
          <div
            role="alert"
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.65rem',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'rgb(239, 68, 68)',
              background: 'rgba(239, 68, 68, 0.08)',
              fontSize: '0.95rem',
            }}
          >
            {error}
          </div>
        ) : null}
      </section>

      {result ? (
        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Import result</h2>
          <p style={{ marginTop: '0.4rem', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
            Detected: <strong>{describeKind(result.kind)}</strong>.{' '}
            {result.filename ? <>From <code>{result.filename}</code>. </> : null}
            Parsed {result.parsed} row(s).
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              marginTop: '1rem',
            }}
          >
            <Stat label="Inserted" value={result.inserted} />
            <Stat label="Updated" value={result.updated} />
            <Stat label="Resolved to users" value={result.resolvedToUsers} />
            <Stat label="Unresolved" value={result.unresolved} />
            {result.kind === 'course-activity' && typeof result.promoted === 'number' ? (
              <Stat label="Promoted to course_progress" value={result.promoted} />
            ) : null}
          </div>

          {result.kind === 'course-activity' && (result.promotionErrors ?? 0) > 0 ? (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                border: '1px solid #b91c1c',
                background: 'rgba(220, 38, 38, 0.08)',
                borderRadius: '0.5rem',
                color: '#b91c1c',
                fontSize: '0.9rem',
              }}
            >
              <strong>Promotion to course_progress failed.</strong> CSV rows were saved but the
              member dashboard will not show them until this is resolved. Check server logs for
              <code> [promoteCsvProgressToCanonical] failed</code>.
            </div>
          ) : null}

          {result.unresolved > 0 ? (
            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                {result.unresolved} learner row(s) could not be matched to a WAP user. Map them
                inline from the <a href="/admin/coursera">Coursera admin page</a> — look for the{' '}
                "Coursera-only learners" section.
              </span>
              <button
                type="button"
                onClick={() => downloadUnresolvedCsv(result)}
                style={{
                  ...buttonPrimaryStyle,
                  background: 'var(--surface-container)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--outline-variant)',
                  width: 'fit-content',
                }}
              >
                Download unresolved rows (CSV)
              </button>
            </div>
          ) : null}

          {result.errors.length > 0 ? (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {result.errors.length} error(s) during ingest
              </summary>
              <ul style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: 'var(--surface-container)',
        borderRadius: '0.65rem',
        padding: '0.75rem 0.9rem',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <div style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
