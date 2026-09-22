'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, FileText, Keyboard, MessagesSquare, Mic, PenLine, Search, Sparkles, Upload, User } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { mockInterviewVoiceSurface, resumeCoachVoiceSurface } from '@/lib/portal/voice';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

type ToolKey =
  | 'resume'
  | 'coverLetter'
  | 'interview'
  | 'resumeAnalysis'
  | 'gapAnalyzer'
  | 'jobMatch'
  | 'headline'
  | 'about'
  | 'salary'
  | 'pitch';
type CardVoiceKey = 'walkthrough' | 'resume' | 'cover' | 'interview';

type Status = 'idle' | 'running' | 'done' | 'error';

type ToolState = {
  status: Status;
  error: string | null;
  output: string | null;
  // tool-specific input snapshot for the email packet
  context: string | null;
};

const initialToolState: ToolState = { status: 'idle', error: null, output: null, context: null };

/**
 * Colour vocabulary for the tool cards and the tool grid. Everything reads the
 * `--wa-*` tokens (css/wa-brand-tokens.css) so both themes resolve; the one
 * hex literal that remains has a reason:
 *  - LinkedIn's brand blue is a third-party identity colour with no token.
 * The voice accents used to be a hex pair because PortalVoiceSession built
 * `${accent}44` / `${accent}88` alpha strings; its alpha steps are color-mix
 * now, so the info pair resolves in both themes as a `var()`.
 */
const TOOL_TEAL = 'color-mix(in srgb, var(--wa-info) 50%, var(--wa-success))';
const LINKEDIN_BRAND_BLUE = '#0077b5';
const VOICE_ACCENT = 'var(--wa-info)';
const VOICE_ACCENT_DARK = 'var(--wa-info-dark)';

interface Props {
  memberId: string;
  memberFullName: string;
  memberEmail: string;
  memberPhone: string | null;
  memberTargetRole: string | null;
  sessionId: string;
  existingResume: string;
  isFreshWalkIn: boolean;
  /** Where "Edit full profile" links to. Differs by actor (counselor vs admin). */
  memberDetailHref?: string;
  /** Where "Back to sessions" goes after the packet sends. Differs by actor. */
  sessionsListHref?: string;
}

/**
 * Session run page client. Stacked cards walk counselor + member through:
 *
 *   1. Profile snapshot — show what we know, link out to full edit
 *   2. Resume rewriter — paste resume, frame it for the target role
 *   3. Cover letter — feed in a job description, generate tailored letter
 *   4. Interview prep — generate role-targeted practice questions + answers
 *
 * Each AI tool POST includes `subjectMemberId` + `sessionId` so the run
 * lands in the MEMBER's history (not the counselor's) and can be grouped
 * later as "Your session with {actor} on {date}" on the member dashboard.
 *
 * "End session" emails the cumulative packet to the member.
 */
