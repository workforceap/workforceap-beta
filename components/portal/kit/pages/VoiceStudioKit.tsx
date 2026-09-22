'use client';

/**
 * VoiceStudioKit — Voice AI + AI Career Tools hub (HIGHEST-PRIORITY page).
 *
 * Faithful port of docs/mockups/workforceap-voice-studio.html onto the portal
 * design kit (warm surface + tokens + wa-kit-* + wa- utilities + lucide icons),
 * with shared primitives from @astryxdesign/core (SegmentedControl, Card,
 * Button, Token, StatusDot) for tabs, badges, and actions.
 *
 * Four tabs, switched in local state:
 *   coaches  → Voice Coaches hub        (default)
 *   session  → Live Voice Session       (dark panel, animated mic orb)
 *   studio   → Resume Studio · Beta     (Career Studio: score + issues + rewrite)
 *   toolkit  → AI Career Toolkit        (3-stage path + scannable directory rows)
 *
 * The "Mock Interview" coach card and the Live Session tab button both switch to
 * the `session` tab. Page chrome is PageOpener + SegmentedControl on the shared
 * `--wa-bg-wave` wash (same as other member kits). Live-session panels stay dark
 * on purpose (`--wa-sidebar-*` / session tokens — not a second app header).
 *
 * Animations (orb pulse, expanding rings, equalizer) are gated behind
 * prefers-reduced-motion: reduce. Focus rings use wa-kit-focus where on light
 * backgrounds; dark panels use a self-contained dark focus ring class.
 *
 * Spec: docs/PORTING_GUIDE.md
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { HStack } from '@astryxdesign/core/Layout';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  Mic,
  MicOff,
  AudioLines,
  Sparkles,
  Target,
  Headphones,
  Headset,
  Briefcase,
  Zap,
  FileText,
  MailOpen,
  CheckCircle2,
  Search,
  Network,
  Route,
  Linkedin,
  UserPen,
  MessagesSquare,
  Scale,
  Clock,
  PhoneOff,
  Captions,
  ArrowRight,
  Upload,
  Play,
  FlaskConical,
  AlertTriangle,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { Conversation } from '@elevenlabs/client';
import { DesignSurface } from '../DesignSurface';
import { PageOpener } from '../PageOpener';
import { KitEmptyState } from '../KitEmptyState';
import { StatusTag } from '../StatusTag';
import { VoiceOrb } from '../VoiceOrb';

type StudioTab = 'coaches' | 'session' | 'studio' | 'toolkit';
export type VoiceStudioAgentKey = 'readiness' | 'resume' | 'mock' | 'counselor' | 'business';
export const VOICE_STUDIO_AGENT_KEYS: VoiceStudioAgentKey[] = ['readiness', 'resume', 'mock', 'counselor', 'business'];

/**
 * Config for a voice agent that the Live Session tab can run. Each voice coach
 * card picks one of these and switches to the session tab, so every agent uses
 * the same live-session experience instead of navigating to a separate page.
 */
export type SessionAgentConfig = {
  label: string;
  /** POST endpoint that mints the ElevenLabs signed URL. */
  endpoint: string;
  /** JSON body for the endpoint (e.g. interview role/type). */
  payload?: Record<string, unknown>;
  accent: string;
  accentDark: string;
  /** Solid button fill that pairs with `--wa-on-hero` in both themes (see AGENT_ACCENT). */
  solid: string;
  /**
   * When true, the idle state asks the member for a target role + interview
   * type before starting (used by Mock Interview), and merges them into the
   * POST payload as `{ role, interviewType }`.
   */
  askRole?: boolean;
  /** Provider and member-context disclosure shown before the session starts. */
  dataUseNotice?: string;
};

const LILLEY_DATA_USE_NOTICE =
  'ElevenLabs processes your microphone audio and live transcript during this session. WorkforceAP may share only the saved next-step, program, and progress facts needed for Lilley through approved read-only tools. This AI Career Tools session does not save the transcript to your WorkforceAP AI history or coach memory.';

/**
 * `solid` is the fill behind `--wa-on-hero` white text on the session panel's
 * Start / End buttons: a mode-constant hero hue (guide §1) so the label clears
 * 4.5:1 in both themes. White on the base `--wa-gold` measured 3.7:1 and on
 * the dark-mode `--wa-accent` / `--wa-info` 3.3:1 / 2.2:1.
 */
const AGENT_ACCENT = {
  crimson: { accent: 'var(--wa-accent)', accentDark: 'var(--wa-accent-dark)', solid: 'var(--wa-hero-crimson)' },
  gold: { accent: 'var(--wa-gold)', accentDark: 'var(--wa-gold-dark)', solid: 'var(--wa-hero-gold)' },
  blue: { accent: 'var(--wa-info)', accentDark: 'color-mix(in srgb, var(--wa-info) 75%, black)', solid: 'color-mix(in srgb, var(--wa-info) 70%, black)' },
} as const;

const SESSION_AGENTS: Record<VoiceStudioAgentKey, SessionAgentConfig> = {
  readiness: { label: 'Readiness Coach', endpoint: '/api/member/readiness/voice-session', ...AGENT_ACCENT.gold },
  resume: { label: 'Resume Coach', endpoint: '/api/member/resume-coach/session', ...AGENT_ACCENT.crimson },
  mock: {
    label: 'Mock Interview',
    endpoint: '/api/interview/session',
    payload: { interviewType: 'behavioral' },
    askRole: true,
    ...AGENT_ACCENT.crimson,
  },
  counselor: {
    label: 'Lilley Career Coach',
    endpoint: '/api/counselor/session',
    dataUseNotice: LILLEY_DATA_USE_NOTICE,
    ...AGENT_ACCENT.blue,
  },
  business: {
    label: 'Career & Business Coach',
    endpoint: '/api/member/career-business-coach/voice-session',
    dataUseNotice: LILLEY_DATA_USE_NOTICE,
    ...AGENT_ACCENT.crimson,
  },
};

/**
 * Real routes each card opens. Most live under /dashboard/ai-tools/*; the
 * counselor has its own top-level route. Keyed by a stable string so card data
 * can reference a route without repeating the literal path.
 */
const TOOL_HREF = {
  'readiness-coach': '/dashboard/ai-tools/readiness-coach',
  'resume-coach': '/dashboard/ai-tools/resume-coach',
  counselor: '/dashboard/counselor',
  'career-business-coach': '/dashboard/ai-tools/career-business-coach',
  'elevator-pitch': '/dashboard/ai-tools/elevator-pitch',
  'resume-studio': '/dashboard/ai-tools/resume-studio',
  'resume-rewriter': '/dashboard/ai-tools/resume-rewriter',
  'cover-letter': '/dashboard/ai-tools/cover-letter',
  'skill-checkpoints': '/dashboard/ai-tools/skill-checkpoints',
  'interview-practice': '/dashboard/ai-tools/interview-practice',
  'interview-coach': '/dashboard/ai-tools/interview-coach',
  'job-match-scorer': '/dashboard/ai-tools/job-match-scorer',
  'skill-mapper': '/dashboard/ai-tools/skill-mapper',
  'training-bridge': '/dashboard/ai-tools/training-bridge',
  'linkedin-headline': '/dashboard/ai-tools/linkedin-headline',
  'linkedin-about': '/dashboard/ai-tools/linkedin-about',
  'gap-analyzer': '/dashboard/ai-tools/gap-analyzer',
  'salary-negotiation': '/dashboard/ai-tools/salary-negotiation',
  'benefits-cliff': '/dashboard/ai-tools/benefits-cliff',
} as const;

