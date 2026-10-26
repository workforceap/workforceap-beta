'use client';

import { formatPortalDate } from '@/lib/formatDate';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GitBranch, GraduationCap } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import {
  TRAINING_BRIDGE_OCCUPATIONS,
  computeBridgeGap,
  findBridgeOccupation,
  getBridgeOccupationById,
  getBridgeProgram,
  type BridgeSkill,
} from '@/lib/content/trainingBridge';
import { FormField, StatusTag, type KitTone } from '@/components/portal/kit';
import type { SavedSkillMapperRun } from '@/lib/member/skillMapperRun';
import { skillMapperHref } from '@/lib/member/memberWorkspace';
import styles from './MemberWorkspace.module.css';

export type SavedAssessment = SavedSkillMapperRun;

type Props = {
  /** Exact owned saved lookup selected in the URL; never an implicit latest run. */
  assessment: SavedAssessment | null;
  recentAssessments?: SavedAssessment[];
  selectionUnavailable?: boolean;
  loadFailed?: boolean;
};

const primaryPillStyle = {
  minHeight: 48,
  flex: '1 1 220px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
  background: 'var(--wa-accent-fill)',
  color: 'var(--wa-on-accent-control)',
  fontWeight: 700,
  fontSize: '0.85rem',
  borderRadius: 999,
  textDecoration: 'none',
} as const;

const outlinePillStyle = {
  minHeight: 48,
  flex: '1 1 220px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontWeight: 700,
  fontSize: '0.85rem',
  borderRadius: 999,
  border: '1px solid var(--wa-control-border)',
  textDecoration: 'none',
} as const;

function SkillChips({ skills, tone }: { skills: BridgeSkill[]; tone: KitTone }) {
  return (
    <div className="wa-flex wa-flex-wrap" style={{ gap: '0.4rem' }}>
      {skills.map((s) => (
        <StatusTag key={s.name} tone={tone}>
          {s.name}
        </StatusTag>
      ))}
    </div>
  );
}

