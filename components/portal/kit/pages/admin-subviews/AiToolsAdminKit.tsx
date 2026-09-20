import {
  FileText,
  Mic,
  Route,
  MessageSquare,
  Briefcase,
  Linkedin,
  Target,
  DollarSign,
  ScanSearch,
  GraduationCap,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  colorVar,
  type KpiItem,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import { EmptyState } from '@astryxdesign/core/EmptyState';

/**
 * AI tools admin — member AI toolkit usage & config, as a responsive card grid.
 * Mockup: workforceap-admin-full.html "ai-tools" view.
 * Target route: /admin/ai-tools
 *
 * Each card: a tinted icon tile, the tool name, a "{N} uses · {state}"
 * description line, and a Token (On=green / Beta=yellow). Usage counts are real
 * (per-tool counts from `getAiToolUsageCounts`, merged onto this catalog by
 * matching `toolType` / `usageKeys`). Tools without a tracked count show "—".
 *
 * Server-rendered (no interactivity) so it stays a plain RSC.
 */

type ToolState = 'On' | 'Beta';

/** A configured tool in the toolkit catalog (admin view). */
export interface AiToolDef {
  /** Stable id (used as React key). */
  id: string;
  /** Display name, e.g. "Resume Studio". */
  name: string;
  /** Icon tile. */
  Icon: LucideIcon;
  /** Tinted tile background / foreground (CSS values). */
  bg: string;
  fg: string;
  /** Rollout state. On→live tag, Beta→warn tag. */
  state: ToolState;
  /** Unit label for the count line ("uses" | "sessions"). */
  unit: 'uses' | 'sessions';
  /**
   * AIToolType enum values (and/or the merged 'voice_session' bucket) whose
   * usage rolls up into this card. A tool may aggregate several enum values.
   */
  usageKeys: string[];
}

export interface AiToolUsage {
  toolType: string;
  uses: number;
}

export interface AiToolsAdminKitProps {
  /** Real per-tool usage counts (from getAiToolUsageCounts). */
  usage?: AiToolUsage[];
  /** Optional catalog override (defaults to the standard toolkit). */
  tools?: AiToolDef[];
}

const crimsonBg = 'rgba(173,44,77,0.10)';
const goldBg = 'rgba(164,127,56,0.14)';
const infoBg = 'rgba(43,123,185,0.12)';
const successBg = 'rgba(74,155,79,0.14)';

/**
 * Toolkit catalog mirroring lib/portal/aiToolsHub.ts + AIToolType enum. Featured
 * tools first (matching the mockup's three cards), then the rest of the toolkit.
 */
const DEFAULT_TOOLS: AiToolDef[] = [
  { id: 'resume-studio', name: 'Resume Studio', Icon: FileText, bg: crimsonBg, fg: colorVar('accent'), state: 'Beta', unit: 'uses', usageKeys: ['resume_rewriter', 'resume_analysis'] },
  { id: 'voice-coaches', name: 'Voice Coaches', Icon: Mic, bg: crimsonBg, fg: colorVar('accent'), state: 'On', unit: 'sessions', usageKeys: ['voice_interview_video', 'voice_session'] },
  { id: 'training-bridge', name: 'Training Bridge', Icon: Route, bg: goldBg, fg: colorVar('gold'), state: 'Beta', unit: 'uses', usageKeys: ['gap_analyzer'] },
  { id: 'cover-letter', name: 'Cover Letter', Icon: FileText, bg: crimsonBg, fg: colorVar('accent'), state: 'On', unit: 'uses', usageKeys: ['cover_letter'] },
  { id: 'interview-practice', name: 'Interview Practice', Icon: MessageSquare, bg: infoBg, fg: colorVar('info'), state: 'On', unit: 'uses', usageKeys: ['interview_practice', 'interview_coach'] },
  { id: 'job-match-scorer', name: 'Job Match Scorer', Icon: Target, bg: infoBg, fg: colorVar('info'), state: 'On', unit: 'uses', usageKeys: ['job_match_scorer', 'job_tailor'] },
  { id: 'career-coach', name: 'Career & Business Coach', Icon: Briefcase, bg: goldBg, fg: colorVar('gold'), state: 'On', unit: 'uses', usageKeys: ['career_counselor'] },
  { id: 'linkedin', name: 'LinkedIn Studio', Icon: Linkedin, bg: infoBg, fg: colorVar('info'), state: 'On', unit: 'uses', usageKeys: ['linkedin_headline', 'linkedin_about'] },
  { id: 'salary-negotiation', name: 'Salary Negotiation', Icon: DollarSign, bg: successBg, fg: colorVar('success'), state: 'On', unit: 'uses', usageKeys: ['salary_negotiation'] },
  { id: 'skill-assessment', name: 'Skill Assessment', Icon: ScanSearch, bg: goldBg, fg: colorVar('gold'), state: 'On', unit: 'uses', usageKeys: ['skill_assessment', 'skill_mission'] },
];

function ToolCard({ tool, uses }: { tool: AiToolDef; uses: number | null }) {
  const { Icon } = tool;
  const stateOk = tool.state === 'On';
  const countText = uses == null ? '—' : `${uses.toLocaleString()} ${tool.unit}`;

  return (
    <Card className="wa-kit-card--hover" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: tool.bg,
            color: tool.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <Token label={tool.state} size="sm" color={stateOk ? 'green' : 'yellow'} />
      </div>
      <div style={{ minWidth: 0 }}>
        <h4 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em', margin: 0 }}>
          {tool.name}
        </h4>
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>
          {countText} · {tool.state}
        </p>
      </div>
    </Card>
  );
}

export function AiToolsAdminKit({ usage = [], tools = DEFAULT_TOOLS }: AiToolsAdminKitProps) {
  const usageByType = new Map<string, number>();
  for (const row of usage) usageByType.set(row.toolType, row.uses);

  const usesForTool = (tool: AiToolDef): number | null => {
    let sum = 0;
    let tracked = false;
    for (const key of tool.usageKeys) {
      const value = usageByType.get(key);
      if (value != null) {
        sum += value;
        tracked = true;
      }
    }
    return tracked ? sum : null;
  };

  const cards = tools.map((tool) => ({ tool, uses: usesForTool(tool) }));

  const totalUses = cards.reduce((s, c) => s + (c.uses ?? 0), 0);
  const liveCount = tools.filter((t) => t.state === 'On').length;
  const betaCount = tools.filter((t) => t.state === 'Beta').length;

  const kpis: KpiItem[] = [
    { label: 'Tools', value: tools.length, color: 'text' },
    { label: 'Live', value: liveCount, color: 'success' },
    { label: 'Beta', value: betaCount, color: 'gold' },
    { label: 'Total uses', value: totalUses.toLocaleString(), color: 'accent' },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="AI tools"
        kicker="Toolkit"
        lede="Admin view of member AI toolkit usage & config"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      {tools.length > 0 ? (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {cards.map(({ tool, uses }) => (
            <ToolCard key={tool.id} tool={tool} uses={uses} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Wand2 className="h-6 w-6" style={{ opacity: 0.5 }} />}
          title="No AI tools configured"
          description="Tools will appear here once the member toolkit is enabled."
        />
      )}

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wa-muted)', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <GraduationCap className="h-4 w-4" style={{ opacity: 0.6 }} />
        {tools.length} tool{tools.length === 1 ? '' : 's'} · {totalUses.toLocaleString()} total uses
      </p>
    </DesignSurface>
  );
}