const TABS: Array<{ id: StudioTab; label: string }> = [
  { id: 'coaches', label: 'Coaches' },
  { id: 'session', label: 'Practice' },
  { id: 'studio', label: 'Resume' },
  { id: 'toolkit', label: 'All Tools' },
];

/** Real, instant structural-read data for the Resume Studio tab. */
export type ResumeStudioIssue = { title: string; detail: string };
export type ResumeStudioData = {
  /** Whether the member has a resume on file. */
  hasResume: boolean;
  /** Deterministic structural score 0–100 (instant; not the full AI composite). */
  structuralScore?: number;
  /** Real issues derived from the weakest structural dimensions. */
  issues?: ResumeStudioIssue[];
};

export interface VoiceStudioKitProps {
  /** Which tab to show first. */
  initialTab?: StudioTab;
  /**
   * Real resume data for the Resume Studio tab, computed server-side from the
   * member's actual resume (deterministic structural read — no fabricated data).
   */
  resumeStudio?: ResumeStudioData;
  /**
   * POST endpoint the Live Session tab calls to mint an ElevenLabs signed URL.
   * Defaults to the mock-interview agent endpoint.
   */
  sessionEndpoint?: string;
  /** JSON body posted to `sessionEndpoint` (e.g. interview role + type). */
  sessionPayload?: Record<string, unknown>;
  /** Which voice coach to preselect when deep-linking to the Live tab. */
  initialAgent?: VoiceStudioAgentKey;
}

export function VoiceStudioKit({
  initialTab = 'coaches',
  resumeStudio = { hasResume: false },
  sessionEndpoint = '/api/interview/session',
  sessionPayload = { role: 'a general professional role', interviewType: 'behavioral' },
  initialAgent,
}: VoiceStudioKitProps) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectTab = useCallback(
    (nextTab: StudioTab) => {
      setTab(nextTab);
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      if (nextTab === 'coaches') next.delete('tab');
      else next.set('tab', nextTab);
      if (nextTab !== 'session') next.delete('agent');
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const fallbackAgent: SessionAgentConfig = {
    label: 'Mock Interview',
    endpoint: sessionEndpoint,
    payload: sessionPayload,
    askRole: true,
    ...AGENT_ACCENT.crimson,
  };
  const [agent, setAgent] = useState<SessionAgentConfig>(
    initialAgent ? SESSION_AGENTS[initialAgent] : fallbackAgent,
  );

  const pickAgent = (next: SessionAgentConfig) => {
    setAgent(next);
    selectTab('session');
  };

  return (
    <DesignSurface surface="warm">
      <style>{ORB_CSS}</style>

      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--wa-text)',
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'var(--wa-pad-sm)',
          boxSizing: 'border-box',
        }}
        className="wa-space-y-6"
      >
        <PageOpener
          kicker="Tools & careers"
          title="AI Career Tools"
          lede="Voice coaches and the AI toolkit."
          icon={<AudioLines size={13} aria-hidden="true" />}
        />
        <div className="wa-page-tabs">
          <SegmentedControl
            value={tab}
            onChange={(v) => selectTab(v as StudioTab)}
            label="Voice studio sections"
            size="sm"
            layout="hug"
          >
            {TABS.map((t) => (
              <SegmentedControlItem key={t.id} value={t.id} label={t.label} />
            ))}
          </SegmentedControl>
        </div>
        <div
          role="region"
          id={`vs-panel-${tab}`}
          aria-label={TABS.find((section) => section.id === tab)?.label}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {tab === 'coaches' && <CoachesPanel onPick={pickAgent} />}
          {tab === 'session' && <SessionPanel agent={agent} />}
          {tab === 'studio' && <StudioPanel data={resumeStudio} />}
          {tab === 'toolkit' && <ToolkitPanel />}
        </div>
      </div>
    </DesignSurface>
  );
}

/* ============================================================ */
/* VIEW: VOICE COACHES HUB                                       */
/* ============================================================ */

interface CoachCard {
  key: string;
  variant: 'gold' | 'crimson' | 'crimson-deep' | 'counselor' | 'dark' | 'gold-light';
  Icon: LucideIcon;
  badge: string;
  title: string;
  body: string;
  ctaIcon: LucideIcon;
  cta: string;
  /** Real route this card opens (non-voice cards, e.g. the elevator builder). */
  href?: string;
  /** Voice agent this card runs — clicking opens the in-page Live Session tab. */
  agent?: SessionAgentConfig;
}

const COACH_CARDS: CoachCard[] = [
  {
    key: 'readiness',
    variant: 'gold',
    Icon: Target,
    badge: 'READINESS',
    title: 'Readiness Coach',
    body: 'Stuck on what to do next? Talk through resume, training, applications, or interviews and leave with one clear next step.',
    ctaIcon: Mic,
    cta: 'Start session',
    agent: SESSION_AGENTS.readiness,
  },
  {
    key: 'resume',
    variant: 'crimson',
    Icon: Sparkles,
    badge: 'RESUME',
    title: 'Resume Coach',
    body: 'Reads your uploaded resume or the draft you are editing, then coaches you line by line on bullets, framing, and gaps.',
    ctaIcon: Mic,
    cta: 'Start session',
    agent: SESSION_AGENTS.resume,
  },
  {
    key: 'mock',
    variant: 'crimson-deep',
    Icon: AudioLines,
    badge: 'PRACTICE',
    title: 'Mock Interview',
    body: 'A realistic interviewer for the role you name: answer out loud, then review your transcript and feedback.',
    ctaIcon: Play,
    cta: 'Start practice',
    agent: SESSION_AGENTS.mock,
  },
  {
    key: 'counselor',
    variant: 'counselor',
    Icon: Headphones,
    badge: 'LILLEY',
    title: 'Lilley Career Coach',
    body: 'Knows your WorkforceAP plan, training status, and Coursera progress. Ends with a saved three-step action plan.',
    ctaIcon: Mic,
    cta: 'Start session',
    agent: SESSION_AGENTS.counselor,
  },
  {
    key: 'business',
    variant: 'crimson',
    Icon: Briefcase,
    badge: 'ADVANCED',
    title: 'Career & Business Coach',
    body: 'Lilley in a wider lane: project management, sales, marketing, communication, and business questions beyond your program.',
    ctaIcon: Mic,
    cta: 'Start session',
    agent: SESSION_AGENTS.business,
  },
  {
    key: 'elevator',
    variant: 'gold-light',
    Icon: Zap,
    badge: '10–20 SEC',
    title: 'Elevator Introduction',
    body: 'Not a voice coach: writes a 10–20 second intro from your profile, saves it, then lets you rehearse it on camera.',
    ctaIcon: ArrowRight,
    cta: 'Build intro',
    href: TOOL_HREF['elevator-pitch'],
  },
];