export default function SessionRunClient({
  memberId,
  memberFullName,
  memberEmail,
  memberPhone,
  memberTargetRole,
  sessionId,
  existingResume,
  isFreshWalkIn,
  memberDetailHref,
  sessionsListHref}: Props) {
  // Default to counselor paths so callers that don't pass these (legacy
  // call sites) keep their existing behavior.
  const editProfileHref = memberDetailHref ?? `/counselor/students/${memberId}`;
  const backToSessionsHref = sessionsListHref ?? '/counselor/sessions';
  const router = useRouter();

  // Collapsible card state — core cards open by default, extras closed
  const [openCards, setOpenCards] = useState<Set<string>>(
    new Set(['voice', 'profile', 'resume', 'cover', 'interview'])
  );
  const toggleCard = (key: string) =>
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const openCard = (key: string) =>
    setOpenCards(prev => new Set([...prev, key]));

  // Per-tool state
  const [resumeState, setResumeState] = useState<ToolState>(initialToolState);
  const [coverState, setCoverState] = useState<ToolState>(initialToolState);
  const [interviewState, setInterviewState] = useState<ToolState>(initialToolState);
  const [resumeAnalysisState, setResumeAnalysisState] = useState<ToolState>(initialToolState);
  const [gapState, setGapState] = useState<ToolState>(initialToolState);
  const [jobMatchState, setJobMatchState] = useState<ToolState>(initialToolState);
  const [headlineState, setHeadlineState] = useState<ToolState>(initialToolState);
  const [aboutState, setAboutState] = useState<ToolState>(initialToolState);
  const [salaryState, setSalaryState] = useState<ToolState>(initialToolState);
  const [pitchState, setPitchState] = useState<ToolState>(initialToolState);

  // Per-tool inputs
  const [resumeText, setResumeText] = useState(existingResume);
  const [jobTarget, setJobTarget] = useState(memberTargetRole ?? '');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [interviewLevel, setInterviewLevel] = useState<'entry' | 'mid' | 'senior'>('entry');
  const [keySkills, setKeySkills] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [linkedinBullets, setLinkedinBullets] = useState('');
  const [currentOffer, setCurrentOffer] = useState('');
  const [targetSalary, setTargetSalary] = useState('');
  const [salaryDelivery, setSalaryDelivery] = useState<'phone' | 'email'>('email');
  const [pitchStrengths, setPitchStrengths] = useState('');
  const [pitchCertifications, setPitchCertifications] = useState('');
  const [pitchIndustry, setPitchIndustry] = useState('');

  // Resume upload state
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadResumeError, setUploadResumeError] = useState<string | null>(null);
  const [uploadResumeWarning, setUploadResumeWarning] = useState<string | null>(null);

  // Wrap-up state
  const [endingSession, setEndingSession] = useState(false);
  const [packetSent, setPacketSent] = useState(false);
  const [packetError, setPacketError] = useState<string | null>(null);


  // Per-card voice state. Each card (walkthrough, resume, cover,
  // interview) can be toggled into voice mode independently. The active
  // card's transcript routes to its own bucket so transcripts don't bleed
  // across cards. Walkthrough is the only one open by default — the
  // others open inline when the counselor clicks "Use voice".
  const [activeVoiceCard, setActiveVoiceCard] = useState<CardVoiceKey | null>('walkthrough');
  const [transcripts, setTranscripts] = useState<Record<CardVoiceKey, string[]>>({
    walkthrough: [],
    resume: [],
    cover: [],
    interview: []});
  const [voiceComplete, setVoiceComplete] = useState<Record<CardVoiceKey, boolean>>({
    walkthrough: false,
    resume: false,
    cover: false,
    interview: false});

  const makeTranscriptHandler = (card: CardVoiceKey) =>
    (chunk: { speaker: 'agent' | 'user'; text: string }) => {
      setTranscripts((prev) => ({
        ...prev,
        [card]: [...prev[card], `${chunk.speaker === 'user' ? 'Member' : 'Coach'}: ${chunk.text}`]}));
    };
  const makePhaseHandler = (card: CardVoiceKey) =>
    (phase: string) => {
      if (phase === 'done') setVoiceComplete((prev) => ({ ...prev, [card]: true }));
    };

  const walkthroughTranscript = transcripts.walkthrough;
  const walkthroughText = walkthroughTranscript.join('\n');

  const applyTranscriptAsResume = useCallback((card: CardVoiceKey = 'walkthrough') => {
    const lines = transcripts[card];
    if (lines.length === 0) return;
    const memberOnly = lines
      .filter((line) => line.startsWith('Member:'))
      .map((line) => line.replace(/^Member: /, ''))
      .join('\n');
    if (memberOnly.trim().length > 0) {
      setResumeText(memberOnly);
    }
  }, [transcripts]);

  const useTranscriptAsCoverContext = useCallback(() => {
    const lines = transcripts.cover;
    if (lines.length === 0) return;
    const memberOnly = lines
      .filter((line) => line.startsWith('Member:'))
      .map((line) => line.replace(/^Member: /, ''))
      .join('\n');
    setJobDescription((prev) => (prev.trim().length > 0 ? prev : memberOnly || lines.join('\n')));
  }, [transcripts.cover]);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingResume(true);
    setUploadResumeError(null);
    setUploadResumeWarning(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('memberId', memberId);
    try {
      const res = await fetch('/api/counselor/sessions/upload-resume', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadResumeError(data.error ?? 'Upload failed');
      } else if (data.text) {
        setResumeText(data.text);
        setUploadResumeWarning([
          typeof data.extractionWarning === 'string' ? data.extractionWarning.trim() : '',
          data.enhancedInvalidated
            ? 'The prior enhanced draft was archived because the source resume changed.'
            : '',
        ].filter(Boolean).join(' ') || null);
      }
    } catch {
      setUploadResumeError('Network error uploading file');
    } finally {
      setUploadingResume(false);
    }
  };

  const toggleVoice = (card: CardVoiceKey) => {
    setActiveVoiceCard((prev) => (prev === card ? null : card));
  };

  // Memoized payloads for each card's voice session — threading prior
  // outputs forward so each agent picks up where the last one left off.
  const walkthroughPayload = useMemo(() => ({
    memberId,
    sessionId,
    card: 'walkthrough' as const}), [memberId, sessionId]);

  const resumeVoicePayload = useMemo(() => ({
    memberId,
    sessionId,
    card: 'resume' as const,
    resumeDraft: resumeText,
    jobTarget}), [memberId, sessionId, resumeText, jobTarget]);

  const coverVoicePayload = useMemo(() => ({
    memberId,
    sessionId,
    card: 'cover' as const,
    resumeDraft: resumeState.output ?? resumeText,
    jobTarget,
    jobDescription,
    companyName}), [memberId, sessionId, resumeState.output, resumeText, jobTarget, jobDescription, companyName]);

  const interviewVoicePayload = useMemo(() => ({
    memberId,
    sessionId,
    card: 'interview' as const,
    resumeDraft: resumeState.output ?? resumeText,
    coverDraft: coverState.output ?? '',
    jobTarget,
    interviewLevel}), [memberId, sessionId, resumeState.output, coverState.output, resumeText, jobTarget, interviewLevel]);

  const hasAnyOutput = !!(resumeState.output || coverState.output || interviewState.output ||
    resumeAnalysisState.output || gapState.output || jobMatchState.output ||
    headlineState.output || aboutState.output || salaryState.output || pitchState.output);
  const allRun = !!(resumeState.output && coverState.output && interviewState.output);

  // Tool grid: all runnable tools (excludes voice walkthrough + profile which aren't AI outputs)
  const TOOL_GRID: Array<{ key: string; label: string; state: ToolState; accent: string }> = [
    { key: 'pitch', label: 'Elevator Pitch', state: pitchState, accent: 'var(--wa-gold)' },
    { key: 'resume', label: 'Resume Rewriter', state: resumeState, accent: 'var(--color-accent)' },
    { key: 'gapAnalyzer', label: 'Gap Analysis', state: gapState, accent: TOOL_TEAL },
    { key: 'resumeAnalysis', label: 'Resume Analysis', state: resumeAnalysisState, accent: 'var(--wa-gold)' },
    { key: 'jobMatch', label: 'Job Match Score', state: jobMatchState, accent: 'var(--wa-success)' },
    { key: 'headline', label: 'LinkedIn Headline', state: headlineState, accent: LINKEDIN_BRAND_BLUE },
    { key: 'about', label: 'LinkedIn About', state: aboutState, accent: LINKEDIN_BRAND_BLUE },
    { key: 'cover', label: 'Cover Letter', state: coverState, accent: 'var(--wa-gold)' },
    { key: 'interview', label: 'Interview Prep', state: interviewState, accent: 'var(--wa-info)' },
    { key: 'salary', label: 'Salary Script', state: salaryState, accent: 'var(--wa-gold-dark)' },
  ];

  const completedTools = TOOL_GRID.filter(t => t.state.output);

  const runTool = async (
    key: ToolKey,
    setState: (next: ToolState) => void,
    endpoint: string,
    body: Record<string, unknown>,
    contextLabel: string,
    parseOutput: (data: unknown) => string,
  ) => {
    setState({ ...initialToolState, status: 'running' });
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, subjectMemberId: memberId, sessionId })});
      const data = await res.json();
      if (!res.ok) {
        setState({ status: 'error', error: data.error ?? 'Tool failed', output: null, context: contextLabel });
        return;
      }
      setState({ status: 'done', error: null, output: parseOutput(data), context: contextLabel });
    } catch (err) {
      console.error(`[session-run:${key}]`, err);
      setState({ status: 'error', error: 'Network error', output: null, context: contextLabel });
    }
  };

  const runResume = () => {
    openCard('resume');
    runTool('resume', setResumeState, '/api/ai/resume-rewriter',
      { resume: resumeText, jobTarget, targetLocation: '', targetSalary: '' },
      jobTarget, (d) => (d as { output?: string }).output ?? '');
  };
  const runCover = () => {
    openCard('cover');
    runTool('coverLetter', setCoverState, '/api/ai/cover-letter',
      { resume: resumeText, jobDescription, companyName: companyName || 'the company', tone: 'confident' },
      `${companyName || 'cover letter'} — ${jobTarget || 'role'}`,
      (d) => (d as { output?: string }).output ?? '');
  };
  const runInterview = () => {
    openCard('interview');
    runTool('interview', setInterviewState, '/api/ai/interview-practice',
      { role: jobTarget, experienceLevel: interviewLevel, count: 6, resumeContext: resumeText },
      `${jobTarget} (${interviewLevel})`,
      (d) => JSON.stringify((d as { questions?: unknown }).questions ?? []));
  };
  const runResumeAnalysis = () => {
    openCard('resumeAnalysis');
    runTool('resumeAnalysis', setResumeAnalysisState, '/api/ai/resume-strength',
      { resume: resumeText }, 'Resume strength check',
      (d) => (d as { output?: string }).output ?? '');
  };
  const runGapAnalyzer = () => {
    openCard('gapAnalyzer');
    runTool('gapAnalyzer', setGapState, '/api/ai/gap-analyzer',
      { resume: resumeText }, 'Gap analysis',
      (d) => (d as { output?: string }).output ?? '');
  };
  const runJobMatch = () => {
    openCard('jobMatch');
    runTool('jobMatch', setJobMatchState, '/api/ai/job-match-scorer',
      { resume: resumeText, jobDescription }, `Job match — ${companyName || jobTarget}`,
      (d) => {
        const p = (d as { parsed?: { rawText: string } }).parsed;
        return p?.rawText ?? '';
      });
  };
  const runHeadline = () => {
    openCard('headline');
    runTool('headline', setHeadlineState, '/api/ai/linkedin-headline',
      { role: jobTarget, keySkills, yearsExperience: yearsExperience || undefined },
      `LinkedIn headline — ${jobTarget}`,
      (d) => ((d as { headlines?: string[] }).headlines ?? []).join('\n\n'));
  };
  const runAbout = () => {
    openCard('about');
    runTool('about', setAboutState, '/api/ai/linkedin-about',
      { role: jobTarget, bullets: linkedinBullets || resumeText.slice(0, 1200) },
      `LinkedIn About — ${jobTarget}`,
      (d) => (d as { output?: string }).output ?? '');
  };
  const runSalary = () => {
    openCard('salary');
    runTool('salary', setSalaryState, '/api/ai/salary-negotiation',
      { currentOffer: Number(currentOffer), targetSalary: Number(targetSalary), jobTitle: jobTarget, companyName: companyName || 'the company', deliveryMethod: salaryDelivery },
      `Salary negotiation — ${companyName || jobTarget}`,
      (d) => (d as { output?: string }).output ?? '');
  };
  const runPitch = () => {
    openCard('pitch');
    runTool('pitch', setPitchState, '/api/ai/elevator-pitch',
      { name: memberFullName, targetRole: jobTarget, strengths: pitchStrengths || undefined, certifications: pitchCertifications || undefined, industry: pitchIndustry || undefined },
      `Elevator pitch — ${jobTarget}`,
      (d) => (d as { pitch?: string }).pitch ?? '');
  };

  const endSession = async () => {
    setEndingSession(true);
    setPacketError(null);
    try {
      const res = await fetch('/api/counselor/sessions/email-packet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, sessionId })});
      const data = await res.json();
      if (!res.ok) {
        setPacketError(data.error ?? 'Failed to send packet');
        setEndingSession(false);
        return;
      }
      setPacketSent(true);
      setEndingSession(false);
      // Stay on page so counselor can review what they shipped.
    } catch (err) {
      console.error('[session-run:end]', err);
      setPacketError('Network error sending packet');
      setEndingSession(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '960px' }}>
      {isFreshWalkIn ? (
        <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--wa-success-soft)', borderLeft: '4px solid var(--wa-success)' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--wa-success)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-on-surface)' }}>
            Account created. <strong>{memberEmail}</strong> will get a welcome email with a sign-in link
            once you click <em>End session</em>.
          </p>
        </div>
      ) : null}

      {/* Tool picker grid */}
      <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.25rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Session tools — pick what this member needs
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.5rem' }}>
          {TOOL_GRID.map(t => {
            const isDone = !!t.state.output;
            const isRunning = t.state.status === 'running';
            const isError = t.state.status === 'error';
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  openCard(t.key);
                  const el = document.getElementById(`session-card-${t.key}`);
                  if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.45rem 0.65rem', borderRadius: '0.5rem',
                  background: isDone
                    ? `color-mix(in srgb, ${t.accent} 10%, transparent)`
                    : 'var(--surface-container)',
                  border: `1px solid ${isDone ? t.accent : 'var(--surface-container-highest)'}`,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.15s'}}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isDone ? 'var(--wa-success)' : isRunning ? t.accent : isError ? 'var(--wa-danger)' : 'var(--surface-container-highest)'}} />
                <span style={{ fontSize: '0.8125rem', fontWeight: isDone ? 700 : 500, color: isDone ? t.accent : 'var(--color-on-surface)', lineHeight: 1.3 }}>
                  {t.label}
                </span>
                {isDone && <CheckCircle2 size={12} style={{ color: 'var(--wa-success)', flexShrink: 0, marginLeft: 'auto' }} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Voice walk-through (primary path, optional) ──
          Per user direction (2026-04-26): "we want these to be all voice
          tools here." Per follow-up (2026-04-27): "each step is separate
          card. filling out as you go along. and all feeding to each other
          right." So this top card stays as the optional A→Z walk-through
          (one big conversation), and each card below also gets its own
          step-specific voice option. */}
      <SectionCard
        id="session-card-voice"
        step={0}
        isOpen={openCards.has('voice')}
        onToggle={() => toggleCard('voice')}
        title="Voice walk-through (full A→Z)"
        Icon={Mic}
        accent="var(--wa-info)"
        statusBadge={
          voiceComplete.walkthrough
            ? 'Recorded'
            : walkthroughTranscript.length > 0
            ? 'Live'
            : activeVoiceCard === 'walkthrough'
            ? 'Ready'
            : 'Optional'
        }
        headerAction={
          <button
            type="button"
            className="btn btn-muted btn-small"
            onClick={() => toggleVoice('walkthrough')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            {activeVoiceCard === 'walkthrough' ? <Keyboard size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
            {activeVoiceCard === 'walkthrough' ? 'Hide voice' : 'Use voice'}
          </button>
        }
      >
        <p style={{ margin: '0 0 1rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
          One long conversation that walks {memberFullName.split(' ')[0]} through profile, work history,
          target role, and interview prep — or skip this and use voice on each card below as you go.
        </p>
        {activeVoiceCard === 'walkthrough' ? (
          <VoiceAgentSurface {...resumeCoachVoiceSurface}>
            <PortalVoiceSessionLazy
              sessionEndpoint="/api/counselor/sessions/voice-walkthrough"
              sessionPayload={walkthroughPayload}
              title={`Build ${memberFullName.split(' ')[0]}'s session out loud`}
              titleAs="h3"
              description="Resume coach + cover letter + interview prep, all in one voice session."
              accent={VOICE_ACCENT}
              accentDark={VOICE_ACCENT_DARK}
              speakingLabel="Coach is speaking…"
              listeningLabel="Listening — answer out loud"
              onTranscriptChunk={makeTranscriptHandler('walkthrough')}
              onPhaseChange={makePhaseHandler('walkthrough')}
              showLiveTranscript
              liveTranscriptCoachLabel="Coach"
              liveTranscriptYouLabel={memberFullName.split(' ')[0]}
              retryWithoutDynamicVariables={false}
            />
          </VoiceAgentSurface>
        ) : null}
        {walkthroughTranscript.length > 0 ? (
          <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: 'var(--surface-container-low)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                {walkthroughTranscript.length} transcript line{walkthroughTranscript.length === 1 ? '' : 's'} captured
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                Use as the resume input below, then refine + click &ldquo;Build resume.&rdquo;
              </p>
            </div>
            <button
              type="button"
              className="btn btn-muted btn-small"
              onClick={() => applyTranscriptAsResume('walkthrough')}
              disabled={walkthroughText.length < 30}
            >
              Pre-fill resume input &rarr;
            </button>
          </div>
        ) : null}
      </SectionCard>

      {/* Card 1: Profile snapshot */}
      <SectionCard
        id="session-card-profile"
        step={1}
        isOpen={openCards.has('profile')}
        onToggle={() => toggleCard('profile')}
        title="Profile"
        Icon={User}
        accent="var(--wa-info)"
        statusBadge={memberPhone ? 'On file' : 'Needs detail'}
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)' }}>
          What we know so far. Click <strong>Edit profile</strong> to fill in WIOA-eligibility fields,
          employment status, and longer bio — then come back here to keep going.
        </p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem 1.5rem', margin: 0 }}>
          <ProfileField label="Name" value={memberFullName} />
          <ProfileField label="Email" value={memberEmail} />
          <ProfileField label="Phone" value={memberPhone ?? '—'} />
          <ProfileField label="Target role" value={memberTargetRole ?? (jobTarget || '—')} />
        </dl>
        <div style={{ marginTop: '1rem' }}>
          <Link
            href={editProfileHref}
            target="_blank"
            rel="noopener"
            className="btn btn-muted btn-small"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <PenLine size={16} aria-hidden /> Edit full profile
            <ExternalLink size={14} aria-hidden />
          </Link>
        </div>
      </SectionCard>

      
      {/* Card 2: Elevator Pitch */}
      <SectionCard
        id="session-card-resume"
        step={2}
        isOpen={openCards.has('resume')}
        onToggle={() => toggleCard('resume')}
        title="Resume rewriter"
        Icon={FileText}
        accent="var(--color-accent)"
        statusBadge={
          resumeState.status === 'running' ? 'Running' :
          resumeState.output ? 'Done' :
          resumeState.error ? 'Failed' :
          activeVoiceCard === 'resume' ? 'Voice' :
          'Ready'
        }
        headerAction={
          <button
            type="button"
            className="btn btn-muted btn-small"
            onClick={() => toggleVoice('resume')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            {activeVoiceCard === 'resume' ? <Keyboard size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
            {activeVoiceCard === 'resume' ? 'Hide voice' : 'Use voice'}
          </button>
        }
      >
        {activeVoiceCard === 'resume' ? (
          <div style={{ marginBottom: '1rem' }}>
            <VoiceAgentSurface {...resumeCoachVoiceSurface}>
              <PortalVoiceSessionLazy
                sessionEndpoint="/api/counselor/sessions/voice-walkthrough"
                sessionPayload={resumeVoicePayload}
                title="Resume coach"
                titleAs="h3"
                description="Talk through experience, certifications, and framing for the target role."
                accent={VOICE_ACCENT}
                accentDark={VOICE_ACCENT_DARK}
                speakingLabel="Coach is speaking…"
                listeningLabel="Listening — answer out loud"
                onTranscriptChunk={makeTranscriptHandler('resume')}
                onPhaseChange={makePhaseHandler('resume')}
                showLiveTranscript
                liveTranscriptCoachLabel="Coach"
                liveTranscriptYouLabel={memberFullName.split(' ')[0]}
                retryWithoutDynamicVariables={false}
              />
            </VoiceAgentSurface>
            {transcripts.resume.length > 0 ? (
              <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', background: 'var(--surface-container-low)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  {transcripts.resume.length} transcript line{transcripts.resume.length === 1 ? '' : 's'} captured
                </span>
                <button
                  type="button"
                  className="btn btn-muted btn-small"
                  onClick={() => applyTranscriptAsResume('resume')}
                  disabled={transcripts.resume.join('\n').length < 30}
                >
                  Pre-fill resume input &darr;
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-job-target">
            Target role <span style={{ color: 'var(--color-accent)' }}>*</span>
          </label>
          <input
            id="session-job-target"
            type="text"
            value={jobTarget}
            onChange={(e) => setJobTarget(e.target.value)}
            placeholder="IT Support Specialist"
            disabled={resumeState.status === 'running'}
          />
        </div>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <label htmlFor="session-resume-text" style={{ margin: 0 }}>
              Resume / experience <span style={{ color: 'var(--color-accent)' }}>*</span>
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: uploadingResume || resumeState.status === 'running' ? 'not-allowed' : 'pointer',
                opacity: uploadingResume || resumeState.status === 'running' ? 0.5 : 1,
                color: 'var(--color-on-surface-variant)'}}
            >
              {uploadingResume
                ? <PortalInlineSpinner size={14} />
                : <Upload size={14} aria-hidden />}
              {uploadingResume ? 'Uploading…' : 'Upload file'}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                style={{ display: 'none' }}
                disabled={uploadingResume || resumeState.status === 'running'}
                onChange={handleResumeUpload}
              />
            </label>
          </div>
          {uploadResumeError ? (
            <p role="alert" style={{ margin: '0 0 0.35rem', fontSize: '0.8125rem', color: 'var(--color-accent)' }}>{uploadResumeError}</p>
          ) : null}
          {uploadResumeWarning ? (
            <p role="status" style={{ margin: '0 0 0.35rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{uploadResumeWarning}</p>
          ) : null}
          <textarea
            id="session-resume-text"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={8}
            placeholder="Paste their resume, or type out their work history together — jobs, dates, what they did."
            disabled={resumeState.status === 'running'}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={runResume}
          disabled={resumeState.status === 'running' || !jobTarget.trim() || resumeText.trim().length < 50}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {resumeState.status === 'running' ? (
            <PortalInlineSpinner size={16} />
          ) : (
            <Sparkles size={16} aria-hidden />
          )}
          {resumeState.status === 'running' ? 'Generating…' : resumeState.output ? 'Re-run' : 'Build resume'}
        </button>
        {resumeState.error ? (
          <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{resumeState.error}</p>
        ) : null}
        {resumeState.output ? (
          <OutputPanel label="Polished resume" body={resumeState.output} savedTo={memberFullName} />
        ) : null}
      </SectionCard>

      {/* Card 4: Cover letter */}
      <SectionCard
        id="session-card-cover"
        step={3}
        isOpen={openCards.has('cover')}
        onToggle={() => toggleCard('cover')}
        title="Cover letter"
        Icon={MessagesSquare}
        accent="var(--wa-gold)"
        statusBadge={
          coverState.status === 'running' ? 'Running' :
          coverState.output ? 'Done' :
          coverState.error ? 'Failed' :
          activeVoiceCard === 'cover' ? 'Voice' :
          'Ready'
        }
        contextNote={
          resumeState.output
            ? `Using resume from step 2 as context.`
            : resumeText.trim().length > 50
            ? 'Will use the resume input from step 2 as context.'
            : null
        }
        headerAction={
          <button
            type="button"
            className="btn btn-muted btn-small"
            onClick={() => toggleVoice('cover')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            {activeVoiceCard === 'cover' ? <Keyboard size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
            {activeVoiceCard === 'cover' ? 'Hide voice' : 'Use voice'}
          </button>
        }
      >
        {activeVoiceCard === 'cover' ? (
          <div style={{ marginBottom: '1rem' }}>
            <VoiceAgentSurface {...resumeCoachVoiceSurface}>
              <PortalVoiceSessionLazy
                sessionEndpoint="/api/counselor/sessions/voice-walkthrough"
                sessionPayload={coverVoicePayload}
                title="Cover letter coach"
                titleAs="h3"
                description="Read or paraphrase the job posting out loud — coach helps frame the cover."
                accent={VOICE_ACCENT}
                accentDark={VOICE_ACCENT_DARK}
                speakingLabel="Coach is speaking…"
                listeningLabel="Listening — describe the role"
                onTranscriptChunk={makeTranscriptHandler('cover')}
                onPhaseChange={makePhaseHandler('cover')}
                showLiveTranscript
                liveTranscriptCoachLabel="Coach"
                liveTranscriptYouLabel={memberFullName.split(' ')[0]}
                retryWithoutDynamicVariables={false}
              />
            </VoiceAgentSurface>
            {transcripts.cover.length > 0 ? (
              <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', background: 'var(--surface-container-low)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  {transcripts.cover.length} transcript line{transcripts.cover.length === 1 ? '' : 's'} captured
                </span>
                <button
                  type="button"
                  className="btn btn-muted btn-small"
                  onClick={useTranscriptAsCoverContext}
                  disabled={transcripts.cover.join('\n').length < 30}
                >
                  Pre-fill job description &darr;
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-company-name">Company name</label>
          <input
            id="session-company-name"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corp"
            disabled={coverState.status === 'running'}
          />
        </div>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-job-desc">
            Job description <span style={{ color: 'var(--color-accent)' }}>*</span>
          </label>
          <textarea
            id="session-job-desc"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={5}
            placeholder="Paste the job posting they want to apply to."
            disabled={coverState.status === 'running'}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={runCover}
          disabled={coverState.status === 'running' || jobDescription.trim().length < 20 || resumeText.trim().length < 50}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {coverState.status === 'running' ? (
            <PortalInlineSpinner size={16} />
          ) : (
            <Sparkles size={16} aria-hidden />
          )}
          {coverState.status === 'running' ? 'Generating…' : coverState.output ? 'Re-run' : 'Build cover letter'}
        </button>
        {coverState.error ? (
          <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{coverState.error}</p>
        ) : null}
        {coverState.output ? (
          <OutputPanel label="Tailored cover letter" body={coverState.output} savedTo={memberFullName} />
        ) : null}
      </SectionCard>

      {/* Card 5: Interview prep */}
      <SectionCard
        id="session-card-interview"
        step={4}
        isOpen={openCards.has('interview')}
        onToggle={() => toggleCard('interview')}
        title="Interview prep"
        Icon={MessagesSquare}
        accent="var(--wa-info)"
        statusBadge={
          interviewState.status === 'running' ? 'Running' :
          interviewState.output ? 'Done' :
          interviewState.error ? 'Failed' :
          activeVoiceCard === 'interview' ? 'Voice' :
          'Ready'
        }
        contextNote={
          resumeState.output && coverState.output
            ? 'Using resume + cover letter from steps 2 & 3 as context.'
            : resumeState.output
            ? 'Using resume from step 2 as context.'
            : null
        }
        headerAction={
          <button
            type="button"
            className="btn btn-muted btn-small"
            onClick={() => toggleVoice('interview')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            {activeVoiceCard === 'interview' ? <Keyboard size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
            {activeVoiceCard === 'interview' ? 'Hide voice' : 'Use voice'}
          </button>
        }
      >
        {activeVoiceCard === 'interview' ? (
          <div style={{ marginBottom: '1rem' }}>
            <VoiceAgentSurface {...mockInterviewVoiceSurface}>
              <PortalVoiceSessionLazy
                sessionEndpoint="/api/counselor/sessions/voice-walkthrough"
                sessionPayload={interviewVoicePayload}
                title="Mock interview"
                titleAs="h3"
                description={`Practice ${jobTarget || 'role-fit'} questions out loud. Coach references the resume + cover letter.`}
                accent="var(--wa-gold)"
                accentDark="var(--wa-gold-dark)"
                speakingLabel="Interviewer is asking…"
                listeningLabel="Listening — answer out loud"
                onTranscriptChunk={makeTranscriptHandler('interview')}
                onPhaseChange={makePhaseHandler('interview')}
                showLiveTranscript
                liveTranscriptCoachLabel="Interviewer"
                liveTranscriptYouLabel={memberFullName.split(' ')[0]}
                retryWithoutDynamicVariables={false}
              />
            </VoiceAgentSurface>
          </div>
        ) : null}
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-interview-level">Experience level</label>
          <select
            id="session-interview-level"
            value={interviewLevel}
            onChange={(e) => setInterviewLevel(e.target.value as 'entry' | 'mid' | 'senior')}
            disabled={interviewState.status === 'running'}
          >
            <option value="entry">Entry-level (0–2 years)</option>
            <option value="mid">Mid-level (3–7 years)</option>
            <option value="senior">Senior (8+ years)</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={runInterview}
          disabled={interviewState.status === 'running' || !jobTarget.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {interviewState.status === 'running' ? (
            <PortalInlineSpinner size={16} />
          ) : (
            <Sparkles size={16} aria-hidden />
          )}
          {interviewState.status === 'running' ? 'Generating…' : interviewState.output ? 'Re-run' : 'Generate questions'}
        </button>
        {interviewState.error ? (
          <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{interviewState.error}</p>
        ) : null}
        {interviewState.output ? (
          <InterviewOutput body={interviewState.output} savedTo={memberFullName} />
        ) : null}
      </SectionCard>

      {/* Card 5: Resume strength analysis */}
      <SectionCard id="session-card-resumeAnalysis" title="Resume Analysis" Icon={FileText} accent="var(--wa-gold)"
        isOpen={openCards.has('resumeAnalysis')} onToggle={() => toggleCard('resumeAnalysis')}
        statusBadge={resumeAnalysisState.status === 'running' ? 'Running' : resumeAnalysisState.output ? 'Done' : resumeAnalysisState.error ? 'Failed' : 'Ready'}
        contextNote={resumeText.trim().length > 50 ? 'Uses resume from step 2.' : null}
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          Score the resume for clarity, impact, keywords, and ATS scannability. Surfaces strengths and priority improvements.
        </p>
        <button type="button" className="btn btn-primary btn-small" onClick={runResumeAnalysis}
          disabled={resumeAnalysisState.status === 'running' || resumeText.trim().length < 100}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {resumeAnalysisState.status === 'running' ? <PortalInlineSpinner size={16} /> : <Sparkles size={16} aria-hidden />}
          {resumeAnalysisState.status === 'running' ? 'Analyzing…' : resumeAnalysisState.output ? 'Re-run' : 'Analyze resume'}
        </button>
        {resumeAnalysisState.error && <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{resumeAnalysisState.error}</p>}
        {resumeAnalysisState.output && <OutputPanel label="Resume analysis" body={resumeAnalysisState.output} savedTo={memberFullName} />}
      </SectionCard>

      {/* Card 6: Gap analyzer */}
      <SectionCard id="session-card-gapAnalyzer" title="Gap Analyzer" Icon={FileText} accent={TOOL_TEAL}
        isOpen={openCards.has('gapAnalyzer')} onToggle={() => toggleCard('gapAnalyzer')}
        statusBadge={gapState.status === 'running' ? 'Running' : gapState.output ? 'Done' : gapState.error ? 'Failed' : 'Ready'}
        contextNote={resumeText.trim().length > 50 ? 'Uses resume from step 2.' : null}
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          Detect employment gaps and generate framing language for cover letters and interviews.
        </p>
        <button type="button" className="btn btn-primary btn-small" onClick={runGapAnalyzer}
          disabled={gapState.status === 'running' || resumeText.trim().length < 100}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {gapState.status === 'running' ? <PortalInlineSpinner size={16} /> : <Sparkles size={16} aria-hidden />}
          {gapState.status === 'running' ? 'Analyzing…' : gapState.output ? 'Re-run' : 'Analyze gaps'}
        </button>
        {gapState.error && <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{gapState.error}</p>}
        {gapState.output && <OutputPanel label="Gap analysis" body={gapState.output} savedTo={memberFullName} />}
      </SectionCard>

      {/* Card 7: Job match scorer */}
      <SectionCard id="session-card-jobMatch" title="Job Match Scorer" Icon={Search} accent="var(--wa-success)"
        isOpen={openCards.has('jobMatch')} onToggle={() => toggleCard('jobMatch')}
        statusBadge={jobMatchState.status === 'running' ? 'Running' : jobMatchState.output ? 'Done' : jobMatchState.error ? 'Failed' : 'Ready'}
        contextNote={resumeText.trim().length > 50 ? 'Uses resume from step 2.' : null}
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          Score how well the resume matches a specific job posting and surface quick wins.
        </p>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-jms-desc">Job description <span style={{ color: 'var(--color-accent)' }}>*</span></label>
          <textarea id="session-jms-desc" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)}
            rows={4} placeholder="Paste the job posting here (reuses input from cover letter card)."
            disabled={jobMatchState.status === 'running'} />
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={runJobMatch}
          disabled={jobMatchState.status === 'running' || resumeText.trim().length < 100 || jobDescription.trim().length < 50}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {jobMatchState.status === 'running' ? <PortalInlineSpinner size={16} /> : <Sparkles size={16} aria-hidden />}
          {jobMatchState.status === 'running' ? 'Scoring…' : jobMatchState.output ? 'Re-run' : 'Score match'}
        </button>
        {jobMatchState.error && <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{jobMatchState.error}</p>}
        {jobMatchState.output && <OutputPanel label="Job match analysis" body={jobMatchState.output} savedTo={memberFullName} />}
      </SectionCard>

      {/* Card 8: LinkedIn headline */}
      <SectionCard id="session-card-headline" title="LinkedIn Headline" Icon={PenLine} accent={LINKEDIN_BRAND_BLUE}
        isOpen={openCards.has('headline')} onToggle={() => toggleCard('headline')}
        statusBadge={headlineState.status === 'running' ? 'Running' : headlineState.output ? 'Done' : headlineState.error ? 'Failed' : 'Ready'}
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          Generate 3–5 LinkedIn headline options under 120 characters. Uses target role from step 2.
        </p>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-headline-skills">Key skills <span style={{ color: 'var(--color-accent)' }}>*</span></label>
          <input id="session-headline-skills" type="text" value={keySkills} onChange={(e) => setKeySkills(e.target.value)}
            placeholder="e.g. Sales, CRM, Salesforce, B2B SaaS" disabled={headlineState.status === 'running'} />
        </div>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-headline-exp">Years of experience (optional)</label>
          <input id="session-headline-exp" type="text" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)}
            placeholder="e.g. 6+ years" disabled={headlineState.status === 'running'} />
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={runHeadline}
          disabled={headlineState.status === 'running' || !jobTarget.trim() || keySkills.trim().length < 2}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {headlineState.status === 'running' ? <PortalInlineSpinner size={16} /> : <Sparkles size={16} aria-hidden />}
          {headlineState.status === 'running' ? 'Generating…' : headlineState.output ? 'Re-run' : 'Generate headlines'}
        </button>
        {headlineState.error && <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{headlineState.error}</p>}
        {headlineState.output && <OutputPanel label="LinkedIn headline options" body={headlineState.output} savedTo={memberFullName} />}
      </SectionCard>

      {/* Card 9: LinkedIn About */}
      <SectionCard id="session-card-about" title="LinkedIn About" Icon={PenLine} accent={LINKEDIN_BRAND_BLUE}
        isOpen={openCards.has('about')} onToggle={() => toggleCard('about')}
        statusBadge={aboutState.status === 'running' ? 'Running' : aboutState.output ? 'Done' : aboutState.error ? 'Failed' : 'Ready'}
        contextNote="Resume auto-loaded as context if on file."
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          Write a polished 3-paragraph LinkedIn About section. Add highlights below or leave blank to use the resume.
        </p>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-about-bullets">Key highlights (optional)</label>
          <textarea id="session-about-bullets" value={linkedinBullets} onChange={(e) => setLinkedinBullets(e.target.value)}
            rows={4} placeholder="List achievements, skills, and what they're looking for — or leave blank to use the resume above."
            disabled={aboutState.status === 'running'} />
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={runAbout}
          disabled={aboutState.status === 'running' || !jobTarget.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {aboutState.status === 'running' ? <PortalInlineSpinner size={16} /> : <Sparkles size={16} aria-hidden />}
          {aboutState.status === 'running' ? 'Generating…' : aboutState.output ? 'Re-run' : 'Write About section'}
        </button>
        {aboutState.error && <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{aboutState.error}</p>}
        {aboutState.output && <OutputPanel label="LinkedIn About section" body={aboutState.output} savedTo={memberFullName} />}
      </SectionCard>

      {/* Card 10: Salary negotiation */}
      <SectionCard id="session-card-salary" title="Salary Negotiation" Icon={MessagesSquare} accent="var(--wa-gold-dark)"
        isOpen={openCards.has('salary')} onToggle={() => toggleCard('salary')}
        statusBadge={salaryState.status === 'running' ? 'Running' : salaryState.output ? 'Done' : salaryState.error ? 'Failed' : 'Ready'}
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          Generate a word-for-word negotiation script — phone or email format.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="session-sal-offer">Current offer ($) <span style={{ color: 'var(--color-accent)' }}>*</span></label>
            <input id="session-sal-offer" type="number" value={currentOffer} onChange={(e) => setCurrentOffer(e.target.value)}
              placeholder="65000" disabled={salaryState.status === 'running'} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="session-sal-target">Target salary ($) <span style={{ color: 'var(--color-accent)' }}>*</span></label>
            <input id="session-sal-target" type="number" value={targetSalary} onChange={(e) => setTargetSalary(e.target.value)}
              placeholder="75000" disabled={salaryState.status === 'running'} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-sal-method">Delivery method</label>
          <select id="session-sal-method" value={salaryDelivery} onChange={(e) => setSalaryDelivery(e.target.value as 'phone' | 'email')}
            disabled={salaryState.status === 'running'}>
            <option value="email">Email script</option>
            <option value="phone">Phone call script</option>
          </select>
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={runSalary}
          disabled={salaryState.status === 'running' || !currentOffer || !targetSalary || !jobTarget.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {salaryState.status === 'running' ? <PortalInlineSpinner size={16} /> : <Sparkles size={16} aria-hidden />}
          {salaryState.status === 'running' ? 'Generating…' : salaryState.output ? 'Re-run' : 'Build script'}
        </button>
        {salaryState.error && <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{salaryState.error}</p>}
        {salaryState.output && <OutputPanel label="Negotiation script" body={salaryState.output} savedTo={memberFullName} />}
      </SectionCard>

      {/* Card 11: Elevator pitch */}
      <SectionCard id="session-card-pitch" title="Elevator Pitch" Icon={Sparkles} accent="var(--wa-gold)"
        isOpen={openCards.has('pitch')} onToggle={() => toggleCard('pitch')}
        statusBadge={pitchState.status === 'running' ? 'Running' : pitchState.output ? 'Done' : pitchState.error ? 'Failed' : 'Ready'}
      >
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          Generate a 10–20 second elevator pitch. Uses name and target role already on file. Emails the pitch to {memberFullName.split(' ')[0]}.
        </p>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session-pitch-strengths">Key strengths (optional)</label>
          <input id="session-pitch-strengths" type="text" value={pitchStrengths} onChange={(e) => setPitchStrengths(e.target.value)}
            placeholder="e.g. relationship building, closing deals, CRM expertise" disabled={pitchState.status === 'running'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="session-pitch-certs">Certifications (optional)</label>
            <input id="session-pitch-certs" type="text" value={pitchCertifications} onChange={(e) => setPitchCertifications(e.target.value)}
              placeholder="e.g. CompTIA A+, PMP" disabled={pitchState.status === 'running'} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="session-pitch-industry">Target industry (optional)</label>
            <input id="session-pitch-industry" type="text" value={pitchIndustry} onChange={(e) => setPitchIndustry(e.target.value)}
              placeholder="e.g. Healthcare IT" disabled={pitchState.status === 'running'} />
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={runPitch}
          disabled={pitchState.status === 'running' || !jobTarget.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {pitchState.status === 'running' ? <PortalInlineSpinner size={16} /> : <Sparkles size={16} aria-hidden />}
          {pitchState.status === 'running' ? 'Generating…' : pitchState.output ? 'Re-run' : 'Build pitch'}
        </button>
        {pitchState.error && <p role="alert" style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{pitchState.error}</p>}
        {pitchState.output && <OutputPanel label="Elevator pitch" body={pitchState.output} savedTo={memberFullName} />}
      </SectionCard>

      {/* End session footer */}
      <div className="portal-card portal-card--flat" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: completedTools.length > 0 ? '1rem' : 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem', color: 'var(--color-on-surface)' }}>
              {packetSent ? `Packet emailed to ${memberEmail}` : 'End session & email packet'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
              {packetSent
                ? `${completedTools.length} tool result${completedTools.length === 1 ? '' : 's'} delivered to ${memberFullName.split(' ')[0]}'s inbox and portal history.`
                : completedTools.length > 0
                  ? `${completedTools.length} tool${completedTools.length === 1 ? '' : 's'} completed — email everything to ${memberFullName.split(' ')[0]} now, or keep going.`
                  : `Run at least one tool above, then send ${memberFullName.split(' ')[0]} everything in one email.`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={endSession}
            disabled={endingSession || !hasAnyOutput || packetSent}
            title={!hasAnyOutput ? 'Run at least one tool before ending the session' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}
          >
            {endingSession ? <PortalInlineSpinner size={18} /> : <Sparkles size={18} aria-hidden />}
            {packetSent ? 'Packet sent' : endingSession ? 'Sending…' : 'End session & email recap'}
          </button>
        </div>

        {/* Live recap — shows what's in the email */}
        {completedTools.length > 0 && (
          <div style={{ borderTop: '1px solid var(--surface-container-highest)', paddingTop: '0.875rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant)' }}>
              {packetSent ? 'Included in recap' : `In this recap (${completedTools.length} item${completedTools.length === 1 ? '' : 's'})`}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {completedTools.map(t => (
                <span key={t.key} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.25rem 0.625rem', borderRadius: '999px', fontSize: '0.8125rem', fontWeight: 600,
                  background: `color-mix(in srgb, ${t.accent} 10%, transparent)`,
                  color: t.accent,
                  border: `1px solid color-mix(in srgb, ${t.accent} 25%, transparent)`}}>
                  <CheckCircle2 size={11} aria-hidden /> {t.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {packetError ? (
        <p role="alert" style={{ color: 'var(--color-accent)' }}>{packetError}</p>
      ) : null}

      {packetSent ? (
        <button
          type="button"
          className="btn btn-muted"
          onClick={() => router.push(backToSessionsHref)}
          style={{ alignSelf: 'flex-start' }}
        >
          Back to sessions
        </button>
      ) : null}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function SectionCard({
  id,
  step,
  title,
  Icon,
  accent,
  statusBadge,
  headerAction,
  contextNote,
  isOpen = true,
  onToggle,
  children}: {
  id?: string;
  step?: number;
  title: string;
  Icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  accent: string;
  statusBadge: string;
  headerAction?: React.ReactNode;
  contextNote?: string | null;
  isOpen?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const isDone = statusBadge === 'Done' || statusBadge === 'Recorded';
  return (
    <section id={id} className="portal-card portal-card--flat" style={{ padding: isOpen ? '1.25rem 1.5rem' : '0.75rem 1.5rem' }}>
      <header
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: isOpen ? (contextNote ? '0.5rem' : '1rem') : 0,
          flexWrap: 'wrap',
          cursor: onToggle ? 'pointer' : undefined,
          userSelect: 'none'}}
      >
        <span
          aria-hidden
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
            width: '2.25rem', height: '2.25rem', borderRadius: '999px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '0.95rem', flexShrink: 0}}
        >
          {isDone ? <CheckCircle2 size={16} aria-hidden /> : step !== undefined ? step : <Icon size={16} aria-hidden />}
        </span>
        <Icon size={20} aria-hidden />
        <h2 style={{ flex: 1, margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
          {title}
        </h2>
        <span style={{
          fontSize: '0.8125rem', fontWeight: 600, padding: '0.25rem 0.5rem',
          borderRadius: '999px',
          background: isDone ? 'var(--wa-success-soft)' : 'var(--surface-container)',
          color: isDone ? 'var(--wa-success-dark)' : 'var(--color-on-surface-variant)',
          textTransform: 'uppercase', letterSpacing: '0.04em'}}>
          {statusBadge}
        </span>
        {headerAction ? <div onClick={e => e.stopPropagation()}>{headerAction}</div> : null}
        {onToggle && (
          <span aria-hidden style={{ color: 'var(--color-on-surface-variant)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4"/></svg>
          </span>
        )}
      </header>
      {isOpen && contextNote ? (
        <p style={{ margin: '0 0 1rem', padding: '0.4rem 0.65rem', background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)', borderLeft: '3px solid var(--color-accent)', borderRadius: '0.35rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {contextNote}
        </p>
      ) : null}
      {isOpen ? children : null}
    </section>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--color-on-surface-variant)', margin: 0 }}>
        {label}
      </dt>
      <dd style={{ margin: '0.15rem 0 0', fontSize: '0.95rem', color: 'var(--color-on-surface)' }}>{value || '—'}</dd>
    </div>
  );
}

function OutputPanel({ label, body, savedTo }: { label: string; body: string; savedTo: string }) {
  return (
    <div style={{ marginTop: '1rem', background: 'var(--surface-container-low)', borderRadius: '0.75rem', padding: '1rem 1.25rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>
          {label}
        </strong>
        <span style={{ fontSize: '0.8125rem', color: 'var(--wa-success-dark)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <CheckCircle2 size={14} aria-hidden /> Saved to {savedTo.split(' ')[0]}
        </span>
      </header>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.55, margin: 0, color: 'var(--color-on-surface)' }}>
        {body}
      </pre>
    </div>
  );
}

function InterviewOutput({ body, savedTo }: { body: string; savedTo: string }) {
  let questions: Array<{ question: string; type?: string; tip?: string; exampleAnswer?: string; starHint?: string }> = [];
  try {
    questions = JSON.parse(body);
  } catch {
    return <OutputPanel label="Interview questions" body={body} savedTo={savedTo} />;
  }
  return (
    <div style={{ marginTop: '1rem', background: 'var(--surface-container-low)', borderRadius: '0.75rem', padding: '1rem 1.25rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>
          {questions.length} interview questions
        </strong>
        <span style={{ fontSize: '0.8125rem', color: 'var(--wa-success-dark)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <CheckCircle2 size={14} aria-hidden /> Saved to {savedTo.split(' ')[0]}
        </span>
      </header>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {questions.map((q, i) => (
          <li key={i}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-on-surface)' }}>{q.question}</p>
            {q.tip ? <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}><em>Tip:</em> {q.tip}</p> : null}
            {q.exampleAnswer ? <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}><em>Sample answer:</em> {q.exampleAnswer}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function LinkedInHeadlinesOutput({ body, savedTo }: { body: string; savedTo: string }) {
  let headlines: string[] = [];
  try {
    headlines = JSON.parse(body);
  } catch {
    return <OutputPanel label="LinkedIn Headlines" body={body} savedTo={savedTo} />;
  }
  if (!Array.isArray(headlines)) {
    return <OutputPanel label="LinkedIn Headlines" body={body} savedTo={savedTo} />;
  }
  return (
    <div style={{ marginTop: '1rem', background: 'var(--surface-container-low)', borderRadius: '0.75rem', padding: '1rem 1.25rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>
          LinkedIn Headlines
        </strong>
        <span style={{ fontSize: '0.8125rem', color: 'var(--wa-success-dark)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <CheckCircle2 size={14} aria-hidden /> Saved to {savedTo.split(' ')[0]}
        </span>
      </header>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {headlines.map((h, i) => (
          <li key={i} style={{ color: 'var(--color-on-surface)' }}>
            {h}
          </li>
        ))}
      </ol>
    </div>
  );
}

