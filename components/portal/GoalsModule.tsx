'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, CirclePlus, Flag, Sparkles } from 'lucide-react';
import { colorVar } from '@/components/portal/kit/tokens';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';

type Step = {
  id: string;
  text: string;
  done: boolean;
};

type Goal = {
  id: string;
  goalType: string;
  title: string;
  description: string | null;
  currentMetricValue: number;
  targetMetricValue: number | null;
  status: string;
  steps: Step[];
};

type Suggestion = {
  key: string;
  goalType: string;
  title: string;
  reason: string;
};

const GOAL_TEMPLATE_TYPES = [
  'build_resume',
  'practice_interviews',
  'apply_to_jobs',
  'complete_certification',
  'finish_pathway',
  'linkedin_profile',
  'tech_readiness',
  'career_pivot',
] as const;

// Kit tokens and classes only (docs/KIT_GUIDE.md §1, §7): no legacy `--color-*`
// reads and no `.goals-*` class hooks (the legacy ones in
// css/portal-main-extracted.css were removed with the legacy home, WAP-195).
// The card mounts once, on /dashboard/career-brief#goals.
const ACCENT = colorVar('accent');
const ACCENT_DARK = colorVar('accentDark');
const MUTED = colorVar('muted');
const TEXT = colorVar('text');
/** Kit pills carry no disabled look of their own; dim them the way `.btn:disabled` did. */
const CTA = 'wa-kit-cta wa-kit-focus disabled:wa-opacity-50 disabled:wa-cursor-not-allowed';
const GHOST_CTA = `${CTA} wa-kit-cta--ghost`;
/** `.wa-kit-control` edges with the decorative hairline; form fields take the 3:1 control border. */
const CONTROL_STYLE = { marginTop: 0, borderColor: 'var(--wa-control-border)' } as const;
/** A visible `.wa-kit-field-label` sits closer to its own control than to the field above. */
const FIELD_STYLE = { display: 'flex', flexDirection: 'column', gap: '0.3rem' } as const;

