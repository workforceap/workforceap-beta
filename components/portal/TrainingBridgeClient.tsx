'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GitBranch, GraduationCap } from 'lucide-react';
import {
  TRAINING_BRIDGE_OCCUPATIONS,
  computeBridgeGap,
  findBridgeOccupation,
  getBridgeOccupationById,
  getBridgeProgram,
  type BridgeSkill,
  type MemberSkill,
} from '@/lib/content/trainingBridge';
import { FormField, StatusTag, type KitTone } from '@/components/portal/kit';

export type SavedAssessment = {
  occupationTitle: string | null;
  occupationCode: string | null;
  skills: MemberSkill[];
  createdAt: string;
};

type Props = {
  /** Most recent saved Skill Mapper run, or null when the member has none. */
  assessment: SavedAssessment | null;
};

const primaryPillStyle = {
  minHeight: 48,
  flex: '1 1 220px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
  background: 'var(--wa-accent)',
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
  border: '1px solid var(--wa-border)',
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

export default function TrainingBridgeClient({ assessment }: Props) {
  const t = useTranslations('trainingBridge');

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

  // Personalized only when the member's assessment is being compared.
  const personalized = !!assessment && assessment.skills.length > 0;
  const gap = useMemo(
    () =>
      personalized
        ? computeBridgeGap(assessment!.skills, occupation)
        : { missingSkills: occupation.requiredSkills, haveSkills: [] },
    [personalized, assessment, occupation]
  );

  const coveredMissing = gap.missingSkills.filter((s) => occupation.pathwayCovers.includes(s.name));
  const missingNames = gap.missingSkills.map((s) => s.name).join(', ');

  return (
    <div className="wa-space-y-4">
      {/* ── Where the data comes from ── */}
      {personalized ? (
        <div className="wa-kit-card wa-kit-card--sm">
          <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            {t('basedOn', {
              occupation: assessment!.occupationTitle ?? t('yourLastRun'),
              date: new Date(assessment!.createdAt).toLocaleDateString(),
            })}
          </p>
        </div>
      ) : (
        <div className="wa-kit-card">
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--wa-text)' }}>
            {t('noAssessmentTitle')}
          </h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            {t('noAssessmentBody')}
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
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              marginTop: 4,
              width: '100%',
              minHeight: 48,
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--wa-radius-sm)',
              border: '1px solid var(--wa-border)',
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
      </div>

      {/* ── Gap summary ── */}
      <div className="wa-kit-card">
        {gap.missingSkills.length > 0 ? (
          <>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: 'var(--wa-text)' }}>
              {personalized
                ? t('missingTitle', { count: gap.missingSkills.length, occupation: occupation.occupationTitle })
                : t('skillsNeededTitle', { occupation: occupation.occupationTitle })}
            </h2>
            <SkillChips skills={gap.missingSkills} tone="alert" />
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: 'var(--wa-text)' }}>
              {t('allCoveredTitle', { occupation: occupation.occupationTitle })}
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
              {t('allCoveredBody')}
            </p>
          </>
        )}

        {personalized && gap.haveSkills.length > 0 && (
          <div style={{ marginTop: '0.9rem' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--wa-text)' }}>
              {t('haveTitle')}
            </p>
            <SkillChips skills={gap.haveSkills} tone="ok" />
          </div>
        )}
      </div>

      {/* ── Pathway + enroll CTA ── */}
      {program && (
        <div className="wa-kit-card" style={{ borderLeft: '4px solid var(--wa-accent)' }}>
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
            {gap.missingSkills.length > 0 && coveredMissing.length > 0 && personalized
              ? t('pathwayCoversMissing', { skills: missingNames })
              : t('pathwayCovers')}
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <SkillChips
              skills={occupation.requiredSkills.filter((s) => occupation.pathwayCovers.includes(s.name))}
              tone="info"
            />
          </div>

          <div className="wa-flex wa-flex-wrap" style={{ gap: '0.6rem' }}>
            <Link href={`/apply?program=${program.slug}`} className="wa-kit-focus" style={primaryPillStyle}>
              <GraduationCap size={16} aria-hidden="true" />
              {t('enrollCta')}
            </Link>
            <Link href={`/programs/${program.slug}`} className="wa-kit-focus" style={outlinePillStyle}>
              {t('viewProgram')}
            </Link>
          </div>

          <p style={{ margin: '0.85rem 0 0', fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            {t('disclaimer')}
          </p>
        </div>
      )}
    </div>
  );
}
