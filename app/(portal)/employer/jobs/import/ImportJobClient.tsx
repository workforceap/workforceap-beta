'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Check, AlertCircle } from 'lucide-react';
import JobForm from '@/components/employer/JobForm';
import { trackEmployerImport, trackFunnelEvent } from '@/lib/analytics/events';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

type ImportJobClientProps = {
  companyName: string;
  programSlugs: string[];
};

export default function ImportJobClient({ companyName, programSlugs }: ImportJobClientProps) {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkUrls, setBulkUrls] = useState('');
  const [careersUrl, setCareersUrl] = useState('');
  const [careersPaste, setCareersPaste] = useState('');
  const [bulkResult, setBulkResult] = useState<{
    created: { id: string; title: string; provider?: string }[];
    errors: { source: string; error: string }[];
  } | null>(null);
  const [extracted, setExtracted] = useState<{
    title: string;
    company?: string;
    location?: string;
    locationType?: string;
    jobType?: string;
    salaryMin?: number;
    salaryMax?: number;
    description: string;
    requirements?: string[];
    preferredCertifications?: string[];
    suggestedPrograms?: string[];
    sourceUrl?: string;
    importProvider?: string;
    importMethod?: string;
  } | null>(null);
  const [pasteSectionOpen, setPasteSectionOpen] = useState(false);
  const successCardRef = useRef<HTMLDivElement>(null);

  const fieldCoverage = useMemo(() => {
    if (!extracted) return [];
    return [
      { label: 'Title', filled: !!extracted.title },
      { label: 'Location', filled: !!extracted.location },
      { label: 'Salary range', filled: extracted.salaryMin != null || extracted.salaryMax != null },
      { label: 'Description', filled: !!extracted.description && extracted.description.length > 60 },
      { label: 'Requirements', filled: (extracted.requirements?.length ?? 0) >= 2 },
      { label: 'Certifications', filled: (extracted.preferredCertifications?.length ?? 0) > 0 },
      { label: 'Training programs', filled: (extracted.suggestedPrograms?.length ?? 0) > 0 },
    ];
  }, [extracted]);

  async function handleParse() {
    if (!url && !rawText.trim()) {
      setError('Enter a URL or paste the job description.');
      return;
    }
    setLoading(true);
    setError(null);
    trackEmployerImport('started', { mode: rawText.trim() ? 'paste' : 'url', has_url: !!url });
    try {
      const res = await fetch('/api/employer/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url || undefined, rawText: rawText.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        trackEmployerImport('errored', { mode: rawText.trim() ? 'paste' : 'url', has_url: !!url });
        setError(data.error ?? 'Failed to parse');
        return;
      }
      if (data.created && data.job) {
        trackEmployerImport('succeeded', { provider: data.provider, created: true });
        router.push(`/employer/jobs/${data.job.id}`);
        router.refresh();
        return;
      }
      trackEmployerImport(data.provider?.includes('fallback') ? 'fallback_used' : 'succeeded', {
        provider: data.provider,
        field_coverage: data.extracted ? Object.values(data.extracted).filter(Boolean).length : undefined,
      });
      trackFunnelEvent('employer_import', 'review_opened', { provider: data.provider });
      setExtracted(data.extracted);
      setStep('review');
    } catch (err) {
      trackEmployerImport('errored', { mode: rawText.trim() ? 'paste' : 'url', has_url: !!url });
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Failed to parse' },
          'employer-job-import',
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkImport() {
    setError(null);
    setBulkResult(null);
    const urls = bulkUrls
      .split(/[\n\r,]+/)
      .map((s) => s.trim())
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, 15);
    const paste = careersPaste.trim();
    const cUrl = careersUrl.trim();

    if (urls.length === 0 && !cUrl && paste.length < 80) {
      setError('Add a careers link, at least one job link, or paste enough page text for us to read (about a paragraph).');
      return;
    }

    const body: Record<string, unknown> = {};
    if (urls.length) body.jobUrls = urls;
    if (cUrl) body.careersPageUrl = cUrl;
    if (paste.length >= 80) body.careersPageRawText = paste;

    setBulkLoading(true);
    trackEmployerImport('started', {
      mode: 'bulk',
      job_url_count: urls.length,
      has_careers_page_url: !!cUrl,
      has_careers_page_paste: paste.length >= 80,
    });
    try {
      const res = await fetch('/api/employer/jobs/import-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        trackEmployerImport('errored', { mode: 'bulk' });
        setError(data.error ?? 'Bulk import failed');
        return;
      }
      const created = data.created ?? [];
      const errs = data.errors ?? [];
      setBulkResult({ created, errors: errs });
      trackEmployerImport(errs.length > 0 ? 'fallback_used' : 'succeeded', {
        mode: 'bulk',
        created_count: created.length,
        error_count: errs.length,
        providers: created.map((item: { provider?: string }) => item.provider).filter(Boolean),
      });
      if (created.length === 0 && errs.length > 0 && cUrl) {
        setPasteSectionOpen(true);
      }
      router.refresh();
    } catch (err) {
      trackEmployerImport('errored', { mode: 'bulk' });
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Bulk import failed' },
          'employer-job-import-bulk',
        ),
      );
    } finally {
      setBulkLoading(false);
    }
  }

  useEffect(() => {
    if (bulkResult && bulkResult.created.length > 0 && successCardRef.current) {
      successCardRef.current.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }, [bulkResult]);


  if (step === 'review' && extracted) {
    const filledCount = fieldCoverage.filter((f) => f.filled).length;
    const missingFields = fieldCoverage.filter((f) => !f.filled);

    return (
      <>
      <div className="import-job-review wa-pb-24 md:wa-pb-0">
        <div className="import-job-back">
          <button
            type="button"
            onClick={() => setStep('input')}
            className="btn btn-ghost"
            style={{ fontSize: '0.9rem' }}
          >
            ← Back
          </button>
        </div>
        <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>Review before saving</h2>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          This is still private. Adjust anything that does not sound like your team, then save as a draft or send for
          WorkforceAP review.
        </p>

        <div className="import-review-summary">
          <div className="import-review-summary__header">
            <span className="import-review-summary__count">
              {filledCount} of {fieldCoverage.length} fields auto-filled
            </span>
            {missingFields.length > 0 && (
              <span className="import-review-summary__hint">
                {missingFields.length === 1 ? '1 field needs' : `${missingFields.length} fields need`} your input
              </span>
            )}
          </div>
          <div className="import-review-summary__fields">
            {fieldCoverage.map((f) => (
              <span
                key={f.label}
                className={`import-review-summary__field ${f.filled ? 'is-filled' : 'is-empty'}`}
              >
                {f.filled ? <Check size={14} /> : <AlertCircle size={14} />}
                {f.label}
              </span>
            ))}
          </div>
        </div>

        <JobForm
          initialData={{
            title: extracted.title,
            location: extracted.location ?? '',
            locationType: extracted.locationType ?? 'onsite',
            jobType: extracted.jobType ?? 'fulltime',
            salaryMin: extracted.salaryMin,
            salaryMax: extracted.salaryMax,
            description: extracted.description,
            requirements: extracted.requirements ?? [],
            preferredCertifications: extracted.preferredCertifications ?? [],
            suggestedPrograms: extracted.suggestedPrograms ?? [],
            sourceUrl: extracted.sourceUrl,
            importProvider: extracted.importProvider,
            importMethod: extracted.importMethod,
          }}
          companyName={extracted.company ?? companyName}
          programSlugs={programSlugs}
          isImportReview
        />
      </div>
      </>
    );
  }

  const hasSuccess = bulkResult && bulkResult.created.length > 0;

  return (
    <>
    <div className="import-job-page wa-pb-24 md:wa-pb-0">
      <div className="import-job-back">
        <Link href="/employer/jobs">← Back to jobs</Link>
      </div>

      {/* Page kicker/title/lede render once in the route via EmployerPageOpener. */}
      <header className="import-job-header">
        <ul className="import-job-confidence">
          <li>Every draft is yours to polish: pay, location, and must-haves should match how you actually hire.</li>
          <li>We cap bulk pulls so each posting stays accurate — quality over speed.</li>
          <li>If a page does not open for us, paste the text or add a single job below — same outcome.</li>
        </ul>
      </header>

      {hasSuccess && (
        <div ref={successCardRef} className="import-job-success-card">
          <div className="import-job-success-icon">
            <CheckCircle2 size={32} strokeWidth={2} />
          </div>
          <div>
            <h2 className="import-job-success-title">
              {bulkResult.created.length} private draft{bulkResult.created.length !== 1 ? 's' : ''} ready
            </h2>
            <p className="import-job-success-desc">
              Nothing is visible to candidates yet. Open each one, tighten the details, then send for review when it matches
              how you hire.
            </p>
            <Link href="/employer/jobs" className="btn btn-primary import-job-success-cta">
              View all {bulkResult.created.length} drafts
              <ExternalLink size={16} style={{ marginLeft: '0.35rem', verticalAlign: 'middle' }} />
            </Link>
          </div>
          <div className="import-job-draft-grid">
            {bulkResult.created.slice(0, 12).map((c) => (
              <Link key={c.id} href={`/employer/jobs/${c.id}`} className="import-job-draft-card">
                <span className="import-job-draft-card__status">Draft</span>
                {c.provider && (
                  <span className="import-job-draft-card__source">via {c.provider}</span>
                )}
                <span className="import-job-draft-card__title">{c.title}</span>
                <span className="import-job-draft-card__cta">Edit draft →</span>
              </Link>
            ))}
            {bulkResult.created.length > 12 && (
              <p className="import-job-draft-grid__more">
                +{bulkResult.created.length - 12} more — see all in{' '}
                <Link href="/employer/jobs">your jobs</Link>
              </p>
            )}
          </div>
        </div>
      )}

      <section className="import-job-primary">
        <h2>Paste your public careers link</h2>
        <p className="import-job-hint">
          Use the same URL a candidate would use — the page that lists open roles. Internal HR logins will not work here.
        </p>
        {error && (
          <div className="import-job-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-group">
          <input
            type="url"
            placeholder="https://yourcompany.com/careers"
            value={careersUrl}
            onChange={(e) => setCareersUrl(e.target.value)}
            disabled={bulkLoading || loading}
            className="import-job-input"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleBulkImport}
          disabled={bulkLoading || loading || !careersUrl.trim()}
        >
          {bulkLoading ? 'Creating drafts…' : 'Import from careers page'}
        </button>
        {bulkLoading && (
          <p className="import-job-loading-hint">
            Pages with many jobs may take a minute. Do not close or refresh.
          </p>
        )}
      </section>

      {bulkResult && bulkResult.created.length === 0 && bulkResult.errors.length > 0 && careersUrl.trim() && (
        <div className="import-job-paste-fallback">
          <p>
            <strong>Could not read that page automatically.</strong> Paste the job listings from your careers page below —
            you will get the same drafts.
          </p>
        </div>
      )}

      <details
        className="import-job-more"
        open={pasteSectionOpen}
        onToggle={(e) => setPasteSectionOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Other ways to add roles</summary>
        <div className="import-job-more-content">
          <h3>One role at a time</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
            Paste a public job link or the full description — fastest when you are only filling one opening.
          </p>
          <div className="form-group">
            <label htmlFor="importjobclient-job-url-field">Job URL</label>
            <input id="importjobclient-job-url-field" type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading || bulkLoading} />
          </div>
          <div className="form-group">
            <label htmlFor="importjobclient-or-paste-description-text-field">Or paste description text</label>
            <textarea id="importjobclient-or-paste-description-text-field" rows={6} placeholder="Paste full job description..." value={rawText} onChange={(e) => setRawText(e.target.value)} disabled={loading || bulkLoading} />
          </div>
          <button type="button" className="btn btn-muted btn-sm" onClick={handleParse} disabled={loading || bulkLoading}>
            {loading ? 'Reading…' : 'Build draft from this job'}
          </button>

          <h3 style={{ marginTop: '1.5rem' }}>Several direct job links</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
            Up to fifteen public URLs, one per line — we turn each into its own draft you can edit separately.
          </p>
          <textarea rows={4} placeholder="https://...&#10;https://..." value={bulkUrls} onChange={(e) => setBulkUrls(e.target.value)} disabled={bulkLoading || loading} />
          <div className="form-group">
            <label htmlFor="importjobclient-or-paste-careers-page-text-about-a-paragraph-field">Or paste careers page text (about a paragraph)</label>
            <textarea id="importjobclient-or-paste-careers-page-text-about-a-paragraph-field" rows={4} placeholder="Paste the visible text from your careers page if links do not work..." value={careersPaste} onChange={(e) => setCareersPaste(e.target.value)} disabled={bulkLoading || loading} />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleBulkImport}
            disabled={
              bulkLoading ||
              loading ||
              (bulkUrls.trim().split(/[\n\r,]+/).filter((u) => /^https?:\/\//i.test(u.trim())).length === 0 &&
                careersPaste.trim().length < 80 &&
                !careersUrl.trim())
            }
          >
            Create drafts from links or paste
          </button>
        </div>
      </details>

      {bulkResult && bulkResult.errors.length > 0 && (
        <div className="import-job-errors" role="alert">
          <strong>Some issues:</strong>
          <ul>
            {bulkResult.errors.map((err, i) => (
              <li key={i}>
                {err.source}: {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </>
  );
}