function CoachesPanel({ onPick }: { onPick: (agent: SessionAgentConfig) => void }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="wa-flex wa-items-center wa-justify-between wa-flex-wrap" style={{ gap: 12 }}>
        <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: 0, maxWidth: '42rem' }}>
          Real-time spoken coaching. Your program context is included automatically.
        </p>
        <HStack
          gap={2}
          align="center"
          style={{
            padding: '6px 12px',
            background: 'var(--wa-surface)',
            border: '1px solid var(--wa-border)',
            borderRadius: 999,
          }}
        >
          <StatusDot variant="success" label="Live voice session available" isPulsing />
          <Token label="Live voice · ~5 min" size="sm" color="green" />
        </HStack>
      </div>

      <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-5">
        {COACH_CARDS.map((c) => (
          <CoachCardView key={c.key} card={c} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

/**
 * Card shadows tint the card's own hue, never an rgba() literal, so they
 * follow light-dark() (and the org accent where the fill is the accent):
 * `--wa-accent` under the crimson / accent gradients, `--wa-gold` under the
 * gold gradient, the panel chrome under the dark card and the kit's surface
 * shadow token under the light-body cards (#2491 follow-up).
 */
const ACCENT_CARD_SHADOW = '0 10px 15px -3px color-mix(in srgb, var(--wa-accent) 15%, transparent)';
const GOLD_CARD_SHADOW = '0 10px 15px -3px color-mix(in srgb, var(--wa-gold) 15%, transparent)';
const DARK_CARD_SHADOW = '0 10px 15px -3px color-mix(in srgb, var(--wa-sidebar-bg) 20%, transparent)';

function CoachCardView({ card, onPick }: { card: CoachCard; onPick: (agent: SessionAgentConfig) => void }) {
  const { variant, Icon, badge, title, body, ctaIcon: Cta, cta } = card;

  // Per-variant styling roles, pulled from the mockup.
  const isLightBody = variant === 'counselor' || variant === 'gold-light';
  let cardStyle: React.CSSProperties;
  let iconChip: React.CSSProperties;
  let bodyColor: string;
  let ctaColor: string | undefined;

  switch (variant) {
    case 'gold':
      cardStyle = { background: 'linear-gradient(to bottom right, var(--wa-hero-gold), var(--wa-hero-gold-dark))', color: 'var(--wa-on-hero)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: GOLD_CARD_SHADOW };
      iconChip = { background: 'rgba(255,255,255,0.22)' };
      bodyColor = 'rgba(255,255,255,0.92)';
      ctaColor = undefined;
      break;
    case 'crimson':
      cardStyle = { background: 'linear-gradient(to bottom right, var(--wa-hero-crimson), var(--wa-hero-crimson-dark))', color: 'var(--wa-on-hero)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: ACCENT_CARD_SHADOW };
      iconChip = { background: 'rgba(255,255,255,0.22)' };
      bodyColor = 'rgba(255,255,255,0.92)';
      break;
    case 'crimson-deep':
      cardStyle = { background: 'linear-gradient(to bottom right, var(--wa-hero-crimson-dark), color-mix(in srgb, var(--wa-hero-crimson-dark) 70%, black))', color: 'var(--wa-on-hero)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: ACCENT_CARD_SHADOW };
      iconChip = { background: 'rgba(255,255,255,0.22)' };
      bodyColor = 'rgba(255,255,255,0.92)';
      break;
    case 'counselor':
      cardStyle = { background: 'var(--wa-surface)', border: '1px solid var(--wa-border)', color: 'var(--wa-text)', boxShadow: 'var(--wa-shadow)' };
      iconChip = { background: 'var(--wa-info-soft)', color: 'var(--wa-info)', border: '1px solid var(--wa-border)' };
      bodyColor = 'var(--wa-muted)';
      ctaColor = 'var(--wa-info)';
      break;
    case 'dark':
      cardStyle = { background: 'var(--wa-sidebar-bg)', color: 'var(--wa-sidebar-text)', border: '1px solid var(--wa-sidebar-border)', boxShadow: DARK_CARD_SHADOW };
      iconChip = { background: 'var(--wa-accent)' };
      bodyColor = 'rgba(255,255,255,0.9)';
      break;
    case 'gold-light':
    default:
      // Use theme tokens only (no hardcoded cream) so the card flips in dark
      // mode — the previous hardcoded cream + flipping text tokens made
      // this card unreadable in dark. CTA uses --wa-text for guaranteed AA;
      // the gold identity carries through the icon chip + badge.
      cardStyle = { background: 'var(--wa-gold-soft)', border: '1px solid var(--wa-border)', color: 'var(--wa-text)', boxShadow: 'var(--wa-shadow)' };
      iconChip = { background: 'var(--wa-gold-soft)', color: 'var(--wa-gold-dark)', border: '1px solid var(--wa-border)' };
      bodyColor = 'var(--wa-text)';
      ctaColor = 'var(--wa-text)';
      break;
  }

  const sharedStyle: React.CSSProperties = {
    textAlign: 'left',
    borderRadius: 24,
    padding: 'clamp(20px, 5vw, 28px)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer',
    minHeight: 210,
    border: 'none',
    ...cardStyle,
  };

  const inner = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ padding: 12, borderRadius: 16, display: 'inline-flex', ...iconChip }}>
          <Icon size={20} aria-hidden="true" />
        </div>
        {isLightBody ? (
          <Token label={badge} size="sm" color="gray" />
        ) : (
          <span className="wa-voice-coach-badge--on-color">{badge}</span>
        )}
      </div>
      <div>
        <h2 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>{title}</h2>
        <p style={{ fontSize: 'var(--wa-type-body)', color: bodyColor, marginTop: 6, lineHeight: 1.5 }}>{body}</p>
        <div
          style={{
            marginTop: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--wa-type-meta)',
            fontWeight: 700,
            color: ctaColor ?? (isLightBody ? 'var(--wa-text)' : 'var(--wa-on-accent)'),
          }}
        >
          <Cta size={13} aria-hidden="true" />
          {cta}
        </div>
      </div>
    </>
  );

  // Voice coaches open the in-page Live Session tab with their own agent;
  // non-voice cards (the elevator builder) still navigate via a real route.
  if (card.agent) {
    const agent = card.agent;
    return (
      <button type="button" onClick={() => onPick(agent)} className="wa-kit-focus vs-hero-card" style={sharedStyle}>
        {inner}
      </button>
    );
  }
  if (card.href) {
    return (
      <Link href={card.href} className="wa-kit-focus vs-hero-card" style={{ ...sharedStyle, textDecoration: 'none' }}>
        {inner}
      </Link>
    );
  }
  return (
    <div className="wa-kit-focus vs-hero-card" style={sharedStyle}>
      {inner}
    </div>
  );
}

/* ============================================================ */
/* VIEW: LIVE VOICE SESSION                                      */
/* ============================================================ */

type SessionPhase = 'idle' | 'connecting' | 'active' | 'ended';
type TranscriptLine = { speaker: 'agent' | 'user'; text: string };

/** Always-dark session stage — tint from `--wa-sidebar-*`, never raw white. */
/* Live-session chrome is --wa-sidebar-bg (dark in both themes). White at 40%
   over it measures ~3.8:1, so SESSION_FAINT is reserved for non-text (the idle
   status dot, dividers). Text on the chrome uses SESSION_MUTED or stronger:
   60% white over #161616 is ~7:1 (WAP-100). */
const SESSION_FAINT = 'color-mix(in srgb, var(--wa-sidebar-text) 40%, transparent)';
const SESSION_SOFT = 'color-mix(in srgb, var(--wa-sidebar-text) 50%, transparent)';
const SESSION_MUTED = 'color-mix(in srgb, var(--wa-sidebar-text) 60%, transparent)';
const SESSION_INK = 'color-mix(in srgb, var(--wa-sidebar-text) 90%, transparent)';
const SESSION_CHIP = 'color-mix(in srgb, var(--wa-sidebar-text) 10%, transparent)';
const SESSION_CHIP_STRONG = 'color-mix(in srgb, var(--wa-sidebar-text) 12%, transparent)';
/** Agent accent as a text/icon foreground on the dark session chrome. The
 *  light-mode accents (#ad2c4d crimson 2.8:1, #a47f38 gold 4.9:1 on #161616)
 *  are fills, not foregrounds, there; lifting them 40% toward the chrome text
 *  colour keeps the agent identity and clears 4.5:1 in both themes (WAP-100). */
const sessionAccentText = (accent: string) => `color-mix(in srgb, ${accent} 60%, var(--wa-sidebar-text))`;

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Live Voice Session — a REAL ElevenLabs conversation (mints a signed URL from
 * `agent.endpoint`, then runs `Conversation.startSession`). Every voice coach
 * routes through this one panel, so the experience is identical across agents;
 * the audio-reactive orb, timer, transcript, mute and end are all driven by the
 * live session, not canned content.
 */
function SessionPanel({ agent }: { agent: SessionAgentConfig }) {
  const { label, endpoint, payload, accent, accentDark, solid, askRole, dataUseNotice } = agent;
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [error, setError] = useState('');
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [role, setRole] = useState('');
  const [interviewType, setInterviewType] = useState('behavioral');

  const convRef = useRef<Conversation | null>(null);
  const intentionalRef = useRef(false);
  const phaseRef = useRef<SessionPhase>('idle');
  const startedAtRef = useRef<number | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  const userTurns = lines.filter((l) => l.speaker === 'user').length;
  const isLive = phase === 'active';

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Running clock — real elapsed time, only while the session is active.
  useEffect(() => {
    if (phase !== 'active') {
      if (phase === 'idle') setElapsed(0);
      return;
    }
    startedAtRef.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Auto-follow the transcript as new lines arrive.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // End any live session if the user leaves the tab/page.
  useEffect(() => {
    return () => {
      intentionalRef.current = true;
      convRef.current?.endSession();
    };
  }, []);

  const start = useCallback(async () => {
    setError('');
    setLines([]);
    intentionalRef.current = false;
    setPhase('connecting');

    // Mic probe first — keeps the permission prompt tied to the click.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError('Microphone access is required. Allow it in your browser and try again.');
      setPhase('idle');
      return;
    }

    let signedUrl: string;
    let dynamicVariables: Record<string, string | number | boolean> | undefined;
    try {
      const effectivePayload = askRole
        ? { ...(payload ?? {}), role: role.trim() || 'a general professional role', interviewType }
        : payload ?? {};
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(effectivePayload),
      });
      const data = (await res.json()) as {
        signedUrl?: string;
        dynamicVariables?: Record<string, string | number | boolean>;
        error?: string;
      };
      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error ?? 'Voice sessions are not available right now.');
      }
      signedUrl = data.signedUrl;
      dynamicVariables = data.dynamicVariables;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session.');
      setPhase('idle');
      return;
    }

    const callbacks = {
      onConnect: () => setPhase('active'),
      onDisconnect: (details: unknown) => {
        const intentional = intentionalRef.current;
        intentionalRef.current = false;
        setAgentSpeaking(false);
        if (!intentional && phaseRef.current === 'connecting') {
          const reason = (details as { message?: string } | undefined)?.message;
          setError(reason || 'Connection lost before the session started. Please try again.');
          setPhase('idle');
        } else {
          setPhase('ended');
        }
      },
      onMessage: (event: unknown) => {
        const ev = event as Record<string, unknown>;
        const rawText =
          typeof ev.message === 'string'
            ? ev.message
            : typeof ev.text === 'string'
              ? ev.text
              : '';
        const text = rawText.trim();
        if (!text) return;
        const isAgent = ev.role === 'agent' || ev.source === 'ai' || ev.type === 'agent_response';
        const isUser = ev.role === 'user' || ev.source === 'user' || ev.type === 'user_transcript';
        if (isAgent) {
          setAgentSpeaking(true);
          setLines((prev) => [...prev, { speaker: 'agent', text }]);
        } else if (isUser) {
          setAgentSpeaking(false);
          setLines((prev) => [...prev, { speaker: 'user', text }]);
        }
      },
      onError: (msg: unknown) => {
        setError(typeof msg === 'string' && msg ? msg : 'Connection error. Please try again.');
        setPhase('idle');
      },
    };

    try {
      const { Conversation: ConversationClient } = await import('@elevenlabs/client');
      const hasVars = Boolean(dynamicVariables && Object.keys(dynamicVariables).length > 0);
      if (hasVars) {
        try {
          convRef.current = await ConversationClient.startSession({ signedUrl, dynamicVariables, ...callbacks });
        } catch {
          throw new Error('Your personalized coach context could not be attached. Please try again.');
        }
      } else {
        convRef.current = await ConversationClient.startSession({ signedUrl, ...callbacks });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice session failed to start.');
      setPhase('idle');
    }
  }, [endpoint, payload, askRole, role, interviewType]);

  // Live audio level (0..1) for the reactive orb — max of mic + agent volume.
  const getLevel = useCallback(() => {
    const c = convRef.current;
    if (!c) return 0;
    try {
      const input = typeof c.getInputVolume === 'function' ? c.getInputVolume() : 0;
      const output = typeof c.getOutputVolume === 'function' ? c.getOutputVolume() : 0;
      return Math.max(input || 0, output || 0);
    } catch {
      return 0;
    }
  }, []);

  const end = useCallback(() => {
    intentionalRef.current = true;
    convRef.current?.endSession();
    setAgentSpeaking(false);
    setPhase('ended');
  }, []);

  const reset = useCallback(() => {
    intentionalRef.current = true;
    convRef.current?.endSession();
    convRef.current = null;
    setPhase('idle');
    setError('');
    setLines([]);
    setMuted(false);
    setAgentSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        convRef.current?.setMicMuted(next);
      } catch {
        /* ignore — mute is best-effort */
      }
      return next;
    });
  }, []);

  // Status line (top-left of the orb panel).
  const status =
    phase === 'active'
      ? `Connected · ${label}`
      : phase === 'connecting'
        ? 'Connecting…'
        : phase === 'ended'
          ? 'Session ended'
          : `Ready · ${label}`;
  const dotColor = phase === 'active' ? 'var(--wa-success)' : phase === 'connecting' ? 'var(--wa-gold)' : SESSION_FAINT;

  // Big status caption under the orb.
  const caption =
    phase === 'active'
      ? agentSpeaking
        ? `${label} is speaking…`
        : 'Listening — speak when ready'
      : phase === 'connecting'
        ? 'Connecting to your coach…'
        : phase === 'ended'
          ? 'Session ended'
          : `Start a live session with the ${label}`;
  const subCaption =
    phase === 'active'
      ? muted
        ? 'Microphone muted — tap the mic to unmute'
        : 'Answer out loud — the live transcript appears on this page'
      : phase === 'ended'
        ? 'Review the transcript below, then run another round when you are ready.'
        : phase === 'idle'
          ? 'Real-time voice coaching. Microphone required.'
          : 'Checking your microphone and connecting to your coach…';

  return (
    // flex-start (not center): centering split the leftover height into a
    // large dead band ABOVE the section title; anchoring to the top with the
    // tall clamped stage reads intentional and keeps the heading scannable.
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 16 }}>
      <div className="wa-flex wa-items-baseline wa-justify-between wa-flex-wrap" style={{ gap: 8 }}>
        <h2 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: 0 }}>Live voice · program context included</p>
      </div>

      {/* Dark "stage" — an intentional, always-dark media surface (like a call/theater
          screen) rather than a page-theme surface, framed in a themed bezel so it
          reads as deliberate in both light and dark mode instead of a stray black box. */}
      <div
        style={{
          background: 'var(--wa-surface)',
          border: '1px solid var(--wa-border)',
          borderRadius: 28,
          padding: 6,
          boxShadow: 'var(--wa-shadow-lg)',
        }}
      >
        <div style={{ background: 'var(--wa-sidebar-bg)', borderRadius: 22, overflow: 'hidden' }}>
          <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-5" style={{ minHeight: 'clamp(560px, 60vh, 720px)' }}>
          {/* Orb / status — spans 3 of 5 on lg */}
          <div
            className="lg:wa-col-span-3"
            style={{
              padding: 'clamp(20px, 5vw, 32px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--wa-sidebar-text)',
              position: 'relative',
            }}
          >
            <div style={{ position: 'absolute', top: 24, left: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--wa-type-meta)', fontWeight: 700 }}>
              <span aria-hidden="true" className={isLive ? 'vs-dot' : undefined} style={{ width: 8, height: 8, borderRadius: 999, background: dotColor }} />
              {status}
            </div>
            <div style={{ position: 'absolute', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--wa-type-meta)', color: SESSION_MUTED }}>
              <Clock size={13} aria-hidden="true" />
              {formatClock(elapsed)}
            </div>

            {/* audio-reactive orb — core scale + rings track live mic/agent volume */}
            <div style={{ margin: '20px 0' }}>
              <VoiceOrb
                getLevel={getLevel}
                active={isLive}
                muted={muted}
                connecting={phase === 'connecting'}
                accent={accent}
                accentDark={accentDark}
                size={168}
              />
            </div>

            {/* equalizer — only while the coach is actively speaking */}
            {isLive && agentSpeaking ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 32, marginBottom: 12 }}>
                {[0, 0.15, 0.3, 0.1, 0.25].map((delay, i) => (
                  <span
                    key={i}
                    className="vs-eqbar"
                    style={{ width: 4, background: accent, borderRadius: 999, animationDelay: `${delay}s` }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ height: 32, marginBottom: 12 }} aria-hidden />
            )}

            <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 600 }}>{caption}</p>
            <p style={{ fontSize: 'var(--wa-type-meta)', color: SESSION_SOFT, marginTop: 4, textAlign: 'center', maxWidth: 320 }}>{subCaption}</p>

            {error ? (
              <div
                role="alert"
                style={{
                  marginTop: 16,
                  maxWidth: 360,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  background: 'color-mix(in srgb, var(--wa-danger) 18%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--wa-danger) 45%, transparent)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 'var(--wa-type-meta)',
                  color: 'color-mix(in srgb, var(--wa-danger) 55%, var(--wa-sidebar-text))',
                  textAlign: 'left',
                }}
              >
                <AlertTriangle size={14} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            ) : null}

            {/* role picker — only for agents that ask (Mock Interview), before start */}
            {phase === 'idle' && askRole ? (
              <div style={{ width: '100%', maxWidth: 360, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: SESSION_MUTED }}>
                    Target role
                  </span>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Cloud Support Associate"
                    className="vs-focus-dark"
                    style={{
                      background: 'color-mix(in srgb, var(--wa-sidebar-bg) 82%, black)',
                      border: '1px solid var(--wa-sidebar-border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      color: 'var(--wa-sidebar-text)',
                      fontSize: 'var(--wa-type-body)',
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: SESSION_MUTED }}>
                    Interview type
                  </span>
                  <select
                    value={interviewType}
                    onChange={(e) => setInterviewType(e.target.value)}
                    className="vs-focus-dark"
                    style={{
                      background: 'color-mix(in srgb, var(--wa-sidebar-bg) 82%, black)',
                      border: '1px solid var(--wa-sidebar-border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      color: 'var(--wa-sidebar-text)',
                      fontSize: 'var(--wa-type-body)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="behavioral">Behavioral</option>
                    <option value="technical">Technical</option>
                    <option value="general">General / screening</option>
                  </select>
                </label>
                <p style={{ fontSize: 'var(--wa-type-meta)', color: SESSION_MUTED, margin: 0 }}>
                  Leave the role blank for a general practice interview.
                </p>
              </div>
            ) : null}

            {dataUseNotice && (phase === 'idle' || phase === 'ended') ? (
              <p
                role="note"
                aria-label="Voice session data use"
                style={{
                  maxWidth: 440,
                  margin: '20px 0 0',
                  color: SESSION_MUTED,
                  fontSize: 'var(--wa-type-meta)',
                  lineHeight: 1.55,
                  textAlign: 'center',
                }}
              >
                {dataUseNotice}{' '}
                <Link href="/privacy" style={{ color: 'var(--wa-sidebar-text)', textDecoration: 'underline' }}>
                  Privacy details
                </Link>
              </p>
            ) : null}

            {/* controls — real start / mute / end depending on phase */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
              {phase === 'active' ? (
                <>
                  <button
                    type="button"
                    className="vs-focus-dark vs-btn-solid"
                    aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                    aria-pressed={muted}
                    title={muted ? 'Unmute microphone' : 'Mute microphone'}
                    onClick={toggleMute}
                    style={{ ...circleBtn, background: muted ? accent : SESSION_CHIP }}
                  >
                    {muted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="vs-focus-dark vs-btn-solid"
                    onClick={end}
                    style={{
                      padding: '12px 24px',
                      borderRadius: 999,
                      background: solid,
                      color: 'var(--wa-on-hero)',
                      fontWeight: 700,
                      fontSize: 'var(--wa-type-body)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <PhoneOff size={15} aria-hidden="true" />
                    End Session
                  </button>
                </>
              ) : phase === 'connecting' ? (
                <button
                  type="button"
                  className="vs-focus-dark"
                  disabled
                  style={{
                    padding: '12px 28px',
                    borderRadius: 999,
                    background: SESSION_CHIP_STRONG,
                    color: 'var(--wa-sidebar-text)',
                    fontWeight: 700,
                    fontSize: 'var(--wa-type-body)',
                    border: 'none',
                    cursor: 'wait',
                    opacity: 0.7,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span className="vs-dot" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--wa-sidebar-text)' }} />
                  Connecting…
                </button>
              ) : (
                <button
                  type="button"
                  className="vs-focus-dark vs-btn-solid"
                  onClick={() => void start()}
                  style={{
                    padding: '12px 28px',
                    borderRadius: 999,
                    background: solid,
                    color: 'var(--wa-on-hero)',
                    fontWeight: 700,
                    fontSize: 'var(--wa-type-body)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {phase === 'ended' ? <Play size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
                  {phase === 'ended' ? 'Start again' : 'Start session'}
                </button>
              )}
            </div>
          </div>

          {/* live transcript — spans 2 of 5 on lg */}
          <div
            className="lg:wa-col-span-2"
            style={{
              background: 'color-mix(in srgb, var(--wa-sidebar-bg) 82%, black)',
              borderTop: '1px solid var(--wa-sidebar-border)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, color: 'var(--wa-sidebar-text)', fontSize: 'var(--wa-type-body)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Captions size={15} color={sessionAccentText(accent)} aria-hidden="true" />
                Live Transcript
              </h3>
              <span style={{ fontSize: 'var(--wa-type-meta)', color: SESSION_MUTED, fontWeight: 700 }}>
                {isLive ? 'LIVE' : phase === 'ended' ? 'NOT SAVED TO WAP' : 'IDLE'}
              </span>
            </div>

            <div
              ref={transcriptScrollRef}
              role="log"
              aria-live="polite"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', fontSize: 'var(--wa-type-meta)', minHeight: 0 }}
            >
              {lines.length === 0 ? (
                <p style={{ color: SESSION_MUTED, fontStyle: 'italic', margin: 0 }}>
                  {phase === 'active'
                    ? 'Waiting for speech — your conversation will appear here.'
                    : phase === 'connecting'
                      ? 'Connecting…'
                      : 'Start the session to begin a live transcript.'}
                </p>
              ) : (
                lines.map((line, i) =>
                  line.speaker === 'agent' ? (
                    <div key={`${i}-${line.text.slice(0, 16)}`}>
                      <div style={{ ...transcriptLabelCoach, color: sessionAccentText(accent) }}>Coach</div>
                      <div style={{ ...bubble, background: 'var(--wa-sidebar-bg)', color: SESSION_INK, borderTopLeftRadius: 4 }}>
                        {line.text}
                      </div>
                    </div>
                  ) : (
                    <div key={`${i}-${line.text.slice(0, 16)}`} style={{ textAlign: 'right' }}>
                      <div style={transcriptLabelYou}>You</div>
                      <div
                        style={{
                          ...bubble,
                          background: solid,
                          color: 'var(--wa-on-hero)',
                          borderTopRightRadius: 4,
                          display: 'inline-block',
                          textAlign: 'left',
                        }}
                      >
                        {line.text}
                      </div>
                    </div>
                  )
                )
              )}
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--wa-sidebar-border)',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                textAlign: 'center',
              }}
            >
              <SessionStat value={String(lines.length)} label="Exchanges" color="var(--wa-sidebar-text)" />
              <SessionStat value={String(userTurns)} label="Your turns" color={sessionAccentText('var(--wa-success)')} />
              <SessionStat value={formatClock(elapsed)} label="Duration" color={sessionAccentText('var(--wa-gold)')} />
            </div>
          </div>
        </div>
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 0 }}>
        Speak naturally with the AI coach. Your live transcript appears here while you practice.
      </p>
    </section>
  );
}

function SessionStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 'var(--wa-type-meta)', color: SESSION_MUTED, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

const circleBtn: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 999,
  background: SESSION_CHIP,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--wa-sidebar-text)',
};

const bubble: React.CSSProperties = {
  borderRadius: 16,
  padding: '10px 14px',
};

const transcriptLabelCoach: React.CSSProperties = {
  fontSize: 'var(--wa-type-meta)',
  fontWeight: 700,
  color: 'var(--wa-accent)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

const transcriptLabelYou: React.CSSProperties = {
  fontSize: 'var(--wa-type-meta)',
  fontWeight: 700,
  color: SESSION_MUTED,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

/* ============================================================ */
/* VIEW: RESUME STUDIO (BETA) — Career Studio                   */
/* ============================================================ */

/** Color band for the real structural score ring. */
function scoreBand(score: number): { color: string; label: string } {
  // Text-grade tokens: the band colours the 36px score and the ring on a light card (WAP-100).
  if (score >= 85) return { color: 'var(--wa-success-dark)', label: 'Interview-ready structure' };
  if (score >= 70) return { color: 'var(--wa-gold-dark)', label: 'Solid — a few fixes to go' };
  return { color: 'var(--wa-accent)', label: 'Needs work — start with the fixes below' };
}

function StudioPanel({ data }: { data: ResumeStudioData }) {
  const hasResume = data.hasResume;
  const score =
    typeof data.structuralScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(data.structuralScore)))
      : null;
  const issues = data.issues ?? [];
  const band = score !== null ? scoreBand(score) : null;

  // Ring geometry (r=52, stroke=11 → C≈326.7).
  const ringR = 52;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = score !== null ? ringC * (1 - score / 100) : ringC;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* crimson gradient banner */}
      <div
        className="wa-flex-col md:wa-flex-row"
        style={{
          background: 'linear-gradient(to bottom right, var(--wa-accent), var(--wa-accent-dark))',
          borderRadius: 24,
          padding: 'clamp(20px, 5vw, 28px)',
          color: 'var(--wa-on-accent)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: ACCENT_CARD_SHADOW,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <FlaskConical size={13} aria-hidden="true" />
            Resume
            <Token label="BETA" size="sm" color="gray" />
          </div>
          <h2 className="h-font" style={{ fontSize: 'clamp(22px, 6vw, 30px)', marginTop: 4, fontWeight: 800, letterSpacing: '-0.03em' }}>
            Resume Studio
          </h2>
          <p style={{ fontSize: 'var(--wa-type-body)', color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
            {hasResume
              ? 'Your instant structural read and top fixes — then full AI scoring, rewrites, and voice coaching.'
              : 'Add your resume to get an instant structural read, full AI scoring, and rewrites.'}
          </p>
        </div>
        <AstryxLink href={hasResume ? TOOL_HREF['resume-studio'] + '?view=score' : TOOL_HREF['resume-studio']} as={Link as never} isStandalone>
          <Button
            label={hasResume ? 'Open full analysis' : 'Add résumé'}
            variant="primary"
            size="sm"
            icon={<Upload size={14} aria-hidden="true" />}
          />
        </AstryxLink>
      </div>

      {hasResume && score !== null ? (
        <>
          {/* score + fixes */}
          <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5">
            {/* real structural score ring */}
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <h3 style={{ fontWeight: 800, fontSize: 'var(--wa-type-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wa-muted)', marginBottom: 12 }}>
                Structure Score
              </h3>
              <div style={{ position: 'relative' }}>
                <svg width="150" height="150" viewBox="0 0 120 120" role="img" aria-label={`Structure score ${score} of 100`}>
                  <circle cx="60" cy="60" r={ringR} fill="none" stroke="var(--wa-track)" strokeWidth="11" />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringR}
                    fill="none"
                    stroke={band?.color ?? 'var(--wa-gold-dark)'}
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={ringC.toFixed(1)}
                    strokeDashoffset={ringOffset.toFixed(1)}
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: band?.color ?? 'var(--wa-gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{score}</span>
                  <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', letterSpacing: '0.08em' }}>OF 100</span>
                </div>
              </div>
              <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 12 }}>
                {band?.label}. This is the instant structural read — run the full AI analysis for market &amp; skills-match scoring.
              </p>
              </div>
            </Card>

            {/* real top fixes */}
            <div className="lg:wa-col-span-2">
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>Top Fixes</h3>
                {issues.length > 0 ? (
                  <Token label={`${issues.length} found`} size="sm" color="pink" />
                ) : null}
              </div>
              {issues.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {issues.map((issue, i) => (
                    <IssueRow key={i} issue={issue} />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, background: 'var(--wa-bg)', border: '1px solid var(--wa-border)', borderRadius: 16 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--wa-success-soft, rgba(74,155,79,0.12))', color: 'var(--wa-success)' }}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--wa-type-meta)' }}>No structural issues</div>
                    <div style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                      Your formatting, bullets, and quantification look strong. Run the full analysis for market &amp; skills-coverage insights.
                    </div>
                  </div>
                </div>
              )}
            </Card>
            </div>
          </div>

          {/* go-deeper CTA + voice card */}
          <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5">
            <div className="lg:wa-col-span-2">
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h3 style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', marginBottom: 6 }}>Full analysis</h3>
              <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Scores this resume against job-market keywords and O*NET skills, then rewrites weak bullets.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                <AstryxLink href={TOOL_HREF['resume-studio'] + '?view=score'} as={Link as never} isStandalone>
                  <Button label="Run full analysis" variant="primary" size="sm" icon={<Sparkles size={14} aria-hidden="true" />} />
                </AstryxLink>
                <AstryxLink href={TOOL_HREF['resume-rewriter']} as={Link as never} isStandalone>
                  <Button label="Rewrite a bullet" variant="secondary" size="sm" />
                </AstryxLink>
              </div>
              </div>
            </Card>
            </div>

            {/* Crimson "Talk it through" voice card → unified Resume Coach session */}
            <Link
              href="/dashboard/ai-tools/studio?tab=session&agent=resume"
              className="wa-kit-focus vs-hero-card"
              style={{
                textAlign: 'left',
                background: 'linear-gradient(to bottom right, var(--wa-accent), var(--wa-accent-dark))',
                color: 'var(--wa-on-accent)',
                borderRadius: 24,
                padding: 'clamp(20px, 5vw, 28px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                border: 'none',
                boxShadow: ACCENT_CARD_SHADOW,
                textDecoration: 'none',
              }}
            >
              <div>
                <div style={{ padding: 12, width: 'fit-content', background: 'rgba(255,255,255,0.15)', borderRadius: 16, display: 'inline-flex' }}>
                  <Sparkles size={20} aria-hidden="true" />
                </div>
                <h3 style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', marginTop: 16 }}>Resume coach</h3>
                <p style={{ fontSize: 'var(--wa-type-meta)', color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                  Voice session with this resume loaded.
                </p>
              </div>
              <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--wa-type-meta)', fontWeight: 700 }}>
                <Mic size={13} aria-hidden="true" />
                Start voice session
              </div>
            </Link>
          </div>
        </>
      ) : (
        /* no resume on file — honest empty state */
        <div className="wa-kit-card">
          <KitEmptyState
            title="No resume on file"
            description="Add a resume to see a structure score, top fixes, and keyword analysis."
            action={
              <Link href={TOOL_HREF['resume-studio']} className="wa-kit-cta wa-kit-focus hover:wa-opacity-90">
                <Upload size={14} aria-hidden="true" />
                Add resume
              </Link>
            }
          />
        </div>
      )}
    </section>
  );
}

function IssueRow({ issue }: { issue: ResumeStudioIssue }) {
  const { title, detail } = issue;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: 'var(--wa-accent-soft)',
            color: 'var(--wa-accent)',
          }}
        >
          <Sparkles size={13} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--wa-type-meta)' }}>{title}</div>
          <div style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>{detail}</div>
        </div>
        <AstryxLink href={TOOL_HREF['resume-rewriter']} as={Link as never} isStandalone>
          <Button label="Fix with AI" variant="primary" size="sm" />
        </AstryxLink>
      </div>
    </Card>
  );
}