export default function TrainingBridgeClient({ assessment, recentAssessments = [], selectionUnavailable = false, loadFailed = false }: Props) {
  const t = useTranslations('trainingBridge');
  const tw = useTranslations('memberWorkspace.training');
  const te = useTranslations('memberWorkspace.exploration');
  const [selectedRunId, setSelectedRunId] = useState(assessment?.id ?? '');

  const matchedFromAssessment = useMemo(
    () =>
      assessment
        ? findBridgeOccupation(assessment.occupationCode, assessment.occupationTitle)
        : null,
    [assessment]
  );

  const [selectedId, setSelectedId] = useState<string>(
    matchedFromAssessment?.id ?? TRAINING_BRIDGE_OCCUPATIONS[0].id
  );
  const occupation = getBridgeOccupationById(selectedId) ?? TRAINING_BRIDGE_OCCUPATIONS[0];
  const program = getBridgeProgram(occupation);

  // These are occupational requirements from the selected lookup, not proof
  // that the member has mastered them. The UI names that distinction below.
  const hasLookupSkills = !!assessment && assessment.skills.length > 0;
  const gap = useMemo(
    () =>
      hasLookupSkills
        ? computeBridgeGap(assessment!.skills, occupation)
        : { missingSkills: occupation.requiredSkills, haveSkills: [] },
    [hasLookupSkills, assessment, occupation]
  );

  const coveredMissing = gap.missingSkills.filter((s) => occupation.pathwayCovers.includes(s.name));
  const missingNames = coveredMissing.map((s) => s.name).join(', ');

  return (
    <div className="wa-space-y-4">
      {loadFailed ? <p role="alert">{tw('loadFailed')}</p> : null}
      {selectionUnavailable ? <p role="alert">{tw('selectionUnavailable')}</p> : null}
      {recentAssessments.length > 0 ? (
        <form action="/dashboard/ai-tools/training-bridge" method="get" className={styles.controls}>
          <FormField label={tw('chooseLookup')} id="training-bridge-result">
            <select id="training-bridge-result" name="result" value={selectedRunId} onChange={event => setSelectedRunId(event.target.value)} required className="wa-kit-focus" style={{ width: '100%', minHeight: 48, padding: '0.55rem 0.75rem', border: '1px solid var(--wa-control-border)', borderRadius: 'var(--wa-radius-sm)', background: 'var(--wa-surface)', color: 'var(--wa-text)', fontSize: 'var(--wa-type-body)' }}>
              <option value="">{tw('selectLookup')}</option>
              {recentAssessments.map(run => <option key={run.id} value={run.id}>{run.occupationTitle} · {formatPortalDate(run.createdAt)}{run.demo ? ` · ${te('sample')}` : ''}</option>)}
            </select>
          </FormField>
          <Button type="submit" label={tw('useLookup')} isDisabled={!selectedRunId} />
        </form>
      ) : null}
      {/* ── Where the data comes from ── */}
      {assessment ? (
        <div className="wa-kit-card wa-kit-card--sm">
          <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            <strong>{tw('selectedLookup', { occupation: assessment!.occupationTitle })}</strong> · {assessment!.occupationCode} · {formatPortalDate(assessment!.createdAt)}
             · {assessment!.demo ? te('sample') : tw('occupationRequirements')}
          </p>
          <p className={styles.context}>{tw('lookupMeaning')}</p>
          <Link href={skillMapperHref({ resultId: assessment!.id })} className="wa-page-action wa-kit-focus">{te('openComparison')}</Link>
        </div>
      ) : (
        <div className="wa-kit-card">
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--wa-text)' }}>
            {tw('exploreTitle')}
          </h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            {tw('exploreBody')}
          </p>
          <Link href="/dashboard/ai-tools/skill-mapper" className="wa-kit-focus" style={outlinePillStyle}>
            <GitBranch size={16} aria-hidden="true" />
            {t('runSkillMapper')}
          </Link>
        </div>
      )}

      {/* ── Target job picker ── */}
      <div className="wa-kit-card">
        <FormField label={t('pickOccupationLabel')} id="training-bridge-occupation">
          <select
            id="training-bridge-occupation"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              marginTop: 4,
              width: '100%',
              minHeight: 48,
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--wa-radius-sm)',
              border: '1px solid var(--wa-control-border)',
              background: 'var(--wa-surface)',
              color: 'var(--wa-text)',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            {TRAINING_BRIDGE_OCCUPATIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.occupationTitle}
              </option>
            ))}
          </select>
        </FormField>
        {matchedFromAssessment && matchedFromAssessment.id !== selectedId && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>
            {t('assessmentMatchedHint', { occupation: matchedFromAssessment.occupationTitle })}
          </p>
        )}
        {assessment && !matchedFromAssessment ? <p className={styles.context}>{tw('unmapped', { occupation: assessment.occupationTitle })}</p> : null}
      </div>

      {/* ── Gap summary ── */}
      <div className="wa-kit-card">
        {gap.missingSkills.length > 0 ? (
          <>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: 'var(--wa-text)' }}>
              {hasLookupSkills
                ? tw('unmatchedRequirements', { occupation: occupation.occupationTitle })
                : t('skillsNeededTitle', { occupation: occupation.occupationTitle })}
            </h2>
            <SkillChips skills={gap.missingSkills} tone="alert" />
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: 'var(--wa-text)' }}>
              {tw('allMatched')}
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
              {tw('matchingNotice')}
            </p>
          </>
        )}

        {hasLookupSkills && gap.haveSkills.length > 0 && (
          <div style={{ marginTop: '0.9rem' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--wa-text)' }}>
              {tw('represented')}
            </p>
            <SkillChips skills={gap.haveSkills} tone="ok" />
          </div>
        )}
      </div>

      {/* ── Pathway + enroll CTA ── */}
      {program && (
        <div className="wa-kit-card">
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wa-accent)' }}>
            {t('pathwayEyebrow')}
          </p>
          <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem', fontWeight: 800, color: 'var(--wa-text)' }}>
            {program.title}
          </h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--wa-muted)' }}>
            {t('pathwayMeta', { partner: program.partner, duration: program.duration })}
          </p>

          <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-text)' }}>
            {gap.missingSkills.length > 0 && coveredMissing.length > 0 && hasLookupSkills
              ? tw('pathwayMatches', { skills: missingNames })
              : t('pathwayCovers')}
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <SkillChips
              skills={occupation.requiredSkills.filter((s) => occupation.pathwayCovers.includes(s.name))}
              tone="info"
            />
          </div>

          <div className="wa-flex wa-flex-wrap" style={{ gap: '0.6rem' }}>
            <Link href="/dashboard/program" className="wa-kit-focus" style={primaryPillStyle}>
              <GraduationCap size={16} aria-hidden="true" />
              {tw('assignedProgram')}
            </Link>
            <Link href={`/programs/${program.slug}`} className="wa-kit-focus" style={outlinePillStyle}>
              {t('viewProgram')}
            </Link>
          </div>
          <div className={styles.navigation}>
            <Link href="/dashboard/messages" className="wa-kit-focus">{tw('humanCounselor')}</Link>
            <Link href="/dashboard/learning" className="wa-kit-focus">{tw('learning')}</Link>
            <Link href={`/apply?program=${program.slug}`} className="wa-kit-focus">{tw('application')}</Link>
          </div>

          <p style={{ margin: '0.85rem 0 0', fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            {t('disclaimer')} {tw('unchangedAssignment')}
          </p>
        </div>
      )}
    </div>
  );
}
