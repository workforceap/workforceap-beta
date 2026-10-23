'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { useTranslations } from 'next-intl';
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
import { buildCoursePathForGaps, type CourseSkillMapping } from '@/lib/content/courseSkillMap';
import { DataTable, FormField } from '@/components/portal/kit';
import { Button } from '@astryxdesign/core/Button';
import { MemberCareerSteps } from '@/components/portal/MemberCareerSteps';
import { trainingBridgeHref } from '@/lib/member/memberWorkspace';
import type { SavedSkillMapperRun } from '@/lib/member/skillMapperRun';
import styles from './SkillMapperClient.module.css';

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
  Service: {
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
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer'} as const;

const outlinePillStyleSm = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  minHeight: 44,
  padding: '0.4rem 0.875rem',
  borderRadius: 999,
  border: '1px solid var(--wa-control-border)',
  background: 'var(--wa-surface)',
  color: 'var(--wa-accent-text)',
  fontWeight: 700,
  fontSize: 'var(--wa-type-body)'} as const;

function AxisLegend({ axes }: { axes: string[] }) {
  const [open, setOpen] = useState(false);
  const shown = axes.filter(a => AXIS_DESCRIPTIONS[a]);
  if (shown.length === 0) return null;
  return (
    <div className={styles.axisGuide}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`${styles.disclosureButton} wa-kit-focus`}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <HelpCircle size={15} aria-hidden="true" />
          What do these scores measure?
        </span>
        <ChevronDown size={16} aria-hidden="true" className={styles.disclosureChevron} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className={styles.axisGuideContent}>
          {shown.map(axis => {
            const info = AXIS_DESCRIPTIONS[axis];
            return (
              <div key={axis} className={styles.axisDefinition}>
                <span className={styles.axisName}>
                  {axis}
                </span>
                <div>
                  <strong>{info.plain}</strong>
                  <span className={styles.muted}> — {info.examples}</span>
                </div>
              </div>
            );
          })}
          <p className={styles.caption}>
            Occupation values summarize how much each area matters for the role. Member values estimate a profile from available records; they are not a proficiency assessment.
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

function RadarChart({ data, member = false, label, valuesId, captionId }: {
  data: { axis: string; value: number }[];
  member?: boolean;
  label: string;
  valuesId: string;
  captionId: string;
}) {
  const descriptionId = useId();
  const size = 240;
  const cx = size / 2, cy = size / 2, r = 90;
  const n = data.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, v: number) => ({
    x: cx + r * v * Math.cos(angle(i)),
    y: cy + r * v * Math.sin(angle(i))});
  const gridLevels = [0.25, 0.5, 0.75, 1];
  return (
    <svg className={`skill-mapper-radar-chart ${styles.radarChart}`} width={size} height={size} viewBox={`-28 -8 ${size + 56} ${size + 16}`} role="img" aria-label={label} aria-describedby={`${descriptionId} ${captionId}`} aria-details={valuesId}>
      <desc id={descriptionId}>{member ? 'Estimated member profile. Exact percentages follow this chart.' : 'Occupation requirements. Exact percentages are available in the View radar values disclosure below.'}</desc>
      {gridLevels.map(level => (
        <polygon key={level}
          points={data.map((_, i) => { const p = pt(i, level); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke="var(--wa-border)" strokeWidth="1" />
      ))}
      {data.map((_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--wa-border)" strokeWidth="1" />;
      })}
      <polygon
        points={data.map((d, i) => { const p = pt(i, d.value); return `${p.x},${p.y}`; }).join(' ')}
        fill={member ? 'var(--wa-info)' : 'var(--wa-accent)'} fillOpacity="0.2" stroke={member ? 'var(--wa-info)' : 'var(--wa-accent)'} strokeWidth="2" strokeDasharray={member ? '4 2' : undefined} />
      {data.map((d, i) => {
        const p = pt(i, 1.25);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
          fontSize="17" fill="var(--wa-muted)">{d.axis}</text>;
      })}
    </svg>
  );
}

function DualRadarChart({ memberData, targetData, label, valuesId, captionId }: {
  memberData: { axis: string; value: number }[];
  targetData: { axis: string; value: number }[];
  label: string;
  valuesId: string;
  captionId: string;
}) {
  const descriptionId = useId();
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
    <svg className={`skill-mapper-radar-chart ${styles.radarChart}`} width={size} height={size} viewBox={`-18 0 ${size + 36} ${size}`} role="img" aria-label={label} aria-describedby={`${descriptionId} ${captionId}`} aria-details={valuesId}>
      <desc id={descriptionId}>Dashed line: estimated member profile. Solid line: occupation requirements. Exact percentages for both series are available in the View radar values disclosure below.</desc>
      {gridLevels.map(level => (
        <polygon key={level}
          points={axes.map((_, i) => { const p = pt(i, level); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke="var(--wa-border)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--wa-border)" strokeWidth="1" />;
      })}
      {/* Target occupation - accent/red */}
      <polygon
        points={axes.map((axis, i) => { const p = pt(i, getValue(targetData, axis)); return `${p.x},${p.y}`; }).join(' ')}
        fill="var(--wa-accent)" fillOpacity="0.15" stroke="var(--wa-accent)" strokeWidth="2" />
      {/* Member profile - blue */}
      <polygon
        points={axes.map((axis, i) => { const p = pt(i, getValue(memberData, axis)); return `${p.x},${p.y}`; }).join(' ')}
        fill="var(--wa-info)" fillOpacity="0.2" stroke="var(--wa-info)" strokeWidth="2" strokeDasharray="4 2" />
      {axes.map((axis, i) => {
        const p = pt(i, 1.25);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
          fontSize="17" fill="var(--wa-muted)">{axis}</text>;
      })}
    </svg>
  );
}

/** The numeric alternative uses exactly the same normalized series as the charts. */
function RadarValues({ id, targetData, memberData }: {
  id: string;
  targetData: { axis: string; value: number }[];
  memberData?: { axis: string; value: number }[];
}) {
  const t = useTranslations('memberWorkspace.exploration');
  const axes = [...new Set([...targetData, ...(memberData ?? [])].map(point => point.axis))];
  const valueFor = (series: { axis: string; value: number }[], axis: string) => {
    const value = series.find(point => point.axis === axis)?.value;
    return value === undefined ? '—' : `${Math.round(value * 100)}%`;
  };
  return (
    <details id={id} className={styles.numericDisclosure}>
      <summary className="wa-kit-focus">{t('graphValues')} <span className={styles.disclosureHint}>Exact values · 0–100 scale</span></summary>
      <section className={styles.numericContent} aria-label={memberData ? t('estimatedComparison') : t('occupationValues')}>
        <p className={styles.caption}>{memberData ? t('estimatedComparison') : t('occupationValues')}</p>
        <DataTable
        className={styles.radarValues}
        minWidth={0}
        density="compact"
        columns={[
          { key: 'axis', header: t('axis') },
          ...(memberData ? [{ key: 'member', header: t('memberEstimate'), numeric: true }] : []),
          { key: 'target', header: t('target'), numeric: true },
        ]}
        rows={axes.map(axis => ({ axis, member: memberData ? valueFor(memberData, axis) : '', target: valueFor(targetData, axis) }))}
        rowKey={row => row.axis}
        />
      </section>
    </details>
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
    <div className={styles.recommendations}>
      <h3 className={styles.subsectionTitle}>
        <BookOpen size={20} aria-hidden="true" />
        Courses to explore
      </h3>
      <p className={styles.sectionDescription}>
        Courses mapped to the skill areas with larger estimated differences.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {topGaps.map(gapAxis => (
          <div key={gapAxis} style={{ background: 'var(--wa-surface)', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div style={{
              padding: '0.5rem 0.75rem',
              background: 'color-mix(in srgb, var(--wa-accent) 8%, transparent)',
              borderBottom: '1px solid var(--wa-border)',
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 600,
              color: 'var(--wa-accent-text)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>{gapAxis}</span>
              <span style={{ color: 'var(--wa-muted)', fontWeight: 400 }}>
                ({Math.round(gaps.find(g => g.axis === gapAxis)?.gap || 0)}-point estimated difference)
              </span>
            </div>
            <div style={{ padding: '0.5rem' }}>
              {coursesByGap[gapAxis].slice(0, expanded ? 3 : 2).map((item, idx) => (
                <div key={item.course.courseSlug} className={styles.courseRow}>
                  <div style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    background: idx === 0 ? 'var(--wa-success-dark)' : 'var(--wa-border)',
                    color: idx === 0 ? 'var(--wa-on-success)' : 'var(--wa-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--wa-type-meta)',
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: '0.125rem'
                  }}>
                    {item.priority}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--wa-type-body)', fontWeight: 600, color: 'var(--wa-text)', lineHeight: 1.4 }}>
                      {item.course.courseName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={10} />
                        {item.course.estimatedHours} hrs
                      </span>
                      <span style={{
                        fontSize: 'var(--wa-type-meta)',
                        background: 'var(--wa-border)',
                        color: 'var(--wa-muted)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '999px'
                      }}>
                        {item.course.partner}
                      </span>
                      {idx === 0 && (
                        <span style={{
                          fontSize: 'var(--wa-type-meta)',
                          background: 'color-mix(in srgb, var(--wa-success) 15%, transparent)',
                          color: 'var(--wa-success-dark)',
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
                              fontSize: 'var(--wa-type-meta)',
                              color: 'var(--wa-muted)',
                              background: 'var(--wa-border)',
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
                    className={`${styles.courseAction} wa-kit-focus`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '0.375rem',
                      background: 'var(--wa-accent)',
                      color: 'var(--wa-on-accent-control)',
                      fontSize: 'var(--wa-type-body)',
                      fontWeight: 600,
                      textDecoration: 'none',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    View program <ArrowRight size={16} aria-hidden="true" />
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
            border: '1px solid var(--wa-border)',
            borderRadius: '0.5rem',
            background: 'transparent',
            color: 'var(--wa-muted)',
            fontSize: 'var(--wa-type-meta)',
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

export default function SkillMapperClient({ initialRun = null, initialTarget, selectionError, preview = false, initialMemberProfile }: {
  initialRun?: SavedSkillMapperRun | null;
  /** Credential-free /dev proof: never fetch, extract, save or export. */
  preview?: boolean;
  initialMemberProfile?: { axis: string; value: number }[];
  initialTarget?: { code: string; title: string };
  selectionError?: string;
} = {}) {
  const [activeTab, setActiveTab] = useState<'search' | 'profile'>('search');
  const tw = useTranslations('memberWorkspace.exploration');
  const ta = useTranslations('memberWorkspace.ai');
  const tt = useTranslations('trainingBridge');
  const [query, setQuery] = useState(initialTarget?.title ?? '');
  const [occupations, setOccupations] = useState<{ code: string; title: string; description: string }[]>([]);
  const [selectedTitle, setSelectedTitle] = useState(initialRun?.occupationTitle ?? '');
  const [selectedCode, setSelectedCode] = useState(initialRun?.occupationCode ?? '');
  const [radarData, setRadarData] = useState<{ axis: string; value: number }[]>(() => initialRun?.radarAxes.map(point => ({ axis: point.axis, value: point.value / 100 })) ?? []);
  const [skills, setSkills] = useState<{ name: string; score: number; importance: string }[]>(() => initialRun?.skills.map(skill => ({ ...skill, importance: skill.score >= 70 ? 'High' : skill.score >= 40 ? 'Medium' : 'Low' })) ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingComparison, setExportingComparison] = useState(false);
  const [error, setError] = useState('');
  const [usingDemo, setUsingDemo] = useState(initialRun?.demo ?? false);
  const [demoFallbackReason, setDemoFallbackReason] = useState<string>('');
  const [savedResultId, setSavedResultId] = useState<string | null>(initialRun?.id ?? null);
  const [saveUnavailable, setSaveUnavailable] = useState(false);
  const lookupSequence = useRef(0);
  const searchSequence = useRef(0);
  const chartId = useId();
  const occupationValuesId = `${chartId}-occupation-values`;
  const comparisonValuesId = `${chartId}-comparison-values`;
  const memberValuesId = `${chartId}-member-values`;
  const profilePanelRef = useRef<HTMLDivElement>(null);
  const comparisonHeadingRef = useRef<HTMLHeadingElement>(null);
  const comparisonFocusPending = useRef(false);

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
  const [memberProfile, setMemberProfile] = useState<{ axis: string; value: number }[]>(initialMemberProfile ?? []);
  const [memberCerts, setMemberCerts] = useState<string[]>([]);
  const [resumeSkills, setResumeSkills] = useState<{ axis: string; value: number }[]>([]);
  const [resumeMatchedKeywords, setResumeMatchedKeywords] = useState<Record<string, string[]>>({});
  const [hasInterestProfiler, setHasInterestProfiler] = useState(false);
  const [hasAiResumeExtraction, setHasAiResumeExtraction] = useState(false);
  const [extractingResume, setExtractingResume] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(Boolean(initialMemberProfile));
  const autoExtractAttemptedRef = useRef(false);
  const [autoExtracting, setAutoExtracting] = useState(false);

  const exportSkillMap = async () => {
    if (preview) return;
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
    if (preview) return;
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
    if (preview) return;
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

  useEffect(() => {
    if (activeTab !== 'profile') {
      comparisonFocusPending.current = false;
      return;
    }
    if (!comparisonFocusPending.current || loadingProfile || autoExtracting || (!preview && !profileLoaded)) return;
    const frame = requestAnimationFrame(() => {
      const destination = comparisonHeadingRef.current ?? profilePanelRef.current;
      if (!destination) return;
      comparisonFocusPending.current = false;
      destination.focus({ preventScroll: true });
      destination.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, loadingProfile, autoExtracting, preview, profileLoaded]);

  const handleAiExtract = async () => {
    if (preview) return;
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
    if (preview) return;
    if (!query.trim()) return;
    const requestId = ++searchSequence.current;
    ++lookupSequence.current;
    setLoadingSkills(false); setSavedResultId(null); setSaveUnavailable(false); setSelectedCode(''); setSelectedTitle('');
    setLoading(true); setError(''); setOccupations([]); setRadarData([]); setSkills([]); setDemoFallbackReason('');
    try {
      const res = await fetch(`/api/ai/skill-mapper?occupation=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (requestId !== searchSequence.current) return;
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
      if (requestId !== searchSequence.current) return;
      const useSales = isSalesQuery(query);
      setError('');
      setRadarData(useSales ? DEMO_SALES_RADAR : DEMO_RADAR);
      setSkills(useSales ? DEMO_SALES_SKILLS : DEMO_SKILLS);
      setUsingDemo(true);
      setDemoFallbackReason('Unable to connect to occupation database. Showing sample data for demonstration.');
      setSelectedTitle(useSales ? 'Sales Representative (Demo)' : 'Software Developer (Demo)');
    }
    if (requestId === searchSequence.current) setLoading(false);
  };

  const handleSelect = async (code: string, title: string) => {
    if (preview) return;
    const requestId = ++lookupSequence.current;
    ++searchSequence.current;
    setLoading(false); setSavedResultId(null); setSaveUnavailable(false); setRadarData([]); setSkills([]);
    setSelectedTitle(title); setSelectedCode(code); setLoadingSkills(true); setError(''); setUsingDemo(false); setMatchedPrograms([]); setDemoFallbackReason('');
    try {
      const res = await fetch(`/api/ai/skill-mapper?code=${encodeURIComponent(code)}&title=${encodeURIComponent(title)}`);
      const data = await res.json();
      if (requestId !== lookupSequence.current) return;
      if (data.radarAxes) {
        setSavedResultId(typeof data.resultId === 'string' && data.resultId ? data.resultId : null);
        setSaveUnavailable(!data.resultId);
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
      if (requestId !== lookupSequence.current) return;
      const useSales = isSalesQuery(title);
      setRadarData(useSales ? DEMO_SALES_RADAR : DEMO_RADAR);
      setSkills(useSales ? DEMO_SALES_SKILLS : DEMO_SKILLS);
      setUsingDemo(true);
      setDemoFallbackReason('Unable to load occupation details. Showing sample data for demonstration.');
    }
    if (requestId === lookupSequence.current) setLoadingSkills(false);
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

  return (
    <div className={styles.workspace}>
      <MemberCareerSteps current="skills" resultId={savedResultId} />
      {selectionError ? <p role="alert">{selectionError}</p> : null}
      {initialTarget && !selectedCode ? (
        <section className="wa-kit-card wa-kit-card--sm" style={{ marginBlock: 'var(--wa-pad-sm)' }}>
          <p><strong>{tw('targetFromInterests', { occupation: initialTarget.title })}</strong> · {initialTarget.code}</p>
          <p>{tw('loadTargetHelp')}</p>
          <Button label={tw('loadTarget')} onClick={() => void handleSelect(initialTarget.code, initialTarget.title)} isLoading={loadingSkills} isDisabled={preview} />
        </section>
      ) : null}
      {savedResultId && selectedTitle ? (
        <div className={styles.savedTarget}>
          <p><span className={styles.eyebrow}>Selected occupation</span><strong>{selectedTitle}</strong>{usingDemo ? ` · ${tw('sample')}` : ''}</p>
          <Link href={trainingBridgeHref(savedResultId)} className="wa-page-action wa-kit-focus">{tw('trainingForLookup')} <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      ) : null}
      {saveUnavailable ? <p role="status">{tw('saveUnavailable')}</p> : null}
      {/* Tab switcher */}
      <div className={styles.viewSwitcher} aria-label="Skill Mapper views">
        <button type="button" className="wa-kit-focus" aria-pressed={activeTab === 'search'} onClick={() => setActiveTab('search')}>
          Occupation Search
        </button>
        <button type="button" className="wa-kit-focus" aria-pressed={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>
          My Skills Profile
        </button>
      </div>

      {/* Tab 1: Occupation Search */}
      {activeTab === 'search' && (
        <div>
          <div className={styles.sectionIntro}>
            <h2>Explore an occupation</h2>
            <p>See the skills a role calls for, then compare them with your estimated profile.</p>
          </div>
          <div className={styles.searchRow}>
            <div className={styles.searchField}>
              <FormField
                label="Search an occupation"
                id="skill-mapper-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Software Developer"
              />
            </div>
            <button type="button" className={`${styles.searchAction} wa-kit-focus`} onClick={handleSearch} disabled={preview || loading || !query.trim()}
              style={{ ...primaryPillStyle, opacity: loading || !query.trim() ? 0.6 : 1, cursor: loading || !query.trim() ? 'not-allowed' : 'pointer' }}>
              {loading ? <PortalInlineSpinner size={16} /> : <Search size={16} aria-hidden />}
              Search
            </button>
          </div>

          {error && (
            <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--wa-radius-sm)', background: 'var(--wa-danger-soft)', color: 'var(--wa-danger)', fontSize: 'var(--wa-type-body)', fontWeight: 600, marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {occupations.length > 0 && !radarData.length && (
            <div className={styles.searchResults}>
              <h3>Select an occupation</h3>
              {occupations.map((occ) => (
                <button type="button" key={occ.code} disabled={preview} onClick={() => handleSelect(occ.code, occ.title)}
                  className={`${styles.occupationOption} wa-kit-focus`}>
                  <strong style={{ color: 'var(--wa-text)' }}>{occ.title}</strong>
                  <span style={{ display: 'block', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 2 }}>{occ.code} — {occ.description?.slice(0, 120)}</span>
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
                  fontSize: 'var(--wa-type-body)',
                  color: 'var(--wa-text)'}}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--wa-danger)' }}>
                    <TriangleAlert size={16} aria-hidden="true" />
                    DEMO MODE — Sample Data Only
                  </div>
                  <p style={{ margin: 0, lineHeight: 1.5 }}>
                    {demoFallbackReason || 'Showing sample skill ranges for demonstration purposes. This is not real occupational data from O*NET.'}
                  </p>
                  <p style={{ margin: '0.5rem 0 0', fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>
                    Try another occupation or return later for O*NET occupation data.
                  </p>
                </div>
              )}
              <section className={styles.resultPanel} aria-label="Occupation requirements">
              <div className={styles.resultHeading}>
                <div>
                  <p className={styles.eyebrow}>{usingDemo ? 'Sample occupation requirements' : 'Occupation requirements'}</p>
                  <h2>{selectedTitle}</h2>
                </div>
                {selectedCode && <span className={styles.occupationCode}>O*NET {selectedCode}</span>}
              </div>
              {isSalesQuery(selectedTitle) && (
                <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-border)', borderRadius: '0.75rem', fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>
                  Sales and account roles usually score strongest in <strong>Strategy</strong> and <strong>Service</strong> here because this map weighs planning, negotiation, communication, and relationship-building, not just technical tools.
                </div>
              )}
              <div className={styles.occupationGrid}>
                <figure className={styles.chartFigure}>
                  <h3>Skill areas</h3>
                  <RadarChart data={radarData} label={`Skill requirements for ${selectedTitle || 'the selected occupation'}`} valuesId={occupationValuesId} captionId={`${chartId}-occupation-caption`} />
                  <figcaption id={`${chartId}-occupation-caption`}>Higher values mean an area matters more for this occupation.</figcaption>
                </figure>
                <div className={styles.skillList}>
                  <h3>Top skills for this role</h3>
                  <p className={styles.caption}>Occupation requirements, shown on a 0–100 scale.</p>
                  {skills.map((s) => (
                    <div key={s.name} className={styles.skillRow}>
                      <div className={styles.skillRowLabel}>
                        <span>{s.name}</span>
                        <span className={styles.numericValue}>{s.score}%</span>
                      </div>
                      <div className={styles.skillTrack} aria-hidden="true">
                        <div className={styles.requirementFill} style={{ width: `${s.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <RadarValues id={occupationValuesId} targetData={radarData} />
              <AxisLegend axes={radarData.map(d => d.axis)} />
              </section>

              {/* Export + profile compare prompt */}
              <div className={styles.resultActions}>
                <button type="button" onClick={() => { comparisonFocusPending.current = true; setActiveTab('profile'); }} className="wa-kit-focus" style={primaryPillStyle}>
                  <ArrowLeftRight size={18} aria-hidden="true" />
                  Compare with my profile
                </button>
                <button
                  type="button"
                  onClick={() => void exportSkillMap()}
                  disabled={preview || exportingPdf}
                  aria-busy={exportingPdf}
                  className="wa-kit-focus"
                  style={{ ...outlinePillStyleSm, cursor: exportingPdf ? 'default' : 'pointer', opacity: exportingPdf ? 0.6 : 1 }}
                >
                  {exportingPdf ? <PortalInlineSpinner size={14} /> : <Download size={14} aria-hidden="true" />}
                  <span aria-live="polite">
                    {exportingPdf ? 'Saving…' : 'Export Skill Map PDF'}
                  </span>
                </button>
              </div>
              <div className={styles.followThrough}>
                <ToolFollowThrough toolType="skill_mapper" />
              </div>

              {/* Programs that lead to this occupation (from DB career mappings) */}
              {matchedPrograms.length > 0 && (
                <div className={styles.recommendations}>
                  <h3 className={styles.subsectionTitle}>
                    Programs for this career
                  </h3>
                  <p className={styles.sectionDescription}>
                    WorkforceAP programs that prepare you for <strong>{selectedTitle}</strong>
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {matchedPrograms.map((mp) => (
                      <div key={`${mp.programSlug}-${mp.experienceBand}`} className={styles.programRecommendation}>
                        <BookOpen size={24} className={styles.programIcon} aria-hidden="true" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={styles.programTitle}>
                            {mp.programTitle}
                          </div>
                          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                            <span style={{
                              background: `color-mix(in srgb, ${mp.categoryColor} 12%, transparent)`,
                              color: mp.categoryColor,
                              borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: 'var(--wa-type-meta)', fontWeight: 600}}>{mp.categoryLabel}</span>
                            <span style={{
                              background: mp.recommendationType === 'primary'
                                ? 'color-mix(in srgb, var(--wa-success) 12%, transparent)'
                                : mp.recommendationType === 'bridge'
                                ? 'color-mix(in srgb, var(--wa-info) 12%, transparent)'
                                : 'color-mix(in srgb, var(--wa-gold) 12%, transparent)',
                              color: mp.recommendationType === 'primary'
                                ? 'var(--wa-success-dark)'
                                : mp.recommendationType === 'bridge'
                                ? 'var(--wa-info-dark)'
                                : 'var(--wa-gold-dark)',
                              borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: 'var(--wa-type-meta)', fontWeight: 600, textTransform: 'capitalize'}}>{mp.recommendationType}</span>
                            <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                              {mp.experienceBand.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {mp.whyRecommended && (
                            <div style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                              {mp.whyRecommended}
                            </div>
                          )}
                        </div>
                        <Link href={`/programs/${mp.programSlug}`} className={`${styles.programAction} wa-kit-cta--ghost wa-kit-focus`} onClick={() => trackFunnelEvent('skill_mapper', 'program_recommendation_viewed', { program_slug: mp.programSlug, recommendation_type: mp.recommendationType })}>View <ArrowRight size={16} aria-hidden="true" /></Link>
                      </div>
                    ))}
                  </div>
                  {/* Enrollment CTAs */}
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--wa-accent-soft)', border: '1px solid var(--wa-border)', borderRadius: '0.75rem' }}>
                    <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', marginBottom: '0.5rem' }}>
                      Ready to start your training?
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link href={`/programs/${matchedPrograms[0].programSlug}`} className="wa-kit-focus" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        minHeight: 44,
                        padding: '0.5rem 1rem', borderRadius: 999,
                        background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                        fontWeight: 700, fontSize: 'var(--wa-type-body)', textDecoration: 'none'}} onClick={() => trackFunnelEvent('skill_mapper', 'enroll_cta_clicked', { program_slug: matchedPrograms[0].programSlug })}>
                        {tw('exploreProgram', { program: matchedPrograms[0].programTitle })}
                      </Link>
                      <Link href="/dashboard/messages" className="wa-kit-focus" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        minHeight: 44,
                        padding: '0.5rem 1rem', borderRadius: 999,
                        background: 'var(--wa-surface-2)', color: 'var(--wa-text)',
                        fontWeight: 600, fontSize: 'var(--wa-type-body)', textDecoration: 'none'}} onClick={() => trackFunnelEvent('skill_mapper', 'counselor_cta_clicked', {})}>
                        {ta('humanLink')}
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
        <div ref={profilePanelRef} tabIndex={-1} role="region" aria-label="My skills profile" className={`${styles.focusTarget} wa-kit-focus`}>
          {loadingProfile && (
            <p style={{ textAlign: 'center', padding: '2rem' }}><PortalInlineSpinner size={24} /></p>
          )}

          {!loadingProfile && autoExtracting && (
            <div style={{ padding: '1rem 1.25rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-border)', borderRadius: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
              <PortalInlineSpinner size={20} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', margin: '0 0 0.2rem' }}>
                  Analyzing your resume with AI…
                </p>
                <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: 0, lineHeight: 1.4 }}>
                  Extracting skills and mapping them to your estimated profile.
                </p>
              </div>
            </div>
          )}

          {!loadingProfile && memberProfile.length > 0 && memberProfile.some(p => p.value > 0) && (
            <>
              {/* Dual radar or single radar */}
              {radarData.length > 0 ? (
                <section className={styles.resultPanel} aria-label="Your profile comparison">
                  <div className={styles.resultHeading}>
                    <div>
                      <p className={styles.eyebrow}>Your profile comparison{usingDemo ? ' · Sample occupation data' : ''}</p>
                      <h2 ref={comparisonHeadingRef} tabIndex={-1} className={`${styles.focusTarget} wa-kit-focus`}>Your Skills vs. {selectedTitle || 'Target Occupation'}</h2>
                    </div>
                  </div>
                  <div className={styles.comparisonGrid}>
                    <figure className={styles.chartFigure}>
                      <DualRadarChart memberData={memberProfile} targetData={radarData} label={`Estimated profile compared with ${selectedTitle || 'the selected occupation'}`} valuesId={comparisonValuesId} captionId={`${chartId}-comparison-caption`} />
                      <figcaption id={`${chartId}-comparison-caption`}>Compare the shape of both profiles across the same skill areas.</figcaption>
                    </figure>
                    <div className={styles.comparisonContext}>
                      <h3>How to read this comparison</h3>
                      <dl className={styles.seriesLegend}>
                        <div>
                          <dt><span className={styles.memberSwatch} aria-hidden="true" />Your estimated profile</dt>
                          <dd>Signals from your available resume, certifications, and Interest Profiler results.</dd>
                        </div>
                        <div>
                          <dt><span className={styles.requirementSwatch} aria-hidden="true" />Occupation requirements</dt>
                          <dd>How much each skill area matters for {selectedTitle || 'the selected role'}.</dd>
                        </div>
                      </dl>
                      <p className={styles.comparisonNote}>Use the differences to explore training. They do not measure demonstrated proficiency or readiness for a job.</p>
                    </div>
                  </div>
                  <RadarValues id={comparisonValuesId} targetData={radarData} memberData={memberProfile} />
                  <div className={styles.comparisonFooter}>
                    <button
                      type="button"
                      onClick={() => void exportComparisonPdf()}
                      disabled={preview || exportingComparison}
                      aria-busy={exportingComparison}
                      className="wa-kit-focus"
                      style={{ ...outlinePillStyleSm, cursor: exportingComparison ? 'default' : 'pointer', opacity: exportingComparison ? 0.6 : 1 }}
                    >
                      {exportingComparison ? <PortalInlineSpinner size={14} /> : <Download size={14} aria-hidden="true" />}
                      <span aria-live="polite">
                        {exportingComparison ? 'Saving…' : 'Export Comparison PDF'}
                      </span>
                    </button>
                    <p className={styles.caption}>Update your records to give this estimate more context.</p>
                  </div>
                  <div className={styles.profileLinks}>
                    <a href="/dashboard/learning/interest-profiler" className="wa-page-action wa-kit-focus">Complete the Interest Profiler <ArrowRight size={16} aria-hidden="true" /></a>
                    <a href="/dashboard/resume" className="wa-page-action wa-kit-focus">Update your resume <ArrowRight size={16} aria-hidden="true" /></a>
                  </div>
                </section>
              ) : (
                <section className={styles.resultPanel} aria-label="Your estimated skill profile">
                  <div className={styles.resultHeading}>
                    <div><p className={styles.eyebrow}>Your available records</p><h2 ref={comparisonHeadingRef} tabIndex={-1} className={`${styles.focusTarget} wa-kit-focus`}>Your estimated skill profile</h2></div>
                  </div>
                  <div className={styles.occupationGrid}>
                    <figure className={styles.chartFigure}>
                      <RadarChart data={memberProfile} member label="Your estimated skill profile" valuesId={memberValuesId} captionId={`${chartId}-member-caption`} />
                      <figcaption id={`${chartId}-member-caption`}>An estimate from your records, not a proficiency assessment.</figcaption>
                    </figure>
                    <div id={memberValuesId} className={styles.skillList}>
                      <h3>Profile by skill area</h3>
                      {memberProfile.map(d => (
                        <div key={d.axis} className={styles.skillRow}>
                          <div className={styles.skillRowLabel}>
                            <span>{d.axis}</span>
                            <span className={styles.numericValue}>{Math.round(d.value * 100)}%</span>
                          </div>
                          <div className={styles.skillTrack} aria-hidden="true">
                            <div className={styles.memberFill} style={{ width: `${Math.round(d.value * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className={styles.caption}>
                    Search an occupation in the <strong>Occupation Search</strong> tab to compare your skills against a target role.
                  </p>
                </section>
              )}

              {/* Earned certs */}
              {memberCerts.length > 0 && (
                <div className={styles.profileRecords}>
                  <h3 style={{ marginBottom: '0.75rem' }}>Earned certifications</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {memberCerts.map(cert => (
                      <span key={cert} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: 'color-mix(in srgb, var(--wa-success) 12%, transparent)', color: 'var(--wa-success)',
                        borderRadius: '999px', padding: '0.25rem 0.75rem', fontSize: 'var(--wa-type-meta)', fontWeight: 600}}>
                        <CheckCircle2 size={13} aria-hidden="true" />
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {memberCerts.length === 0 && (
                <p className={styles.profileRecords} style={{ color: 'var(--wa-muted)' }}>
                  No certifications on file —{' '}
                  <a href="/dashboard/certifications" className="wa-page-action wa-kit-focus">add certs in Verification Vault</a>
                  {' '}to strengthen your radar.
                </p>
              )}

              {/* Gap analysis */}
              {gaps.length > 0 && (
                <section className={styles.gapsSection} aria-label="Estimated skill differences">
                  <div className={styles.sectionIntro}>
                    <p className={styles.eyebrow}>Plan your next step</p>
                    <h3>Skill Gaps to Close</h3>
                    <p>These are differences between your estimated profile and the role’s requirements. Use them as starting points for a training conversation.</p>
                  </div>
                  <div className={styles.gapGrid}>
                  {gaps.map(g => (
                    <div key={g.axis} className={styles.gapRow}>
                      <div className={styles.skillRowLabel}>
                        <strong>{g.axis}</strong>
                        <span className={styles.gapDifference}>{Math.round(g.gap)}-point difference</span>
                      </div>
                      <div className={styles.gapSeries}>
                        <div><span>Your estimate</span><span className={styles.skillTrack} aria-hidden="true"><span className={styles.memberFill} style={{ width: `${g.member}%` }} /></span><strong>{Math.round(g.member)}%</strong></div>
                        <div><span>Requirement</span><span className={styles.skillTrack} aria-hidden="true"><span className={styles.requirementFill} style={{ width: `${g.target}%` }} /></span><strong>{Math.round(g.target)}%</strong></div>
                      </div>
                    </div>
                  ))}
                  </div>
                </section>
              )}

              {/* Program recommendations based on skill gaps */}
              {programRecs.length > 0 && (
                <div className={styles.recommendations}>
                  <h3 className={styles.subsectionTitle}>Recommended programs</h3>
                  <p className={styles.sectionDescription}>
                    WorkforceAP programs mapped to the skill areas in your comparison.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {programRecs.map((rec) => (
                      <div key={rec.program.slug} className={styles.programRecommendation}>
                        <BookOpen size={24} className={styles.programIcon} aria-hidden="true" />
                        <div style={{ minWidth: 0 }}>
                          <div className={styles.programTitle}>
                            {rec.program.title}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                            <span style={{
                              background: `color-mix(in srgb, ${rec.program.categoryColor} 12%, transparent)`,
                              color: rec.program.categoryColor,
                              borderRadius: '999px', padding: '0.125rem 0.5rem', fontSize: 'var(--wa-type-meta)', fontWeight: 600}}>{rec.program.categoryLabel}</span>
                            <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                              {rec.reason}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.375rem', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                            <span>{rec.program.duration}</span>
                            <span>{rec.program.partner}</span>
                          </div>
                        </div>
                        <a href={`/programs/${rec.program.slug}`} className={`${styles.programAction} wa-kit-cta--ghost wa-kit-focus`}>{tt('viewProgram')} <ArrowRight size={16} aria-hidden="true" /></a>
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
            <div style={{ padding: '1.5rem', color: 'var(--wa-muted)' }}>
              <h2 ref={comparisonHeadingRef} tabIndex={-1} className={`${styles.focusTarget} wa-kit-focus`} style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', marginBottom: '0.875rem' }}>Build your skill profile</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <a href="/dashboard/learning/interest-profiler" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem', background: 'var(--wa-accent-soft)', border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)', textDecoration: 'none' }}>
                  <ListChecks size={20} aria-hidden="true" style={{ color: 'var(--wa-accent)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-accent)', margin: '0 0 0.2rem' }}>Take the 30-question Interest Profiler</p>
                    <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: 0 }}>About 10 minutes — adds O*NET interest data to your estimated profile</p>
                  </div>
                </a>
                <a href="/dashboard/resume?view=rewrite" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem', background: 'var(--wa-surface)', border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)', textDecoration: 'none' }}>
                  <FileText size={20} aria-hidden="true" style={{ color: 'var(--wa-info)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', margin: '0 0 0.2rem' }}>Run the AI Resume Rewriter</p>
                    <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: 0 }}>We extract skills from your resume and map them to this radar automatically</p>
                  </div>
                </a>
                <a href="/dashboard/certifications" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem', background: 'var(--wa-surface)', border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)', textDecoration: 'none' }}>
                  <Award size={20} aria-hidden="true" style={{ color: 'var(--wa-success)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', margin: '0 0 0.2rem' }}>Add earned certifications</p>
                    <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: 0 }}>Certs like CompTIA A+, IBM AI, Google Data Analytics enrich the Engineering and Analytics axes</p>
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
                <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', margin: '0 0 0.25rem' }}>
                  Take the 30-question Interest Profiler
                </p>
                <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                  Complete the O*NET Interest Profiler to add interest-based signals alongside your available resume and certification records.
                </p>
                <a href="/dashboard/learning/interest-profiler" className="wa-kit-focus" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, gap: '0.35rem', padding: '0.4rem 0.875rem', borderRadius: 999, background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)', fontWeight: 700, fontSize: 'var(--wa-type-body)', textDecoration: 'none' }}>
                  <ArrowRight size={15} aria-hidden="true" />
                  Start 30-question assessment (~10 min)
                </a>
              </div>
            </div>
          )}

          {/* IP complete confirmation */}
          {!loadingProfile && profileLoaded && hasInterestProfiler && (
            <div style={{ marginTop: '0.875rem', padding: '0.75rem 1rem', background: 'color-mix(in srgb, var(--wa-success) 8%, transparent)', border: '1px solid var(--wa-success)', borderRadius: 'var(--wa-radius-sm)', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <CheckCircle2 size={16} aria-hidden="true" style={{ color: 'var(--wa-success)', flexShrink: 0 }} />
              <span><strong style={{ color: 'var(--wa-success)' }}>Interest Profiler complete</strong> — your 30-question results are blended into this radar.{' '}
                <a href="/dashboard/learning/interest-profiler" className="wa-page-action wa-kit-focus">Retake</a>
              </span>
            </div>
          )}

          {/* Resume skill source transparency */}
          {!loadingProfile && resumeSkills.length > 0 && resumeSkills.some(r => r.value > 0) && (
            <div style={{ marginTop: '0.875rem', padding: '0.875rem 1rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-info)', borderRadius: 'var(--wa-radius-sm)' }}>
              <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-info)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {hasAiResumeExtraction ? <Sparkles size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                {hasAiResumeExtraction ? 'AI-extracted resume skills' : 'Resume skills detected'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {resumeSkills.filter(r => r.value > 0).map(r => {
                  const keywords = (resumeMatchedKeywords as Record<string, string[]>)[r.axis] ?? [];
                  return (
                    <div key={r.axis} style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--wa-text)' }}>{r.axis}:</span>{' '}
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
                    disabled={preview || extractingResume}
                    className="wa-kit-focus"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.35rem 0.75rem', borderRadius: 999,
                      background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                      fontWeight: 700, fontSize: 'var(--wa-type-body)', border: 'none',
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
                    disabled={preview || extractingResume}
                    className="wa-kit-focus"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.45rem 0.9rem', borderRadius: 999,
                      background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                      fontWeight: 800, fontSize: 'var(--wa-type-body)', border: 'none',
                      cursor: extractingResume ? 'default' : 'pointer',
                      opacity: extractingResume ? 0.6 : 1}}
                  >
                    {extractingResume ? <PortalInlineSpinner size={14} /> : <RotateCw size={14} aria-hidden="true" />}
                    {extractingResume ? 'Re-analyzing…' : 'Reanalyze resume skills'}
                  </button>
                )}
                <a href="/dashboard/resume?view=rewrite" className="wa-page-action wa-kit-focus">Update resume</a>
              </div>
            </div>
          )}

          {/* Show AI extraction CTA when no resume skills at all but profile exists */}
          {!loadingProfile && profileLoaded && memberProfile.some(p => p.value > 0) && !hasAiResumeExtraction && resumeSkills.every(r => r.value === 0) && (
            <div style={{ marginTop: '0.875rem', padding: '0.875rem 1rem', background: 'var(--wa-info-soft)', border: '1px solid var(--wa-info)', borderRadius: 'var(--wa-radius-sm)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Sparkles size={20} aria-hidden="true" style={{ color: 'var(--wa-info)', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', margin: '0 0 0.25rem' }}>
                  Enhance your profile with AI
                </p>
                <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
                  Upload a resume so AI can identify skills across the six areas and add context to your estimated profile.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a href="/dashboard/resume" className="wa-kit-focus" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    minHeight: 44,
                    padding: '0.35rem 0.75rem', borderRadius: 999,
                    background: 'var(--wa-accent)', color: 'var(--wa-on-accent-control)',
                    fontWeight: 700, fontSize: 'var(--wa-type-body)', textDecoration: 'none'}}>
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