function progressFor(goal: Goal): { done: number; total: number; pct: number } {
  const total = goal.steps.length;
  const done = goal.steps.filter((s) => s.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

type GoalsModuleProps = {
  /**
   * Level of the "Your goals" heading. The legacy Learning tab nests the card
   * under the tab's own headings (h3, the default); /dashboard/career-brief
   * mounts it as a page section, where it is the section's h2.
   */
  headingLevel?: 2 | 3;
  /** Id on the heading, so the hosting section can name itself with aria-labelledby. */
  headingId?: string;
};

export default function GoalsModule({ headingLevel = 3, headingId }: GoalsModuleProps = {}) {
  const t = useTranslations('goals');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const formId = useId();
  const typeFieldId = `${formId}-type`;
  const titleFieldId = `${formId}-title`;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [goalType, setGoalType] = useState<string>('build_resume');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const templateLabel = useCallback(
    (type: string) => t(`templates.${type}` as 'templates.build_resume'),
    [t],
  );

  const encourage = useCallback(
    (pct: number, total: number): string => {
      if (total === 0) return t('encourage.noSteps');
      if (pct === 100) return t('encourage.complete');
      if (pct >= 60) return t('encourage.close');
      if (pct > 0) return t('encourage.started');
      return t('encourage.fresh');
    },
    [t],
  );

  const [error, setError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/member/goals');
      const data = await res.json();
      if (res.ok) {
        setGoals(data.goals ?? []);
        setSuggestions(data.suggestions ?? []);
      } else {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
      }
    } catch {
      setError('Could not load goals. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const finalTitle = title.trim() || templateLabel(goalType);
    setSaving(true);
    try {
      const res = await fetch('/api/member/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalType, title: finalTitle }),
      });
      if (res.ok) {
        setTitle('');
        setShowForm(false);
        await fetchGoals();
      } else {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
      }
    } catch {
      setError('Could not save goal. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSuggestion = async (s: Suggestion) => {
    setAddingKey(s.key);
    setError(null);
    try {
      const res = await fetch('/api/member/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalType: s.goalType, title: s.title }),
      });
      if (res.ok) {
        const data = await res.json();
        const newId: string | undefined = data?.goal?.id;
        await fetchGoals();
        if (newId) void handleGenerateSteps(newId);
      } else {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
      }
    } catch {
      setError('Could not add suggestion. Please check your connection and try again.');
    } finally {
      setAddingKey(null);
    }
  };

  const handleComplete = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/member/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      if (!res.ok) {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
        return;
      }
      await fetchGoals();
    } catch {
      setError('Could not complete goal. Please check your connection and try again.');
    }
  };

  const handleGenerateSteps = async (id: string) => {
    setGenerating(id);
    setError(null);
    try {
      const res = await fetch(`/api/member/goals/${id}/steps`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGoals((prev) =>
          prev.map((g) => (g.id === id ? { ...g, steps: data.steps ?? [] } : g))
        );
      } else {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
      }
    } catch {
      setError('Could not generate steps. Please check your connection and try again.');
    } finally {
      setGenerating(null);
    }
  };

  const handleToggleStep = async (goalId: string, step: Step) => {
    setError(null);
    const nextDone = !step.done;
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, steps: g.steps.map((s) => (s.id === step.id ? { ...s, done: nextDone } : s)) }
          : g
      )
    );
    try {
      const res = await fetch(`/api/member/goals/${goalId}/steps`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: step.id, done: nextDone }),
      });
      if (!res.ok) {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
        setGoals((prev) =>
          prev.map((g) =>
            g.id === goalId
              ? { ...g, steps: g.steps.map((s) => (s.id === step.id ? { ...s, done: step.done } : s)) }
              : g
          )
        );
      }
    } catch {
      setError('Could not update step. Please check your connection and try again.');
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId
            ? { ...g, steps: g.steps.map((s) => (s.id === step.id ? { ...s, done: step.done } : s)) }
            : g
        )
      );
    }
  };

  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <Flag size={20} aria-hidden="true" style={{ color: ACCENT, flexShrink: 0 }} />
      <Heading id={headingId} style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 800, color: TEXT }}>
        {t('title')}
      </Heading>
    </div>
  );

  if (loading) {
    return (
      <div
        className="wa-kit-card"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wa-pad-sm)' }}
        aria-busy="true"
        aria-label={t('title')}
      >
        {header}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div className="portal-skeleton" style={{ height: '4.5rem', borderRadius: 'var(--wa-radius-sm)' }} />
          <div className="portal-skeleton" style={{ height: '4.5rem', borderRadius: 'var(--wa-radius-sm)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="wa-kit-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wa-pad-sm)' }}>
      {header}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-danger-soft)',
            border: '1px solid color-mix(in srgb, var(--wa-danger) 20%, transparent)',
            color: 'var(--wa-danger-text)',
            fontSize: 'var(--wa-type-body)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CircleAlert size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {activeGoals.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {activeGoals.map((goal) => {
            const { done, total, pct } = progressFor(goal);
            const isGenerating = generating === goal.id;
            return (
              <li
                key={goal.id}
                style={{
                  border: '1px solid var(--wa-border)',
                  borderRadius: 'var(--wa-radius-sm)',
                  padding: 'var(--wa-pad-sm)',
                  background: 'var(--wa-surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: TEXT, lineHeight: 1.3 }}>
                    {goal.title}
                  </span>
                  <button
                    type="button"
                    className={GHOST_CTA}
                    onClick={() => handleComplete(goal.id)}
                    aria-label={t('markCompleteAria', { title: goal.title })}
                    style={{ flexShrink: 0 }}
                  >
                    {t('done')}
                  </button>
                </div>

                {total > 0 && (
                  <div style={{ marginTop: '0.7rem' }}>
                    <div
                      style={{
                        height: '6px',
                        borderRadius: '999px',
                        background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
                        overflow: 'hidden',
                      }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t('progressAria', { done, total })}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: '999px',
                          background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DARK})`,
                          transition: 'width var(--wa-dur-slow) var(--wa-ease)',
                        }}
                      />
                    </div>
                    <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: MUTED }}>
                      {t('stepsProgress', { done, total, encouragement: encourage(pct, total) })}
                    </p>
                  </div>
                )}

                {total > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'flex', flexDirection: 'column' }}>
                    {goal.steps.map((step) => (
                      <li key={step.id}>
                        {/* The whole row is the 44px target (the kit's pill and toggle height), not the 1rem box. */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.55rem',
                            minHeight: 44,
                            cursor: 'pointer',
                            fontSize: 'var(--wa-type-body)',
                            lineHeight: 1.4,
                            color: step.done ? MUTED : TEXT,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={step.done}
                            onChange={() => handleToggleStep(goal.id, step)}
                            style={{ margin: 0, accentColor: ACCENT, width: '1rem', height: '1rem', flexShrink: 0 }}
                          />
                          <span style={{ textDecoration: step.done ? 'line-through' : 'none' }}>{step.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ marginTop: '0.7rem' }}>
                    <button
                      type="button"
                      className={CTA}
                      onClick={() => handleGenerateSteps(goal.id)}
                      disabled={isGenerating}
                    >
                      <Sparkles size={16} aria-hidden="true" />
                      {isGenerating ? t('generate.building') : t('generate.cta')}
                    </button>
                    <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--wa-type-meta)', color: MUTED }}>
                      {t('generate.hint')}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ fontSize: 'var(--wa-type-body)', color: MUTED, margin: 0, lineHeight: 1.5 }}>
          {t('empty.message')}
        </p>
      )}

      {activeGoals.length < 3 && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <p className="wa-kit-stat-label" style={{ margin: 0 }}>
            {t('suggestions.label')}
          </p>
          {suggestions.slice(0, 3 - activeGoals.length).map((s) => (
            <button
              key={s.key}
              type="button"
              className="wa-kit-focus"
              onClick={() => handleAddSuggestion(s)}
              disabled={addingKey === s.key}
              style={{
                textAlign: 'left',
                border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
                borderRadius: 'var(--wa-radius-sm)',
                padding: '0.6rem 0.75rem',
                background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <CirclePlus size={20} aria-hidden="true" style={{ color: ACCENT, flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: TEXT }}>
                  {addingKey === s.key ? t('suggestions.adding') : s.title}
                </span>
                <span style={{ fontSize: 'var(--wa-type-meta)', color: MUTED, lineHeight: 1.35 }}>{s.reason}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {activeGoals.length < 3 && (
        <div>
          {showForm ? (
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={FIELD_STYLE}>
                <label htmlFor={typeFieldId} className="wa-kit-field-label">
                  {t('form.typeLabel')}
                </label>
                <select
                  id={typeFieldId}
                  value={goalType}
                  onChange={(e) => {
                    setGoalType(e.target.value);
                    setTitle(templateLabel(e.target.value));
                  }}
                  className="wa-kit-control wa-kit-focus"
                  style={CONTROL_STYLE}
                >
                  {GOAL_TEMPLATE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {templateLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={FIELD_STYLE}>
                <label htmlFor={titleFieldId} className="wa-kit-field-label">
                  {t('form.titleLabel')}
                </label>
                <input
                  id={titleFieldId}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('form.customPlaceholder')}
                  className="wa-kit-control wa-kit-focus"
                  style={CONTROL_STYLE}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button type="submit" className={CTA} disabled={saving}>
                  {saving ? t('form.adding') : t('form.addGoal')}
                </button>
                <button type="button" className={GHOST_CTA} onClick={() => setShowForm(false)}>
                  {t('form.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={GHOST_CTA} onClick={() => setShowForm(true)}>
              {t('form.addCta')}
            </button>
          )}
        </div>
      )}

      <p className="wa-kit-meta" style={{ margin: 0 }}>
        {t('footer')}
      </p>
    </div>
  );
}
