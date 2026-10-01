'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search,
  BookOpen,
  Clock,
  ArrowRight,
  HelpCircle,
  ChevronDown,
  TriangleAlert,
  Download,
  ArrowLeftRight,
  FileText,
  Award,
  CheckCircle2,
  Sparkles,
  RotateCw,
  UploadCloud,
  ListChecks} from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import Link from 'next/link';
import ToolFollowThrough from './ToolFollowThrough';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { recommendProgramsForGaps, type ProgramRecommendation } from '@/lib/content/programs';
import { findCoursesForGap, buildCoursePathForGaps, type CourseSkillMapping } from '@/lib/content/courseSkillMap';
import { FormField } from '@/components/portal/kit';

const DEMO_RADAR = [
  { axis: 'Analytics', value: 0.72 },
  { axis: 'Engineering', value: 0.85 },
  { axis: 'Design', value: 0.38 },
  { axis: 'Strategy', value: 0.44 },
  { axis: 'Service', value: 0.55 },
  { axis: 'Research', value: 0.61 },
];
const DEMO_SKILLS = [
  { name: 'Programming', score: 85, importance: 'High' },
  { name: 'Critical Thinking', score: 78, importance: 'High' },
  { name: 'Systems Analysis', score: 72, importance: 'High' },
  { name: 'Active Learning', score: 65, importance: 'Medium' },
  { name: 'Communication', score: 61, importance: 'Medium' },
];

// Sales / non-tech demo — weighted toward Strategy + Ethics axes (reflects actual O*NET data)
const DEMO_SALES_RADAR = [
  { axis: 'Analytics', value: 0.44 },
  { axis: 'Engineering', value: 0.18 },
  { axis: 'Design', value: 0.22 },
  { axis: 'Strategy', value: 0.78 },
  { axis: 'Service', value: 0.82 },
  { axis: 'Research', value: 0.38 },
];
const DEMO_SALES_SKILLS = [
  { name: 'Active Listening', score: 88, importance: 'High' },
  { name: 'Speaking', score: 85, importance: 'High' },
  { name: 'Sales and Marketing', score: 82, importance: 'High' },
  { name: 'Persuasion', score: 80, importance: 'High' },
  { name: 'Service Orientation', score: 76, importance: 'Medium' },
];

const AXIS_DESCRIPTIONS: Record<string, { plain: string; examples: string }> = {
  Analytics: {
    plain: 'Working with data, numbers, and logic',
    examples: 'Math, statistics, critical thinking, data analysis, problem-solving'},
  Engineering: {
    plain: 'Building and working with technology or systems',
    examples: 'Programming, software, hardware, networks, troubleshooting, operations'},
  Design: {
    plain: 'Creative and visual communication',
    examples: 'Writing, graphics, UX/UI, multimedia, branding, content creation'},
  Strategy: {
    plain: 'Planning, leadership, and decision-making',
    examples: 'Management, sales & marketing, budgeting, negotiation, coordination'},
  Ethics: {
    plain: 'People skills and professional conduct',
    examples: 'Communication, active listening, empathy, teamwork, service orientation'},
  Research: {
    plain: 'Learning, investigating, and documenting',
    examples: 'Study, scientific methods, technical writing, data collection, continuous learning'}};

const primaryPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  minHeight: 44,
  padding: '10px 20px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  fontWeight: 700,
  fontSize: '0.85rem',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer'} as const;

const outlinePillStyleSm = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.4rem 0.875rem',
  borderRadius: 999,
  border: '1px solid var(--wa-border)',
  background: 'var(--wa-surface)',
  color: 'var(--wa-accent)',
  fontWeight: 700,
  fontSize: '0.8125rem'} as const;

function AxisLegend({ axes }: { axes: string[] }) {
  const [open, setOpen] = useState(false);
  const shown = axes.filter(a => AXIS_DESCRIPTIONS[a]);
  if (shown.length === 0) return null;
  return (
    <div style={{ marginTop: '0.5rem', marginBottom: '1rem', border: '1px solid var(--surface-container-highest)', borderRadius: '0.75rem', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.625rem 0.875rem', background: 'var(--surface-container-low)',
          border: 'none', cursor: 'pointer', fontSize: '0.8125rem',
          color: 'var(--color-on-surface-variant)', fontWeight: 500}}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <HelpCircle size={15} aria-hidden="true" />
          What do these scores measure?
        </span>
        <ChevronDown size={16} aria-hidden="true" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{ padding: '0.75rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--surface-container)' }}>
          {shown.map(axis => {
            const info = AXIS_DESCRIPTIONS[axis];
            return (
              <div key={axis} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: '0.8125rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                  borderRadius: '999px', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                  color: 'var(--wa-accent-text)', flexShrink: 0, lineHeight: '1.6'}}>
                  {axis}
                </span>
                <div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{info.plain}</span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}> — {info.examples}</span>
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0', lineHeight: 1.5 }}>
            Scores come from O*NET occupational data. Higher means that skill area matters more for this job.
          </p>
        </div>
      )}
    </div>
  );
}

/** Returns true when a search query or occupation title looks like a sales/non-tech role. */
function isSalesQuery(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(sales|account exec|account manager|ae\b|bdr\b|sdr\b|salesforce|crm|customer success|business dev|marketing manager)\b/.test(t);
}