/* ============================================================ */
/* VIEW: AI TOOLKIT HUB                                          */
/* ============================================================ */

type ToolTag = 'BETA' | 'VOICE';

interface ToolCard {
  Icon: LucideIcon;
  title: string;
  body: string;
  tag?: ToolTag;
  /** Real route this tool opens. */
  href: string;
}

interface ToolStep {
  n: number;
  /** Short path label (Resume / Interview / Profile). */
  label: string;
  title: string;
  tools: ToolCard[];
}

const TOOLKIT_STEPS: ToolStep[] = [
  {
    n: 1,
    label: 'Resume',
    title: 'Get applications ready',
    tools: [
      { Icon: FileText, title: 'Resume Studio', body: 'Score, rewrite & talk through your resume.', tag: 'BETA', href: TOOL_HREF['resume-studio'] },
      { Icon: MailOpen, title: 'Cover Letter', body: 'Tailored to any saved job in seconds.', href: TOOL_HREF['cover-letter'] },
      { Icon: CheckCircle2, title: 'Skill Checkpoints', body: "Verify what you've actually mastered.", href: TOOL_HREF['skill-checkpoints'] },
    ],
  },
  {
    n: 2,
    label: 'Interview',
    title: 'Prep and target the role',
    tools: [
      { Icon: AudioLines, title: 'Interview Practice', body: 'Live mock interviews with voice coaching.', tag: 'VOICE', href: TOOL_HREF['interview-practice'] },
      { Icon: Headset, title: 'Interview Coach', body: 'Question-by-question guidance.', href: TOOL_HREF['interview-coach'] },
      { Icon: Search, title: 'Job Match Scorer', body: 'See how you match a specific job.', href: TOOL_HREF['job-match-scorer'] },
      { Icon: Network, title: 'Skill Mapper', body: 'Find skills employers want.', href: TOOL_HREF['skill-mapper'] },
      { Icon: Route, title: 'Training Bridge', body: 'Map missing skills to free training.', tag: 'BETA', href: TOOL_HREF['training-bridge'] },
    ],
  },
  {
    n: 3,
    label: 'Profile',
    title: 'Polish profile and strategy',
    tools: [
      { Icon: Linkedin, title: 'LinkedIn Headline', body: 'A headline recruiters stop on.', href: TOOL_HREF['linkedin-headline'] },
      { Icon: UserPen, title: 'LinkedIn About', body: 'Write your professional story.', href: TOOL_HREF['linkedin-about'] },
      { Icon: Search, title: 'Gap Analyzer', body: "See what's missing for a job.", href: TOOL_HREF['gap-analyzer'] },
      { Icon: MessagesSquare, title: 'Salary Negotiation', body: 'Practice asking for better pay.', href: TOOL_HREF['salary-negotiation'] },
      { Icon: Scale, title: 'Benefits Cliff Check', body: 'Will this offer leave you better off?', tag: 'BETA', href: TOOL_HREF['benefits-cliff'] },
    ],
  },
];

