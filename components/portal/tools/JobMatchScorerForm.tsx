'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { Link as LinkIcon, BarChart2 } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackAIToolRun, trackToolLaunch } from '@/lib/analytics/events';
import { useHydrateMemberResumePlainText } from '@/hooks/useHydrateMemberResumePlainText';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import ResumeAnalysisPanel from './ResumeAnalysisPanel';
import ToolFollowThrough from './ToolFollowThrough';
import AiToolError from './AiToolError';
import { FormField } from '@/components/portal/kit';

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  border: '1px solid var(--wa-accent)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

const FIELD_CONTROL: CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontFamily: 'inherit',
};

export interface ParsedMatchOutput {
  matchScore: number;
  strengths: string[];
  gaps: string[];
  quickWins: string[];
  rawText: string;
}

interface SectionAuditCard {
  title: string;
  status: string;
  description: string;
  tone: 'ok' | 'warn' | 'info' | 'danger';
}

interface BulletSuggestion {
  before: string;
  after: string;
}

function deriveSectionAuditCards(parsed: ParsedMatchOutput | null, resumeText: string): SectionAuditCard[] {
  if (!parsed) return [];

  const cards: SectionAuditCard[] = [];
  const resumeLower = resumeText.toLowerCase();

  // Summary card based on overall match
  const summaryStatus = parsed.matchScore >= 80 ? 'Strong' : parsed.matchScore >= 60 ? 'Good' : 'Needs work';
  const summaryTone = parsed.matchScore >= 80 ? 'ok' : parsed.matchScore >= 60 ? 'info' : 'warn';
  cards.push({
    title: 'Summary',
    status: summaryStatus,
    description: `Overall match score: ${parsed.matchScore}%. ${parsed.strengths.length} strengths identified, ${parsed.gaps.length} gaps to address.`,
    tone: summaryTone,
  });

  // Experience card based on gaps analysis
  const hasExperienceGaps = parsed.gaps.some(g =>
    /experience|years|background|worked|role|position/i.test(g)
  );
  cards.push({
    title: 'Experience',
    status: hasExperienceGaps ? 'Needs work' : 'Strong',
    description: hasExperienceGaps
      ? 'Some experience gaps identified. Consider highlighting transferable skills.'
      : 'Your experience aligns well with the role requirements.',
    tone: hasExperienceGaps ? 'warn' : 'ok',
  });

  // Skills card based on strengths
  const skillsMatch = parsed.strengths.length;
  cards.push({
    title: 'Skills',
    status: skillsMatch >= 3 ? 'Strong' : skillsMatch >= 1 ? 'Good' : 'Needs work',
    description: skillsMatch > 0
      ? `${skillsMatch} key skills match the job requirements.`
      : 'Limited direct skill matches found. Review the gaps section.',
    tone: skillsMatch >= 2 ? 'ok' : 'warn',
  });

  // Education card - basic heuristic
  const hasEducationSection = /education|degree|bachelor|master|phd|certification/i.test(resumeLower);
  cards.push({
    title: 'Education',
    status: hasEducationSection ? 'Present' : 'Missing detail',
    description: hasEducationSection
      ? 'Education section found. Ensure relevant certifications are highlighted.'
      : 'Education details not clearly found. Consider adding relevant credentials.',
    tone: hasEducationSection ? 'info' : 'danger',
  });

  return cards;
}

function deriveMissingMetrics(parsed: ParsedMatchOutput | null): string[] {
  if (!parsed) return [];
  
  const metrics: string[] = [];
  
  // Extract metrics-related gaps
  const metricsGaps = parsed.gaps.filter(g => 
    /quantif|metric|number|%|percent|measure|track|improve|reduce|increase/i.test(g)
  );
  
  if (metricsGaps.length > 0) {
    metrics.push(...metricsGaps.slice(0, 2));
  }
  
  // Add generic metrics advice if none found
  if (metrics.length === 0) {
    metrics.push('Consider adding quantified achievements (%, numbers, timeframes)');
  }
  
  // Check for scope/leadership mentions
  const hasScopeMention = parsed.strengths.some(s => /team|lead|manage|direct|scope/i.test(s));
  if (!hasScopeMention) {
    metrics.push('Highlight team size, scope, or leadership responsibilities');
  }
  
  return metrics.slice(0, 3);
}

