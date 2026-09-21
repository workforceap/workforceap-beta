import { prisma } from '@/lib/db/prisma';
import { countMemberAiToolRuns } from '@/lib/admin/metrics';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { ANALYTICS_SAMPLE_CAP } from '@/lib/db/queryCaps';
import { programDisplayTitle } from '@/lib/content/programTitle';
import type { RankDatum } from '@/components/portal/kit/Charts';

/**
 * Engagement loader of the reporting hub's Overview tab (moved verbatim from
 * `app/admin/analytics/page.tsx` when the reporting cluster was consolidated;
 * the analytics route now forwards to `/admin/reporting`).
 *
 * All queries are count / groupBy / capped findMany over indexed columns — no
 * $transaction, no heavy scans. Each metric is fetched independently with
 * Promise.allSettled so a single failure degrades to 0 rather than blanking
 * the page. WAU and "active by program" are capped samples
 * (`ANALYTICS_SAMPLE_CAP`), unlike the SQL DISTINCT count `getAdminMetrics()`
 * prints as "Weekly active" — see docs/admin reporting proposal, definitions.
 */

// ── Friendly labels for AI tool types (mirrors lib/analytics/aiToolEfficacy).
// "Resume Studio" matches the mockup's headline tool name for resume_rewriter.
const TOOL_LABELS: Record<string, string> = {
  resume_rewriter: 'Resume Studio',
  cover_letter: 'Cover Letter',
  interview_practice: 'Interview Practice',
  interview_coach: 'Interview Coach',
  voice_interview_video: 'Voice Interview',
  linkedin_headline: 'LinkedIn Headline',
  linkedin_about: 'LinkedIn About',
  job_match_scorer: 'Job Match Scorer',
  resume_analysis: 'Resume Analysis',
  salary_negotiation: 'Salary Negotiation',
  gap_analyzer: 'Gap Analyzer',
  career_counselor: 'Career Counselor',
  skill_assessment: 'Skill Assessment',
  skill_mission: 'Skill Mission',
  job_tailor: 'Job Tailor',
};

// Voice-session event names recorded as MemberEvents (no AIToolResult row).
const VOICE_EVENT_NAMES = [
  'readiness_voice_session',
  'wioa_prequalification_voice_session',
  'employer_voice_session',
  'partner_voice_session',
];

export type EngagementData = {
  wau: number;
  avgSessionLabel: string;
  aiToolUses: number;
  voiceSessions: number;
  topTools: RankDatum[];
  activeByProgram: RankDatum[];
};

/** Build a member-only `user: { ... }` scope for FK-scoped models, org-scoped
 *  or platform-wide (super-admin / no org). Staff and fixture accounts never
 *  count as engagement (number audit 2026-09-20, S22). */
function memberScope(orgId?: string) {
  return { user: orgId ? { organizationId: orgId, ...MEMBER_ONLY_WHERE } : { ...MEMBER_ONLY_WHERE } };
}

