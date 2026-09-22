'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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

const ACCENT = 'var(--color-accent)';
const ACCENT_DARK = 'var(--color-accent-dark)';
const SURFACE_VAR = 'var(--color-on-surface-variant)';
const SURFACE = 'var(--color-on-surface)';

function progressFor(goal: Goal): { done: number; total: number; pct: number } {
  const total = goal.steps.length;
  const done = goal.steps.filter((s) => s.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

export default function GoalsModule() {
  const t = useTranslations('goals');
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

  if (loading) {
    return (
      <div
        className="goals-module portal-card portal-card--flat"
        style={{
          borderRadius: '0.875rem',
          padding: '1.1rem 1.15rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
        aria-busy="true"
        aria-label={t('title')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.25rem', color: ACCENT }}>
            flag
          </span>
          <h3 className="goals-module-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: SURFACE }}>
            {t('title')}
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div className="portal-skeleton" style={{ height: '4.5rem', borderRadius: '0.75rem' }} />
          <div className="portal-skeleton" style={{ height: '4.5rem', borderRadius: '0.75rem' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="goals-module portal-card portal-card--flat"
      style={{
        borderRadius: '0.875rem',
        padding: '1.1rem 1.15rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: '1.25rem', color: ACCENT }}
        >
          flag
        </span>
        <h3
          className="goals-module-title"
          style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: SURFACE }}
        >
          {t('title')}
        </h3>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(173,44,77,0.08)',
            border: '1px solid rgba(173,44,77,0.2)',
            color: 'var(--wa-accent-text)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>error</span>
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
                  border: '1px solid var(--color-outline-variant, rgba(0,0,0,0.08))',
                  borderRadius: '0.75rem',
                  padding: '0.85rem 0.9rem',
                  background: 'var(--surface-container-lowest, transparent)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: SURFACE, lineHeight: 1.3 }}>
                    {goal.title}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
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
                        background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
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
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.8125rem', fontWeight: 600, color: SURFACE_VAR }}>
                      {t('stepsProgress', { done, total, encouragement: encourage(pct, total) })}
                    </p>
                  </div>
                )}

                {total > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {goal.steps.map((step) => (
                      <li key={step.id}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.55rem',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            lineHeight: 1.4,
                            color: step.done ? SURFACE_VAR : SURFACE,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={step.done}
                            onChange={() => handleToggleStep(goal.id, step)}
                            style={{ marginTop: '0.15rem', accentColor: ACCENT, width: '1rem', height: '1rem', flexShrink: 0 }}
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
                      className="btn btn-primary btn-sm"
                      onClick={() => handleGenerateSteps(goal.id)}
                      disabled={isGenerating}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem' }}>
                        auto_awesome
                      </span>
                      {isGenerating ? t('generate.building') : t('generate.cta')}
                    </button>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.8125rem', color: SURFACE_VAR }}>
                      {t('generate.hint')}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ fontSize: '0.875rem', color: SURFACE_VAR, margin: 0 }}>
          {t('empty.message')}
        </p>
      )}

      {activeGoals.length < 3 && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: SURFACE_VAR,
            }}
          >
            {t('suggestions.label')}
          </p>
          {suggestions.slice(0, 3 - activeGoals.length).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => handleAddSuggestion(s)}
              disabled={addingKey === s.key}
              style={{
                textAlign: 'left',
                border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
                borderRadius: '0.7rem',
                padding: '0.6rem 0.75rem',
                background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: '1.25rem', color: ACCENT, flexShrink: 0 }}
              >
                add_circle
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: SURFACE }}>
                  {addingKey === s.key ? t('suggestions.adding') : s.title}
                </span>
                <span style={{ fontSize: '0.8125rem', color: SURFACE_VAR, lineHeight: 1.35 }}>{s.reason}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {activeGoals.length < 3 && (
        <div>
          {showForm ? (
            <form onSubmit={handleAdd} className="goals-form" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <select
                value={goalType}
                onChange={(e) => {
                  setGoalType(e.target.value);
                  setTitle(templateLabel(e.target.value));
                }}
                className="form-select"
              >
                {GOAL_TEMPLATE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {templateLabel(type)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('form.customPlaceholder')}
                className="form-input"
              />
              <div className="goals-form-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? t('form.adding') : t('form.addGoal')}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>
                  {t('form.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowForm(true)}>
              {t('form.addCta')}
            </button>
          )}
        </div>
      )}

      <p style={{ fontSize: '0.8125rem', color: SURFACE_VAR, margin: 0 }}>
        {t('footer')}
      </p>
    </div>
  );
}