const BULLET_STOPWORDS = new Set([
  'with', 'that', 'this', 'from', 'your', 'have', 'will', 'into', 'more',
  'them', 'they', 'their', 'about', 'which', 'using', 'used', 'role', 'roles',
  'resume', 'consider', 'adding', 'include', 'highlight', 'emphasize', 'quantify',
  'should', 'could', 'would', 'where', 'when', 'what', 'than', 'then', 'such',
]);

function bulletKeywords(text: string): string[] {
  return Array.from(
    new Set(
      (text.toLowerCase().match(/[a-z][a-z0-9+#.]{3}/g) ?? []).filter(
        (w) => !BULLET_STOPWORDS.has(w)
      )
    )
  );
}

// Pull candidate resume bullet/lines from the member's actual pasted resume so
// the "Before" we show is the user's real content — never invented text.
function resumeBulletLines(resumeText: string): string[] {
  return resumeText
    .split('\n')
    .map((line) => line.replace(/^\s*[•\-*–·●○▪►]+\s*/, '').trim())
    .filter((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      return words.length >= 4 && line.length <= 320;
    });
}

function deriveBulletSuggestions(
  parsed: ParsedMatchOutput | null,
  resumeText: string
): BulletSuggestion[] {
  if (!parsed || parsed.quickWins.length === 0) return [];

  const lines = resumeBulletLines(resumeText);
  if (lines.length === 0) return [];

  const usedLineIndexes = new Set<number>();
  const suggestions: BulletSuggestion[] = [];

  for (const win of parsed.quickWins) {
    if (suggestions.length >= 2) break;

    const winKeywords = bulletKeywords(win);
    if (winKeywords.length === 0) continue;

    // Find the member's own resume line that best overlaps the quick-win's
    // keywords. Only pair a suggestion when we can anchor it to real content.
    let bestIdx = -1;
    let bestScore = 0;
    lines.forEach((line, idx) => {
      if (usedLineIndexes.has(idx)) return;
      const lineLower = line.toLowerCase();
      const score = winKeywords.reduce(
        (acc, kw) => (lineLower.includes(kw) ? acc + 1 : acc),
        0
      );
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestIdx === -1 || bestScore === 0) continue;

    usedLineIndexes.add(bestIdx);
    suggestions.push({
      before: lines[bestIdx],
      after: win});
  }

  return suggestions;
}

function extractSkillsFromAnalysis(parsed: ParsedMatchOutput | null, resumeText: string, jobDesc: string): { matched: string[]; missing: string[] } {
  if (!parsed) return { matched: [], missing: [] };
  
  // Use strengths as matched skills (extract key terms)
  const matched = parsed.strengths
    .map(s => {
      // Extract capitalized terms or technical terms
      const terms = s.match(/\b([A-Z][a-zA-Z]{2}|Python|SQL|JavaScript|React|AWS|Azure|GCP|Kubernetes|Docker|AI|ML|Data)\b/g);
      return terms ? terms[0] : null;
    })
    .filter((s): s is string => Boolean(s))
    .slice(0, 4);
  
  // Use gaps as missing skills
  const missing = parsed.gaps
    .map(g => {
      const terms = g.match(/\b([A-Z][a-zA-Z]{2}|Python|SQL|JavaScript|React|AWS|Azure|GCP|Kubernetes|Docker|AI|ML|Data)\b/g);
      return terms ? terms[0] : null;
    })
    .filter((s): s is string => Boolean(s))
    .slice(0, 3);
  
  // Fallback: if no skills extracted, return empty arrays
  return {
    matched,
    missing,
  };
}

export default function JobMatchScorerForm({
  preview = false,
  initialResume = '',
  initialJobDescription = '',
  initialJobUrl = '',
  previewOutput = '',
  previewParsed = null,
  previewError = '',
}: {
  preview?: boolean;
  initialResume?: string;
  initialJobDescription?: string;
  initialJobUrl?: string;
  /** Seed analysis results — /dev/member?state=filled. */
  previewOutput?: string;
  previewParsed?: ParsedMatchOutput | null;
  /** Seed the shared error state — /dev/member?state=error. */
  previewError?: string;
} = {}) {
  const [resume, setResume] = useState(initialResume);
  const [jobDescription, setJobDescription] = useState(initialJobDescription);
  const [jobUrl, setJobUrl] = useState(initialJobUrl);
  const [output, setOutput] = useState(previewOutput);
  const [parsedOutput, setParsedOutput] = useState<ParsedMatchOutput | null>(previewParsed);
  const [loading, setLoading] = useState(false);
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null);
  const [error, setError] = useState(previewError);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showFloating, setShowFloating] = useState(false);

  useHydrateMemberResumePlainText(setResume, undefined, !preview);
  // Resume hydrates server-side. Persist the user-typed inputs so a refresh
  // mid-paste of a long job description doesn't lose the work.
  useDraftAutosave('ai-tool:job-match-scorer:jobDescription', jobDescription, setJobDescription);
  useDraftAutosave('ai-tool:job-match-scorer:jobUrl', jobUrl, setJobUrl);

  const canSubmit = resume.trim().length > 0 && (jobDescription.trim().length > 0 || jobUrl.trim().length > 0) && !loading && !scrapingUrl;

  useEffect(() => {
    if (!formRef.current || !canSubmit) {
      setShowFloating(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowFloating(!entry.isIntersecting && canSubmit),
      { threshold: 0 }
    );
    const submitBtn = formRef.current.querySelector('button[type="submit"]');
    if (submitBtn) observer.observe(submitBtn);
    return () => observer.disconnect();
  }, [canSubmit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) return;
    setError('');
    setOutput('');
    setParsedOutput(null);
    setLoading(true);
    trackToolLaunch('job-match-scorer', 'Job Match Scorer');
    trackAIToolRun('started', 'job-match-scorer');

    try {
      const payload = {
        resume,
        ...(jobDescription.trim() ? { jobDescription: jobDescription.trim() } : {}),
        ...(jobUrl.trim() ? { jobUrl: jobUrl.trim() } : {})};

      const res = await fetch('/api/ai/job-match-scorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)});

      const data = await res.json();

      if (!res.ok) {
        trackAIToolRun('errored', 'job-match-scorer', { reason: data.error ?? 'request_failed' });
        setError(data.error ?? 'Something went wrong');
        return;
      }

      trackAIToolRun('completed', 'job-match-scorer', { output_length: (data.output ?? '').length });
      setOutput(data.output ?? '');
      setParsedOutput(data.parsed ?? null);
    } catch {
      trackAIToolRun('errored', 'job-match-scorer', { reason: 'network_error' });
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setExtractionWarning(null);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/ai/extract-resume-text', {
        method: 'POST',
        body: formData});
      const data = await res.json();
      if (res.ok && data.text) {
        setResume(data.text);
        const warning = data.extractionWarning;
        setExtractionWarning(
          typeof warning === 'string' && warning.trim() ? warning.trim() : null,
        );
      } else {
        setError(data.error ?? 'Could not extract text');
      }
    } catch {
      setError('Upload failed. Try pasting instead.');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  };

  // Derive display data from parsed output
  const sectionAuditCards = deriveSectionAuditCards(parsedOutput, resume);
  const missingMetrics = deriveMissingMetrics(parsedOutput);
  const bulletSuggestions = deriveBulletSuggestions(parsedOutput, resume);
  const { matched: matchedSkills, missing: missingSkills } = extractSkillsFromAnalysis(parsedOutput, resume, jobDescription);
  const scorePercent = parsedOutput?.matchScore ?? 0;

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ margin: 0 }}>
      <div className="wa-space-y-4">
        <FormField
          id="job-url"
          label="Job posting URL (optional)"
          type="url"
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          placeholder="https://company.com/careers/job-posting"
          disabled={loading || scrapingUrl}
        />
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '-8px 0 0', lineHeight: 1.45 }}>
          <LinkIcon size={12} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Direct Greenhouse, Lever, and Ashby links scrape cleanest.
        </p>
        {scrapingUrl ? (
          <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: 0 }}>
            <PortalInlineSpinner size={16} /> Fetching posting…
          </p>
        ) : null}

        <FormField label="Job description" id="job-desc" full>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the posting here."
            rows={6}
            disabled={loading}
            style={{ ...FIELD_CONTROL, minHeight: 140, resize: 'vertical' }}
          />
        </FormField>

        <FormField label="Resume" id="resume" full>
          <textarea
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="Paste your resume here."
            rows={8}
            required
            disabled={loading}
            style={{ ...FIELD_CONTROL, minHeight: 160, resize: 'vertical' }}
          />
        </FormField>
        {preview ? null : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileUpload}
              disabled={extracting || loading}
              style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}
            />
            {extracting ? (
              <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginLeft: 8 }}>Extracting text…</span>
            ) : null}
          </div>
        )}
        {extractionWarning ? (
          <p
            role="status"
            style={{
              margin: 0,
              padding: '0.75rem',
              borderRadius: 'var(--wa-radius-sm)',
              border: '1px solid var(--wa-gold)',
              background: 'var(--wa-gold-soft)',
              color: 'var(--wa-text)',
              fontSize: 'var(--wa-type-meta)',
              lineHeight: 1.45,
            }}
          >
            {extractionWarning}
          </p>
        ) : null}
      </div>

      {error ? (
        <div style={{ marginTop: 12 }}>
          <AiToolError error={error} />
        </div>
      ) : null}

      <button
        type="submit"
        className={KIT_BTN}
        disabled={!canSubmit}
        aria-busy={loading}
        style={{
          ...kitBtnSolid,
          marginTop: 16,
          opacity: !canSubmit ? 0.55 : 1,
          cursor: !canSubmit ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <PortalInlineSpinner size={18} />
            Analyzing match…
          </>
        ) : (
          'Get match score'
        )}
      </button>

      {output && parsedOutput && (
        <>
          <ResumeAnalysisPanel
            resumePreview={resume}
            scorePercent={scorePercent}
            matchedSkills={matchedSkills}
            missingSkills={missingSkills}
            analysisText={output}
            sectionAuditCards={sectionAuditCards}
            missingMetrics={missingMetrics}
            bulletSuggestions={bulletSuggestions}
            preview={preview}
          />
          <ToolFollowThrough
            toolType="job_match_scorer"
            hrefOverride={preview ? '/dev/member/home' : undefined}
          />
        </>
      )}

      {/* Floating analyze button — mobile */}
      {showFloating && !output && (
        <div
          style={{
            position: 'fixed',
            bottom: '5rem',
            left: '1rem',
            right: '1rem',
            zIndex: 'var(--z-sticky)' as CSSProperties['zIndex']}}
          className="wa-flex md:wa-hidden"
        >
          <button
            type="submit"
            className={`${KIT_BTN} md:wa-hidden`}
            disabled={loading}
            style={{
              ...kitBtnSolid,
              width: '100%',
              boxShadow: 'var(--wa-shadow-lg)',
            }}
          >
            {loading ? (
              <>
                <PortalInlineSpinner size={18} />
                Analyzing…
              </>
            ) : (
              <>
                <BarChart2 size={16} aria-hidden="true" />
                Get match score
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}