function ToolkitToolTag({ tag }: { tag: ToolTag }) {
  switch (tag) {
    case 'BETA':
      return <StatusTag tone="warn">Beta</StatusTag>;
    case 'VOICE':
      return <StatusTag tone="info">Voice</StatusTag>;
    default: {
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
}

function ToolkitPanel() {
  // Computed (not hardcoded) so the count can never drift from what's
  // actually rendered below as tools are added or removed from a step.
  const toolCount = TOOLKIT_STEPS.reduce((n, step) => n + step.tools.length, 0);
  return (
    <section className="wa-kit-toolkit" aria-label="All career tools">
      <header className="wa-kit-toolkit__intro">
        <p className="wa-kit-toolkit__lede">{toolCount} tools in three stages.</p>
        <nav aria-label="Job-search path">
          <ol className="wa-kit-toolkit-path">
            {TOOLKIT_STEPS.map((step) => (
              <li key={step.n} className="wa-kit-toolkit-path__item">
                <a className="wa-kit-toolkit-path__step wa-kit-focus" href={`#toolkit-stage-${step.n}`}>
                  <span className="wa-kit-toolkit-path__num" aria-hidden="true">
                    {step.n}
                  </span>
                  <span className="wa-kit-toolkit-path__copy">
                    <span className="wa-kit-toolkit-path__label">{step.label}</span>
                    <span className="wa-kit-toolkit-path__count">{step.tools.length} tools</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <div className="wa-kit-toolkit-stages">
        {TOOLKIT_STEPS.map((step) => (
          <section
            key={step.n}
            id={`toolkit-stage-${step.n}`}
            className="wa-kit-toolkit-stage"
            aria-labelledby={`toolkit-stage-${step.n}-title`}
          >
            <header className="wa-kit-toolkit-stage__head">
              <span className="wa-kit-toolkit-stage__num" aria-hidden="true">
                {step.n}
              </span>
              <div className="wa-kit-toolkit-stage__titles">
                <h2 id={`toolkit-stage-${step.n}-title`} className="wa-kit-toolkit-stage__label">
                  {step.label}
                </h2>
                <p className="wa-kit-toolkit-stage__title">{step.title}</p>
              </div>
            </header>
            <ul className="wa-kit-toolkit-list">
              {step.tools.map((tool) => (
                <li key={tool.title}>
                  <ToolCardView tool={tool} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function ToolCardView({ tool }: { tool: ToolCard }) {
  const { Icon, title, body, tag, href } = tool;

  return (
    <Link href={href} className="wa-kit-toolkit-row wa-kit-focus">
      <span className="wa-kit-toolkit-row__icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="wa-kit-toolkit-row__body">
        <span className="wa-kit-toolkit-row__title">{title}</span>
        {tag ? <ToolkitToolTag tag={tag} /> : null}
        <span className="wa-kit-toolkit-row__meta">{body}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="wa-kit-toolkit-row__chevron" />
    </Link>
  );
}

/* ============================================================ */
/* Orb / ring / equalizer keyframes — reduced-motion gated.      */
/* ============================================================ */

const ORB_CSS = `
@keyframes vsOrbPulse { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.06); opacity: 1 } }
@keyframes vsRing { 0% { transform: scale(1); opacity: .5 } 100% { transform: scale(1.8); opacity: 0 } }
@keyframes vsEq { 0%,100% { height: 20% } 50% { height: 100% } }
@keyframes vsPulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
.vs-orb-core { animation: vsOrbPulse 2.4s ease-in-out infinite; }
.vs-orb-ring { animation: vsRing 2.8s ease-out infinite; }
.vs-orb-ring.vs-d2 { animation-delay: .9s; }
.vs-orb-ring.vs-d3 { animation-delay: 1.8s; }
.vs-eqbar { height: 60%; animation: vsEq 1s ease-in-out infinite; }
.vs-dot { animation: vsPulse 1.6s ease-in-out infinite; }
.vs-focus-dark:focus-visible { outline: 2px solid transparent; outline-offset: 2px; box-shadow: var(--wa-focus-ring-on-dark); }

/* Micro-interactions — transform/opacity only, so they're cheap to composite
   and safe to disable wholesale under reduced motion below. */
.vs-tab-btn { transition: background-color 150ms ease; }
.vs-tab-btn:hover { background: rgba(255,255,255,0.08); }
.vs-hero-card { transition: transform 180ms ease; }
.vs-hero-card:hover { transform: translateY(-3px); }
.vs-hero-card:active { transform: scale(0.98); }
.vs-btn-solid { transition: transform 160ms ease, opacity 160ms ease; }
.vs-btn-solid:hover { opacity: 0.92; }
.vs-btn-solid:active { transform: scale(0.97); }

@media (prefers-reduced-motion: reduce) {
  .vs-orb-core, .vs-orb-ring, .vs-eqbar, .vs-dot { animation: none; }
  .vs-tab-btn, .vs-hero-card, .vs-btn-solid { transition: none; }
  .vs-hero-card:hover, .vs-hero-card:active, .vs-btn-solid:hover, .vs-btn-solid:active {
    transform: none;
    opacity: 1;
  }
}
`;