export async function getEngagementData(orgId?: string): Promise<EngagementData> {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const scope = memberScope(orgId);

  const [
    wauR,
    sessionsR,
    aiSavedR,
    aiBreakdownR,
    voiceR,
    activeMembersR,
  ] = await Promise.allSettled([
    // WAU — distinct members with any event in the last 7 days.
    prisma.memberEvent.findMany({
      take: ANALYTICS_SAMPLE_CAP,
      where: { createdAt: { gte: sevenDaysAgo }, ...scope },
      select: { userId: true },
      distinct: ['userId'],
    }),
    // Avg session — capped sample of last-7-day events with a sessionId; we
    // compute (max-min) per session in memory. Lean cap keeps it bounded.
    prisma.memberEvent.findMany({
      take: ANALYTICS_SAMPLE_CAP,
      where: { createdAt: { gte: sevenDaysAgo }, sessionId: { not: null }, ...scope },
      select: { sessionId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    // AI Tool Uses — the shared all-time definition every admin surface
    // prints (saved results + event-only voice sessions, members only), so
    // this KPI equals /admin/metrics "AI tool runs" (S22).
    countMemberAiToolRuns(orgId, { start: new Date(0), end: now }),
    // Most-used tools (last 30 days) — per-tool counts from saved results.
    prisma.aIToolResult.groupBy({
      by: ['toolType'],
      where: { createdAt: { gte: thirtyDaysAgo }, ...scope },
      _count: { id: true },
    }),
    // Voice sessions — MemberEvents whose name is a voice-session event,
    // grouped only to count. Indexed on (userId, eventName, createdAt).
    prisma.memberEvent.count({
      where: { eventName: { in: VOICE_EVENT_NAMES }, ...scope },
    }),
    // Weekly active by program — capped sample of active members with events
    // in the last 7 days, joined to enrolledProgram. We dedupe by user in
    // memory so each member counts once per program.
    prisma.memberEvent.findMany({
      take: ANALYTICS_SAMPLE_CAP,
      where: { createdAt: { gte: sevenDaysAgo }, ...scope },
      select: { userId: true, user: { select: { enrolledProgram: true } } },
    }),
  ]);

  const wauIds = wauR.status === 'fulfilled' ? wauR.value : [];
  const wau = wauIds.length;

  // Avg session length (minutes) from sampled events.
  let avgSessionLabel = '—';
  if (sessionsR.status === 'fulfilled' && sessionsR.value.length > 0) {
    const bySession = new Map<string, { min: number; max: number }>();
    for (const e of sessionsR.value) {
      if (!e.sessionId) continue;
      const t = e.createdAt.getTime();
      const cur = bySession.get(e.sessionId);
      if (cur) {
        cur.min = Math.min(cur.min, t);
        cur.max = Math.max(cur.max, t);
      } else {
        bySession.set(e.sessionId, { min: t, max: t });
      }
    }
    if (bySession.size > 0) {
      let totalMs = 0;
      for (const s of bySession.values()) totalMs += s.max - s.min;
      const avgMinutes = Math.round(totalMs / bySession.size / 60000);
      avgSessionLabel = `${avgMinutes}m`;
    }
  }

  // Voice sessions also live as a saved AIToolType (voice_interview_video);
  // fold those into the headline voice count + into the tools breakdown.
  const aiBreakdown = aiBreakdownR.status === 'fulfilled' ? aiBreakdownR.value : [];
  const eventVoice = voiceR.status === 'fulfilled' ? voiceR.value : 0;
  const savedVoice =
    aiBreakdown.find((r) => r.toolType === 'voice_interview_video')?._count.id ?? 0;
  const voiceSessions = eventVoice + savedVoice;

  const aiToolUses = aiSavedR.status === 'fulfilled' ? aiSavedR.value : 0;

  // Most-used tools (last 30 days), ranked, friendly labels, scaled to leader.
  const sortedTools = [...aiBreakdown]
    .map((r) => ({ toolType: r.toolType as string, count: r._count.id }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const toolMax = Math.max(1, ...sortedTools.map((t) => t.count));
  const topTools: RankDatum[] = sortedTools.map((t) => ({
    label: TOOL_LABELS[t.toolType] ?? t.toolType,
    value: t.count,
    pct: Math.round((t.count / toolMax) * 100),
    color: 'accent',
  }));

  // Weekly active by program — dedupe events to distinct (user) then bucket by
  // that member's enrolled program.
  const activeByProgram: RankDatum[] = [];
  if (activeMembersR.status === 'fulfilled') {
    const seen = new Set<string>();
    const byProgram = new Map<string, number>();
    for (const row of activeMembersR.value) {
      if (seen.has(row.userId)) continue;
      seen.add(row.userId);
      const prog = row.user?.enrolledProgram;
      if (!prog) continue;
      byProgram.set(prog, (byProgram.get(prog) ?? 0) + 1);
    }
    const ranked = [...byProgram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const progMax = Math.max(1, ...ranked.map(([, c]) => c));
    for (const [slug, count] of ranked) {
      activeByProgram.push({
        label: programDisplayTitle(slug),
        value: count,
        pct: Math.round((count / progMax) * 100),
        color: 'info',
      });
    }
  }

  return { wau, avgSessionLabel, aiToolUses, voiceSessions, topTools, activeByProgram };
}