function RadarChart({ data }: { data: { axis: string; value: number }[] }) {
  const size = 240;
  const cx = size / 2, cy = size / 2, r = 90;
  const n = data.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, v: number) => ({
    x: cx + r * v * Math.cos(angle(i)),
    y: cy + r * v * Math.sin(angle(i))});
  const gridLevels = [0.25, 0.5, 0.75, 1];
  return (
    <svg className="skill-mapper-radar-chart" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Skill radar chart" style={{ overflow: 'visible', display: 'block', margin: '0 auto' }}>
      {gridLevels.map(level => (
        <polygon key={level}
          points={data.map((_, i) => { const p = pt(i, level); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke="var(--surface-container-highest)" strokeWidth="1" />
      ))}
      {data.map((_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--surface-container-highest)" strokeWidth="1" />;
      })}
      <polygon
        points={data.map((d, i) => { const p = pt(i, d.value); return `${p.x},${p.y}`; }).join(' ')}
        fill="var(--color-accent)" fillOpacity="0.2" stroke="var(--color-accent)" strokeWidth="2" />
      {data.map((d, i) => {
        const p = pt(i, 1.25);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
          fontSize="13" fill="var(--color-on-surface-variant)">{d.axis}</text>;
      })}
    </svg>
  );
}

function DualRadarChart({ memberData, targetData }: { memberData: { axis: string; value: number }[]; targetData: { axis: string; value: number }[] }) {
  const size = 260;
  const cx = size / 2, cy = size / 2, r = 90;
  // Derive axes from whichever dataset has more entries (prefer target occupation axes)
  const axes = targetData.length >= memberData.length
    ? targetData.map(d => d.axis)
    : memberData.map(d => d.axis);
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, v: number) => ({
    x: cx + r * v * Math.cos(angle(i)),
    y: cy + r * v * Math.sin(angle(i))});
  const gridLevels = [0.25, 0.5, 0.75, 1];

  const getValue = (data: { axis: string; value: number }[], axis: string) =>
    data.find(d => d.axis === axis)?.value ?? 0;

  return (
    <svg className="skill-mapper-radar-chart" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Skill radar chart" style={{ overflow: 'visible', display: 'block', margin: '0 auto' }}>
      {gridLevels.map(level => (
        <polygon key={level}
          points={axes.map((_, i) => { const p = pt(i, level); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke="var(--surface-container-highest)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--surface-container-highest)" strokeWidth="1" />;
      })}
      {/* Target occupation - accent/red */}
      <polygon
        points={axes.map((axis, i) => { const p = pt(i, getValue(targetData, axis)); return `${p.x},${p.y}`; }).join(' ')}
        fill="var(--color-accent)" fillOpacity="0.15" stroke="var(--color-accent)" strokeWidth="2" />
      {/* Member profile - blue */}
      <polygon
        points={axes.map((axis, i) => { const p = pt(i, getValue(memberData, axis)); return `${p.x},${p.y}`; }).join(' ')}
        fill="rgba(43,123,185,0.2)" stroke="var(--color-blue, #2b7bb9)" strokeWidth="2" strokeDasharray="4 2" />
      {axes.map((axis, i) => {
        const p = pt(i, 1.25);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
          fontSize="13" fill="var(--color-on-surface-variant)">{axis}</text>;
      })}
    </svg>
  );
}

/**
 * CoursePathForGaps - Shows specific courses that close skill gaps
 * Displays a compact, actionable course path based on the user's biggest gaps
 */
function CoursePathForGaps({ gaps }: { gaps: Array<{ axis: string; member: number; target: number; gap: number }> }) {
  const [coursePath, setCoursePath] = useState<Array<{
    course: CourseSkillMapping;
    addressesGap: string;
    estimatedImpact: number;
    priority: number;
  }> | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Build course path from gaps
    const path = buildCoursePathForGaps(
      gaps.map(g => ({ axis: g.axis, member: g.member / 100, target: g.target / 100, gap: g.gap / 100 })),
      [],
      { maxCourses: expanded ? 8 : 4 }
    );
    setCoursePath(path);
  }, [gaps, expanded]);

  if (!coursePath || coursePath.length === 0) return null;

  // Group courses by the gap they address
  const coursesByGap = coursePath.reduce((acc, item) => {
    if (!acc[item.addressesGap]) acc[item.addressesGap] = [];
    acc[item.addressesGap].push(item);
    return acc;
  }, {} as Record<string, typeof coursePath>);

  const topGaps = Object.keys(coursesByGap).slice(0, 2);

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <BookOpen size={16} style={{ color: 'var(--wa-accent-text)' }} />
        Fastest Path to Close Gaps
      </h4>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
        Specific courses that build the skills you need most
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {topGaps.map(gapAxis => (
          <div key={gapAxis} style={{ background: 'var(--surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div style={{
              padding: '0.5rem 0.75rem',
              background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
              borderBottom: '1px solid var(--surface-container-highest)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--wa-accent-text)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>Close {gapAxis} gap</span>
              <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 400 }}>
                (+{Math.round(gaps.find(g => g.axis === gapAxis)?.gap || 0)}% needed)
              </span>
            </div>
            <div style={{ padding: '0.5rem' }}>
              {coursesByGap[gapAxis].slice(0, expanded ? 3 : 2).map((item, idx) => (
                <div key={item.course.courseSlug} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.625rem',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  background: idx === 0 ? 'color-mix(in srgb, var(--color-green) 6%, transparent)' : 'transparent',
                  marginBottom: '0.25rem'
                }}>
                  <div style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    background: idx === 0 ? 'var(--color-green, #4a9b4f)' : 'var(--surface-container-highest)',
                    color: idx === 0 ? 'var(--wa-on-accent)' : 'var(--color-on-surface-variant)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: '0.125rem'
                  }}>
                    {item.priority}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', lineHeight: 1.4 }}>
                      {item.course.courseName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={10} />
                        {item.course.estimatedHours} hrs
                      </span>
                      <span style={{
                        fontSize: '0.8125rem',
                        background: 'var(--surface-container-highest)',
                        color: 'var(--color-on-surface-variant)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '999px'
                      }}>
                        {item.course.partner}
                      </span>
                      {idx === 0 && (
                        <span style={{
                          fontSize: '0.8125rem',
                          background: 'color-mix(in srgb, var(--color-green) 15%, transparent)',
                          color: 'var(--color-green, #4a9b4f)',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '999px',
                          fontWeight: 600
                        }}>
                          Best match
                        </span>
                      )}
                    </div>
                    {(() => {
                      const matchingContribution = item.course.contributions.find(c => c.axis === item.addressesGap);
                      const specificSkills = matchingContribution?.specificSkills ?? [];

                      if (specificSkills.length === 0) return null;

                      return (
                        <div style={{ marginTop: '0.375rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {specificSkills.slice(0, 3).map(skill => (
                            <span key={skill} style={{
                              fontSize: '0.8125rem',
                              color: 'var(--color-on-surface-variant)',
                              background: 'var(--surface-container-highest)',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '0.25rem'
                            }}>
                              {skill}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <a
                    href={`/programs/${item.course.programSlug}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '0.375rem',
                      background: 'var(--color-accent)',
                      color: 'var(--wa-on-accent)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Start <ArrowRight size={10} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {coursePath.length > 4 && (
        <button type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            width: '100%',
            marginTop: '0.75rem',
            padding: '0.5rem',
            border: '1px solid var(--surface-container-highest)',
            borderRadius: '0.5rem',
            background: 'transparent',
            color: 'var(--color-on-surface-variant)',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem'
          }}
        >
          {expanded ? 'Show fewer courses' : `Show ${coursePath.length - 4} more courses`}
        </button>
      )}
    </div>
  );
}

export default function SkillMapperClient() {
  const [activeTab, setActiveTab] = useState<'search' | 'profile'>('search');
  const [query, setQuery] = useState('');
  const [occupations, setOccupations] = useState<{ code: string; title: string; description: string }[]>([]);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [radarData, setRadarData] = useState<{ axis: string; value: number }[]>([]);
  const [skills, setSkills] = useState<{ name: string; score: number; importance: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingComparison, setExportingComparison] = useState(false);
  const [error, setError] = useState('');
  const [usingDemo, setUsingDemo] = useState(false);
  const [demoFallbackReason, setDemoFallbackReason] = useState<string>('');

  // Matched programs from occupation → program mapping (from DB seed)
  const [matchedPrograms, setMatchedPrograms] = useState<{
    programSlug: string;
    programTitle: string;
    categoryLabel: string;
    categoryColor: string;
    icon: string;
    duration: string;
    partner: string;
    priority: number;
    experienceBand: string;
    recommendationType: string;
    whyRecommended: string | null;
  }[]>([]);

  // Profile tab state
  const [memberProfile, setMemberProfile] = useState<{ axis: string; value: number }[]>([]);
  const [memberCerts, setMemberCerts] = useState<string[]>([]);
  const [resumeSkills, setResumeSkills] = useState<{ axis: string; value: number }[]>([]);
  const [resumeMatchedKeywords, setResumeMatchedKeywords] = useState<Record<string, string[]>>({});
  const [hasInterestProfiler, setHasInterestProfiler] = useState(false);
  const [hasAiResumeExtraction, setHasAiResumeExtraction] = useState(false);
  const [extractingResume, setExtractingResume] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const autoExtractAttemptedRef = useRef(false);
  const [autoExtracting, setAutoExtracting] = useState(false);

  const exportSkillMap = async () => {
    if (!selectedTitle || !radarData.length) return;
    setExportingPdf(true);
    setError('');
    try {
      // Build a text summary of the skill map for PDF rendering
      const lines = [
        `Occupation: ${selectedTitle}`,
        selectedCode ? `O*NET Code: ${selectedCode}` : '',
        '',
        '## Skill Profile',
        ...radarData.map(r => `${r.axis}: ${Math.round(r.value * 100)}%`),
        '',
        '## Top Skills',
        ...skills.slice(0, 15).map(s => `${s.name}: ${s.score}%`),
      ].filter(Boolean).join('\n');

      // Send structured chart data — the server draws the radar chart natively with
      // pdf-lib primitives. Previous attempts to rasterize SVG -> PNG via canvas
      // failed silently in some browsers (tainted canvas / data-URL quirks),
      // leaving the chart out of the exported PDF entirely.
      const chartData = radarData.length >= 3
        ? {
            type: 'radar' as const,
            axes: radarData.map(r => r.axis),
            series: [{ label: selectedTitle, values: radarData.map(r => ({ axis: r.axis, value: r.value })) }]}
        : undefined;

      const res = await fetch('/api/ai/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: lines,
          title: `Skill Mapper`,
          toolName: 'Skill Mapper',
          chartData})});
      if (!res.ok) {
        setError("Couldn't generate the PDF — please try again. If this keeps happening, contact support.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workforceap-skill-map-${selectedTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't generate the PDF — please try again. If this keeps happening, contact support.");
    } finally {
      setExportingPdf(false);
    }
  };

  const exportComparisonPdf = async () => {
    if (!memberProfile.length || !radarData.length) return;
    setExportingComparison(true);
    setError('');
    try {
      const lines = [
        `Skill Comparison: Your Profile vs. ${selectedTitle}`,
        '',
        '## Your Skill Profile',
        ...memberProfile.map(p => `${p.axis}: ${Math.round(p.value * 100)}%`),
        '',
        `## ${selectedTitle} Requirements`,
        ...radarData.map(r => `${r.axis}: ${Math.round(r.value * 100)}%`),
        ...(gaps.length > 0 ? [
          '',
          '## Skill Gaps to Close',
          ...gaps.map(g => `${g.axis}: ${Math.round(g.member)}% → ${Math.round(g.target)}% (+${Math.round(g.gap)} needed)`),
        ] : []),
      ].join('\n');

      // Send structured chart data — server draws the dual radar natively with pdf-lib.
      const targetAxes = radarData.length >= memberProfile.length
        ? radarData.map(r => r.axis)
        : memberProfile.map(p => p.axis);
      const chartData = targetAxes.length >= 3
        ? {
            type: 'radar' as const,
            axes: targetAxes,
            series: [
              { label: selectedTitle || 'Target', values: radarData.map(r => ({ axis: r.axis, value: r.value })) },
              { label: 'Your profile', values: memberProfile.map(p => ({ axis: p.axis, value: p.value })) },
            ]}
        : undefined;

      const res = await fetch('/api/ai/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: lines,
          title: 'Skill Comparison',
          toolName: 'Skill Mapper',
          chartData})});
      if (!res.ok) {
        setError("Couldn't generate the comparison PDF — please try again. If this keeps happening, contact support.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workforceap-skill-comparison-${(selectedTitle || 'profile').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't generate the comparison PDF — please try again. If this keeps happening, contact support.");
    } finally {
      setExportingComparison(false);
    }
  };

  const loadProfile = () => {
    setLoadingProfile(true);
    fetch('/api/member/skill-profile')
      .then(r => r.json())
      .then(data => {
        if (data.skillProfile) setMemberProfile(data.skillProfile);
        if (data.certNames) setMemberCerts(data.certNames);
        if (data.resumeSkills) setResumeSkills(data.resumeSkills);
        if (data.resumeMatchedKeywords) setResumeMatchedKeywords(data.resumeMatchedKeywords);
        if (typeof data.hasInterestProfiler === 'boolean') setHasInterestProfiler(data.hasInterestProfiler);
        if (typeof data.hasAiResumeExtraction === 'boolean') setHasAiResumeExtraction(data.hasAiResumeExtraction);
        setProfileLoaded(true);
        // Auto-trigger AI extraction on first profile load if not yet done
        if (!data.hasAiResumeExtraction && !autoExtractAttemptedRef.current) {
          autoExtractAttemptedRef.current = true;
          setAutoExtracting(true);
          fetch('/api/ai/extract-resume-skills', { method: 'POST' })
            .then(r => { if (r.ok) setProfileLoaded(false); })
            .catch(() => {})
            .finally(() => setAutoExtracting(false));
        }
      })
      .catch(() => setProfileLoaded(true))
      .finally(() => setLoadingProfile(false));
  };

  useEffect(() => {
    if (activeTab === 'profile' && !profileLoaded) loadProfile();
  }, [activeTab, profileLoaded]);  

  const handleAiExtract = async () => {
    setExtractingResume(true);
    try {
      const res = await fetch('/api/ai/extract-resume-skills', { method: 'POST' });
      if (res.ok) {
        // Reload profile to incorporate AI extraction — useEffect handles the refetch
        setProfileLoaded(false);
      }
    } catch { /* non-fatal */ }
    finally { setExtractingResume(false); }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(''); setOccupations([]); setRadarData([]); setSkills([]); setDemoFallbackReason('');
    try {
      const res = await fetch(`/api/ai/skill-mapper?occupation=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.occupations?.length) {
        setOccupations(data.occupations);
      } else {
        const useSales = isSalesQuery(query);
        setError('');
        setRadarData(useSales ? DEMO_SALES_RADAR : DEMO_RADAR);
        setSkills(useSales ? DEMO_SALES_SKILLS : DEMO_SKILLS);
        setUsingDemo(true);
        setDemoFallbackReason(data.demo === true
          ? 'O*NET occupational search is unavailable. Showing sample data for demonstration.'
          : 'No occupations found for this search. Showing sample data for demonstration.'
        );
        setSelectedTitle(useSales ? 'Sales Representative (Demo)' : 'Software Developer (Demo)');
      }
    } catch (err) {
      const useSales = isSalesQuery(query);
      setError('');
      setRadarData(useSales ? DEMO_SALES_RADAR : DEMO_RADAR);
      setSkills(useSales ? DEMO_SALES_SKILLS : DEMO_SKILLS);
      setUsingDemo(true);
      setDemoFallbackReason('Unable to connect to occupation database. Showing sample data for demonstration.');
      setSelectedTitle(useSales ? 'Sales Representative (Demo)' : 'Software Developer (Demo)');
    }
    setLoading(false);
  };

  const handleSelect = async (code: string, title: string) => {
    setSelectedTitle(title); setSelectedCode(code); setLoadingSkills(true); setError(''); setUsingDemo(false); setMatchedPrograms([]); setDemoFallbackReason('');
    try {
      const res = await fetch(`/api/ai/skill-mapper?code=${encodeURIComponent(code)}&title=${encodeURIComponent(title)}`);
      const data = await res.json();
      if (data.radarAxes) {
        setRadarData(data.radarAxes.map((a: { axis: string; value: number }) => ({ axis: a.axis, value: (a.value ?? 0) / 100 })));
        setSkills((data.skills || []).map((s: { name: string; score: number; category: string }) => ({ name: s.name, score: s.score, importance: s.score >= 70 ? 'High' : s.score >= 40 ? 'Medium' : 'Low' })));
        setUsingDemo(Boolean(data.demo));
        if (data.demo) {
          setDemoFallbackReason(data.demo === true
            ? 'O*NET occupation details are currently unavailable. Showing sample skill data for demonstration.'
            : ''
          );
        }
      } else {
        const useSales = isSalesQuery(title);
        setRadarData(useSales ? DEMO_SALES_RADAR : DEMO_RADAR);
        setSkills(useSales ? DEMO_SALES_SKILLS : DEMO_SKILLS);
        setUsingDemo(true);
        setDemoFallbackReason('Unable to load occupation details. Showing sample data for demonstration.');
      }
      if (data.matchedPrograms?.length) setMatchedPrograms(data.matchedPrograms);
    } catch (err) {
      const useSales = isSalesQuery(title);
      setRadarData(useSales ? DEMO_SALES_RADAR : DEMO_RADAR);
      setSkills(useSales ? DEMO_SALES_SKILLS : DEMO_SKILLS);
      setUsingDemo(true);
      setDemoFallbackReason('Unable to load occupation details. Showing sample data for demonstration.');
    }
    setLoadingSkills(false);
  };

  const programRecs: ProgramRecommendation[] = memberProfile.length > 0
    ? recommendProgramsForGaps(
        memberProfile,
        radarData.length > 0 ? radarData : undefined,
        4,
      )
    : [];

  const gaps = memberProfile.length > 0 && radarData.length > 0
    ? radarData.map(target => {
        const memberAxis = memberProfile.find(m => m.axis === target.axis);
        const memberVal = (memberAxis?.value ?? 0) * 100;
        const targetVal = target.value * 100;
        return { axis: target.axis, member: memberVal, target: targetVal, gap: targetVal - memberVal };
      }).filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap)
    : [];

  // Tab styles
  const tabStyle = (active: boolean) => ({
    padding: '0.5rem 1rem',
    border: 'none',
    borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--wa-accent-text)' : 'var(--color-on-surface-variant)',
    fontWeight: active ? 700 : 400,
    fontSize: '0.875rem',
    cursor: 'pointer'} as React.CSSProperties);

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--surface-container-highest)', marginBottom: '1.5rem' }}>
        <button type="button" style={tabStyle(activeTab === 'search')} onClick={() => setActiveTab('search')}>
          Occupation Search
        </button>
        <button type="button" style={tabStyle(activeTab === 'profile')} onClick={() => setActiveTab('profile')}>
          My Skills Profile
        </button>
      </div>

      {/* Tab 1: Occupation Search */}
      {activeTab === 'search' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 200 }}>
              <FormField
                label="Search an occupation"
                id="skill-mapper-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Software Developer, Account Executive, Project Manager"
              />
            </div>
            <button type="button" className="wa-kit-focus" onClick={handleSearch} disabled={loading || !query.trim()}
              style={{ ...primaryPillStyle, opacity: loading || !query.trim() ? 0.6 : 1, cursor: loading || !query.trim() ? 'not-allowed' : 'pointer' }}>
              {loading ? <PortalInlineSpinner size={16} /> : <Search size={16} aria-hidden />}
              Search
            </button>
          </div>

          {error && (
            <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--wa-radius-sm)', background: 'var(--wa-danger-soft)', color: 'var(--wa-danger)', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {occupations.length > 0 && !radarData.length && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <h3 className="ai-tool-section-title">Select an occupation</h3>
              {occupations.map((occ) => (
                <button type="button" key={occ.code} onClick={() => handleSelect(occ.code, occ.title)}
                  className="wa-kit-focus"
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--wa-radius-sm)',
                    border: '1px solid var(--wa-border)',
                    background: 'var(--wa-surface)'}}>
                  <strong style={{ color: 'var(--wa-text)' }}>{occ.title}</strong>
                  <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--wa-muted)', marginTop: 2 }}>{occ.code} — {occ.description?.slice(0, 120)}</span>
                </button>
              ))}
            </div>
          )}

          {loadingSkills && <p style={{ textAlign: 'center', padding: '2rem' }}><PortalInlineSpinner size={24} /></p>}

          {radarData.length > 0 && (
            <>
              {usingDemo && (
                <div style={{
                  background: 'var(--wa-danger-soft)',
                  border: '1px solid var(--wa-danger)',
                  borderRadius: 'var(--wa-radius-sm)',
                  padding: '1rem',
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  color: 'var(--wa-text)'}}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--wa-danger)' }}>
                    <TriangleAlert size={16} aria-hidden="true" />
                    DEMO MODE — Sample Data Only
                  </div>
                  <p style={{ margin: 0, lineHeight: 1.5 }}>
                    {demoFallbackReason || 'Showing sample skill ranges for demonstration purposes. This is not real occupational data from O*NET.'}
                  </p>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>
                    For accurate skill mapping, try again later or upload your resume for personalized results.
                  </p>
                </div>
              )}
              <h3 className="ai-tool-section-title">{selectedTitle}</h3>
              {isSalesQuery(selectedTitle) && (
                <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-border)', borderRadius: '0.75rem', fontSize: '0.85rem', color: 'var(--color-on-surface)' }}>
                  Sales and account roles usually score strongest in <strong>Strategy</strong> and <strong>Ethics</strong> here because this map weighs planning, negotiation, communication, and relationship-building, not just technical tools.
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '2rem' }}>
                <div style={{ flex: '1 1 240px', minWidth: 240 }}>
                  <RadarChart data={radarData} />
                </div>
                <div style={{ flex: '1 1 280px', minWidth: 280 }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '0.75rem' }}>Top Skills</h4>
                  {skills.map((s) => (
                    <div key={s.name} style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--color-on-surface)' }}>{s.name}</span>
                        <span style={{ color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>{s.score}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-container-highest)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s.score}%`, borderRadius: 4, background: 'var(--color-accent)', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <AxisLegend axes={radarData.map(d => d.axis)} />
              <ToolFollowThrough toolType="skill_mapper" />

              {/* Export + profile compare prompt */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => void exportSkillMap()}
                  disabled={exportingPdf}
                  aria-busy={exportingPdf}
                  className="wa-kit-focus"
                  style={{ ...outlinePillStyleSm, cursor: exportingPdf ? 'default' : 'pointer', opacity: exportingPdf ? 0.6 : 1 }}
                >
                  {exportingPdf ? <PortalInlineSpinner size={14} /> : <Download size={14} aria-hidden="true" />}
                  <span aria-live="polite">
                    {exportingPdf ? 'Saving…' : 'Export Skill Map PDF'}
                  </span>
                </button>
                {memberProfile.length > 0 && (
                  <button type="button" onClick={() => setActiveTab('profile')} className="wa-kit-focus"
                    style={{ ...outlinePillStyleSm, background: 'var(--wa-accent-soft)', cursor: 'pointer' }}>
                    <ArrowLeftRight size={14} aria-hidden="true" />
                    Compare with my profile
                  </button>
                )}
              </div>

              {/* Programs that lead to this occupation (from DB career mappings) */}
              {matchedPrograms.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Programs for this career
                  </h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
                    WorkforceAP programs that prepare you for <strong>{selectedTitle}</strong>
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {matchedPrograms.map((mp) => (
                      <div key={`${mp.programSlug}-${mp.experienceBand}`} style={{
                        background: 'var(--surface-container)', borderRadius: '0.75rem',
                        padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                        <div style={{
                          width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem', flexShrink: 0,
                          background: `color-mix(in srgb, ${mp.categoryColor} 12%, transparent)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem'}}>
                          {mp.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {mp.programTitle}
                          </div>
                          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                            <span style={{
                              background: `color-mix(in srgb, ${mp.categoryColor} 12%, transparent)`,
                              color: mp.categoryColor,
                              borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: '0.8125rem', fontWeight: 600}}>{mp.categoryLabel}</span>
                            <span style={{
                              background: mp.recommendationType === 'primary'
                                ? 'color-mix(in srgb, var(--color-green) 12%, transparent)'
                                : mp.recommendationType === 'bridge'
                                ? 'color-mix(in srgb, var(--color-blue) 12%, transparent)'
                                : 'color-mix(in srgb, var(--color-gold) 12%, transparent)',
                              color: mp.recommendationType === 'primary'
                                ? 'var(--color-green, #4a9b4f)'
                                : mp.recommendationType === 'bridge'
                                ? 'var(--color-blue, #2b7bb9)'
                                : 'var(--color-gold, #a47f38)',
                              borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: '0.8125rem', fontWeight: 600, textTransform: 'capitalize'}}>{mp.recommendationType}</span>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                              {mp.experienceBand.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {mp.whyRecommended && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                              {mp.whyRecommended}
                            </div>
                          )}
                        </div>
                        <Link href={`/programs/${mp.programSlug}`} style={{
                          background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)', borderRadius: 'var(--wa-radius-sm)',
                          padding: '0.35rem 0.625rem', fontSize: '0.8125rem', fontWeight: 600,
                          textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0}} onClick={() => trackFunnelEvent('skill_mapper', 'program_recommendation_viewed', { program_slug: mp.programSlug, recommendation_type: mp.recommendationType })}>View →</Link>
                      </div>
                    ))}
                  </div>
                  {/* Enrollment CTAs */}
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--wa-accent-soft)', border: '1px solid var(--wa-border)', borderRadius: '0.75rem' }}>
                    <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)', marginBottom: '0.5rem' }}>
                      Ready to start your training?
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link href={`/programs/${matchedPrograms[0].programSlug}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        padding: '0.5rem 1rem', borderRadius: 999,
                        background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                        fontWeight: 700, fontSize: '0.8125rem', textDecoration: 'none'}} onClick={() => trackFunnelEvent('skill_mapper', 'enroll_cta_clicked', { program_slug: matchedPrograms[0].programSlug })}>
                        Enroll in {matchedPrograms[0].programTitle}
                      </Link>
                      <Link href="/dashboard/counselor" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        padding: '0.5rem 1rem', borderRadius: 999,
                        background: 'var(--wa-surface-2)', color: 'var(--wa-text)',
                        fontWeight: 600, fontSize: '0.8125rem', textDecoration: 'none'}} onClick={() => trackFunnelEvent('skill_mapper', 'counselor_cta_clicked', {})}>
                        Talk to a counselor first
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 2: My Skills Profile */}
      {activeTab === 'profile' && (
        <div>
          {loadingProfile && (
            <p style={{ textAlign: 'center', padding: '2rem' }}><PortalInlineSpinner size={24} /></p>
          )}

          {!loadingProfile && autoExtracting && (
            <div style={{ padding: '1rem 1.25rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-border)', borderRadius: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
              <PortalInlineSpinner size={20} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: '0 0 0.2rem' }}>
                  Analyzing your resume with AI…
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.4 }}>
                  Extracting skills and mapping them to your profile. Takes about 10 seconds.
                </p>
              </div>
            </div>
          )}

          {!loadingProfile && memberProfile.length > 0 && memberProfile.some(p => p.value > 0) && (
            <>
              {/* Dual radar or single radar */}
              {radarData.length > 0 ? (
                <>
                  <h3 className="ai-tool-section-title skill-mapper-profile-title">Your Skills vs. {selectedTitle || 'Target Occupation'}</h3>
                  <div className="skill-mapper-radar-wrap" style={{ marginBottom: '0.75rem' }}>
                    <DualRadarChart memberData={memberProfile} targetData={radarData} />
                  </div>
                  <div className="skill-mapper-legend" style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: 'var(--color-blue, #2b7bb9)' }} />
                      Your skills
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: 'var(--color-accent)' }} />
                      Target occupation
                    </span>
                  </div>
                  <div className="skill-mapper-export-row" style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => void exportComparisonPdf()}
                      disabled={exportingComparison}
                      aria-busy={exportingComparison}
                      className="wa-kit-focus"
                      style={{ ...outlinePillStyleSm, fontSize: '0.8125rem', cursor: exportingComparison ? 'default' : 'pointer', opacity: exportingComparison ? 0.6 : 1 }}
                    >
                      {exportingComparison ? <PortalInlineSpinner size={14} /> : <Download size={14} aria-hidden="true" />}
                      <span aria-live="polite">
                        {exportingComparison ? 'Saving…' : 'Export Comparison PDF'}
                      </span>
                    </button>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textAlign: 'center', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                    Your profile reflects what we found in your resume and certifications.
                    {' '}<a href="/dashboard/learning/interest-profiler" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>Complete the Interest Profiler</a> or{' '}
                    <a href="/dashboard/resume" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>update your resume</a> to show more of your experience.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="ai-tool-section-title">Your Skill Profile</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.25rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: '0 0 auto' }}>
                      <RadarChart data={memberProfile} />
                    </div>
                    <div style={{ flex: '1 1 200px', minWidth: 180, paddingTop: '0.25rem' }}>
                      {memberProfile.map(d => (
                        <div key={d.axis} style={{ marginBottom: '0.625rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>{d.axis}</span>
                            <span style={{ color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(d.value * 100)}%</span>
                          </div>
                          <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-container-highest)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.round(d.value * 100)}%`,
                              borderRadius: 4,
                              background: d.value >= 0.6 ? 'var(--color-accent)' : d.value >= 0.3 ? 'color-mix(in srgb, var(--color-accent) 65%, var(--color-gold, #a47f38))' : 'var(--color-on-surface-variant)',
                              transition: 'width 0.5s ease'}} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>
                    Search an occupation in the <strong>Occupation Search</strong> tab to compare your skills against a target role.
                  </p>
                </>
              )}

              {/* Earned certs */}
              {memberCerts.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Earned Certifications</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {memberCerts.map(cert => (
                      <span key={cert} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: 'color-mix(in srgb, var(--wa-success) 12%, transparent)', color: 'var(--wa-success)',
                        borderRadius: '999px', padding: '0.25rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600}}>
                        <CheckCircle2 size={13} aria-hidden="true" />
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {memberCerts.length === 0 && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem', marginTop: '-0.25rem' }}>
                  No certifications on file —{' '}
                  <a href="/dashboard/certifications" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>add certs in Verification Vault</a>
                  {' '}to strengthen your radar.
                </p>
              )}

              {/* Gap analysis */}
              {gaps.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Skill Gaps to Close</h4>
                  {gaps.map(g => (
                    <div key={g.axis} className="skill-mapper-gap-row" style={{ marginBottom: '0.75rem' }}>
                      <div className="skill-mapper-gap-row__meta" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                        <span>{g.axis}</span>
                        <span style={{ color: g.gap > 30 ? 'var(--color-error, #d32f2f)' : 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round(g.member)}% → {Math.round(g.target)}% ({g.gap > 0 ? `+${Math.round(g.gap)}` : Math.round(g.gap)} needed)
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-container-highest)', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${g.target}%`, borderRadius: 4, background: 'rgba(43,123,185,0.2)', position: 'absolute' }} />
                        <div style={{ height: '100%', width: `${g.member}%`, borderRadius: 4, background: 'var(--color-blue, #2b7bb9)', position: 'absolute' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Program recommendations based on skill gaps */}
              {programRecs.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Recommended Programs
                  </h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
                    WorkforceAP programs that close your biggest skill gaps
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {programRecs.map((rec) => (
                      <div key={rec.program.slug} style={{
                        background: 'var(--surface-container)', borderRadius: '0.75rem',
                        padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                        <div style={{
                          width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', flexShrink: 0,
                          background: `color-mix(in srgb, ${rec.program.categoryColor} 12%, transparent)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem'}}>
                          {rec.program.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rec.program.title}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                            <span style={{
                              background: `color-mix(in srgb, ${rec.program.categoryColor} 12%, transparent)`,
                              color: rec.program.categoryColor,
                              borderRadius: '999px', padding: '0.125rem 0.5rem', fontSize: '0.8125rem', fontWeight: 600}}>{rec.program.categoryLabel}</span>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                              {rec.reason}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                            <span>{rec.program.duration}</span>
                            <span>{rec.program.partner}</span>
                          </div>
                        </div>
                        <a href={`/programs/${rec.program.slug}`} style={{
                          background: 'var(--color-accent)', color: 'var(--wa-on-accent)', borderRadius: '0.5rem',
                          padding: '0.375rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600,
                          textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0}}>Enroll →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Course-level path to close skill gaps */}
              {gaps.length > 0 && (
                <CoursePathForGaps gaps={gaps} />
              )}
            </>
          )}

          {!loadingProfile && !autoExtracting && profileLoaded && memberProfile.every(p => p.value === 0) && memberCerts.length === 0 && (
            <div style={{ padding: '1.5rem', color: 'var(--color-on-surface-variant)' }}>
              <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', marginBottom: '0.875rem' }}>Build your skill profile</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <a href="/dashboard/learning/interest-profiler" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem', background: 'var(--wa-accent-soft)', border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)', textDecoration: 'none' }}>
                  <ListChecks size={20} aria-hidden="true" style={{ color: 'var(--wa-accent)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--wa-accent)', margin: '0 0 0.2rem' }}>Take the 30-question Interest Profiler</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: 0 }}>~10 minutes — generates your full radar from O*NET interest data</p>
                  </div>
                </a>
                <a href="/dashboard/ai-tools/resume-studio?view=rewrite" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem', background: 'var(--wa-surface)', border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)', textDecoration: 'none' }}>
                  <FileText size={20} aria-hidden="true" style={{ color: 'var(--wa-info)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--wa-text)', margin: '0 0 0.2rem' }}>Run the AI Resume Rewriter</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: 0 }}>We extract skills from your resume and map them to this radar automatically</p>
                  </div>
                </a>
                <a href="/dashboard/certifications" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem', background: 'var(--wa-surface)', border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)', textDecoration: 'none' }}>
                  <Award size={20} aria-hidden="true" style={{ color: 'var(--wa-success)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: '0 0 0.2rem' }}>Add earned certifications</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>Certs like CompTIA A+, IBM AI, Google Data Analytics enrich the Engineering and Analytics axes</p>
                  </div>
                </a>
              </div>
            </div>
          )}

          {/* Interest Profiler CTA — shown when profile exists but no IP data yet */}
          {!loadingProfile && profileLoaded && !hasInterestProfiler && memberProfile.some(p => p.value > 0) && (
            <div style={{ marginTop: '0.875rem', padding: '1rem 1.125rem', background: 'var(--wa-accent-soft)', border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
              <ListChecks size={22} aria-hidden="true" style={{ color: 'var(--wa-accent)', flexShrink: 0, marginTop: '0.125rem' }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
                  Take the 30-question Interest Profiler
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                  Your current profile is based on certifications and resume. Complete the O*NET Interest Profiler to significantly enrich your radar chart with interest-based signals.
                </p>
                <a href="/dashboard/learning/interest-profiler" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.875rem', borderRadius: 999, background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)', fontWeight: 700, fontSize: '0.8125rem', textDecoration: 'none' }}>
                  <ArrowRight size={15} aria-hidden="true" />
                  Start 30-question assessment (~10 min)
                </a>
              </div>
            </div>
          )}

          {/* IP complete confirmation */}
          {!loadingProfile && profileLoaded && hasInterestProfiler && (
            <div style={{ marginTop: '0.875rem', padding: '0.75rem 1rem', background: 'color-mix(in srgb, var(--wa-success) 8%, transparent)', border: '1px solid var(--wa-success)', borderRadius: 'var(--wa-radius-sm)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <CheckCircle2 size={16} aria-hidden="true" style={{ color: 'var(--wa-success)', flexShrink: 0 }} />
              <span><strong style={{ color: 'var(--wa-success)' }}>Interest Profiler complete</strong> — your 30-question results are blended into this radar.{' '}
                <a href="/dashboard/learning/interest-profiler" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>Retake</a>
              </span>
            </div>
          )}

          {/* Resume skill source transparency */}
          {!loadingProfile && resumeSkills.length > 0 && resumeSkills.some(r => r.value > 0) && (
            <div style={{ marginTop: '0.875rem', padding: '0.875rem 1rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-info)', borderRadius: 'var(--wa-radius-sm)' }}>
              <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--wa-info)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {hasAiResumeExtraction ? <Sparkles size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                {hasAiResumeExtraction ? 'AI-extracted resume skills' : 'Resume skills detected'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {resumeSkills.filter(r => r.value > 0).map(r => {
                  const keywords = (resumeMatchedKeywords as Record<string, string[]>)[r.axis] ?? [];
                  return (
                    <div key={r.axis} style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>{r.axis}:</span>{' '}
                      {keywords.length > 0
                        ? keywords.slice(0, 5).join(', ') + (keywords.length > 5 ? ` +${keywords.length - 5} more` : '')
                        : 'detected'}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {!hasAiResumeExtraction && (
                  <button
                    type="button"
                    onClick={handleAiExtract}
                    disabled={extractingResume}
                    className="wa-kit-focus"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.35rem 0.75rem', borderRadius: 999,
                      background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                      fontWeight: 700, fontSize: '0.8125rem', border: 'none',
                      cursor: extractingResume ? 'default' : 'pointer',
                      opacity: extractingResume ? 0.6 : 1}}
                  >
                    {extractingResume ? <PortalInlineSpinner size={13} /> : <Sparkles size={13} aria-hidden="true" />}
                    {extractingResume ? 'Analyzing…' : 'Enhance with AI'}
                  </button>
                )}
                {hasAiResumeExtraction && (
                  <button
                    type="button"
                    onClick={handleAiExtract}
                    disabled={extractingResume}
                    className="wa-kit-focus"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.45rem 0.9rem', borderRadius: 999,
                      background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                      fontWeight: 800, fontSize: '0.8125rem', border: 'none',
                      cursor: extractingResume ? 'default' : 'pointer',
                      opacity: extractingResume ? 0.6 : 1}}
                  >
                    {extractingResume ? <PortalInlineSpinner size={14} /> : <RotateCw size={14} aria-hidden="true" />}
                    {extractingResume ? 'Re-analyzing…' : 'Reanalyze resume skills'}
                  </button>
                )}
                <a href="/dashboard/ai-tools/resume-studio?view=rewrite" style={{ color: 'var(--wa-accent-text)', fontWeight: 700, fontSize: '0.8125rem' }}>Update resume</a>
              </div>
            </div>
          )}

          {/* Show AI extraction CTA when no resume skills at all but profile exists */}
          {!loadingProfile && profileLoaded && memberProfile.some(p => p.value > 0) && !hasAiResumeExtraction && resumeSkills.every(r => r.value === 0) && (
            <div style={{ marginTop: '0.875rem', padding: '0.875rem 1rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-info)', borderRadius: 'var(--wa-radius-sm)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Sparkles size={20} aria-hidden="true" style={{ color: 'var(--wa-info)', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
                  Enhance your profile with AI
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
                  Upload a resume and let AI analyze it to extract detailed skills across all 6 axes — much more accurate than keyword matching.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a href="/dashboard/resume" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.35rem 0.75rem', borderRadius: 999,
                    background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                    fontWeight: 700, fontSize: '0.8125rem', textDecoration: 'none'}}>
                    <UploadCloud size={14} aria-hidden="true" />
                    Upload resume
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
