'use client';

import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { programDisplayTitle } from '@/lib/content/programTitle';

type Member = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  memberProgramProgress: { programSlug: string; coursesCompleted: number; averagePercent: number }[];
  courseProgress: { programSlug: string; courseSlug: string }[];
  profile: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    profilePhone: string | null;
    profileLinkedin: string | null;
  } | null;
  _count: {
    applications: number;
    learningProgress: number;
    userCertifications: number;
    memberEvents: number;
    weeklyRecaps: number;
    counselorAssignments: number;
    aiToolResults: number;
    goals: number;
    jobApplications: number;
    messagesAuthored: number;
    partnerReferrals: number;
  };
};

type Group = {
  canonicalEmail: string;
  members: Member[];
};

export default function MemberDuplicatesClient() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ primaryId: string; secondaryId: string; repointed: string[]; mergedFields: string[] } | null>(null);

  // Map: group canonicalEmail → { primaryId, secondaryId }
  const [selections, setSelections] = useState<Record<string, { primary: string; secondary: string }>>({});

  // Group awaiting merge confirmation; null = dialog closed.
  const [confirmGroup, setConfirmGroup] = useState<Group | null>(null);

  useEffect(() => {
    fetch('/api/admin/members/duplicates', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setGroups(data.groups ?? []);
        // Default: first member = primary, second = secondary
        const defaults: Record<string, { primary: string; secondary: string }> = {};
        (data.groups as Group[]).forEach(g => {
          if (g.members.length >= 2) {
            defaults[g.canonicalEmail] = { primary: g.members[0].id, secondary: g.members[1].id };
          }
        });
        setSelections(defaults);
        setLoading(false);
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to load');
        setLoading(false);
      });
  }, []);

  const requestMerge = (group: Group) => {
    const sel = selections[group.canonicalEmail];
    if (!sel || sel.primary === sel.secondary) return;
    setConfirmGroup(group);
  };

  const handleMerge = async (group: Group) => {
    const sel = selections[group.canonicalEmail];
    if (!sel || sel.primary === sel.secondary) return;

    setMerging(true);
    try {
      const res = await fetch('/api/admin/members/merge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId: sel.primary, secondaryId: sel.secondary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Merge failed');
      setMergeResult(data);
      // Remove the merged group from the list
      setGroups(prev => prev.filter(g => g.canonicalEmail !== group.canonicalEmail));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }}>progress_activity</span>
        Scanning for duplicates…
      </div>
    );
  }

  if (error && groups.length === 0) {
    return (
      <div style={{ padding: '1.5rem', background: 'rgba(173,44,77,0.08)', border: '1px solid rgba(173,44,77,0.2)', borderRadius: '0.75rem', color: 'var(--color-accent)' }}>
        {error}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '2rem', marginBottom: '0.75rem', display: 'block' }}>check_circle</span>
        No duplicate members found. All active emails are unique.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {mergeResult && (
        <div style={{ padding: '1rem 1.25rem', background: 'rgba(74,155,79,0.08)', border: '1px solid rgba(74,155,79,0.2)', borderRadius: '0.75rem', color: 'var(--wa-success-dark)', fontSize: '0.875rem' }}>
          <strong>Merge complete.</strong> Repointed {mergeResult.repointed.length} relation groups.
          Merged fields: {mergeResult.mergedFields.join(', ') || 'none'}.
        </div>
      )}

      {groups.map(group => {
        const sel = selections[group.canonicalEmail] ?? { primary: group.members[0]?.id, secondary: group.members[1]?.id };
        return (
          <div key={group.canonicalEmail} style={{ border: '1px solid var(--outline-variant)', borderRadius: '0.875rem', background: 'var(--surface-container)', overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1.125rem', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>warning</span>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)' }}>{group.canonicalEmail}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>{group.members.length} records</span>
            </div>

            <div style={{ display: 'grid', gap: '1px', background: 'var(--outline-variant)' }}>
              {group.members.map((m, idx) => {
                const isPrimary = sel.primary === m.id;
                const isSecondary = sel.secondary === m.id;
                return (
                  <div key={m.id} style={{ padding: '1rem 1.125rem', background: 'var(--surface-container)', display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <input
                        type="radio"
                        name={`primary-${group.canonicalEmail}`}
                        checked={isPrimary}
                        onChange={() => setSelections(prev => ({ ...prev, [group.canonicalEmail]: { ...sel, primary: m.id } }))}
                        id={`p-${m.id}`}
                      />
                      <label htmlFor={`p-${m.id}`} style={{ fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>
                        Keep {m.fullName}
                      </label>
                      <input
                        type="radio"
                        name={`secondary-${group.canonicalEmail}`}
                        checked={isSecondary}
                        onChange={() => setSelections(prev => ({ ...prev, [group.canonicalEmail]: { ...sel, secondary: m.id } }))}
                        id={`s-${m.id}`}
                        style={{ marginLeft: '1rem' }}
                      />
                      <label htmlFor={`s-${m.id}`} style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', cursor: 'pointer' }}>
                        Merge into primary
                      </label>
                      {idx === 0 && <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(74,155,79,0.1)', color: 'var(--wa-success-dark)', textTransform: 'uppercase' }}>Newest</span>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      <div><strong>ID:</strong> {m.id.slice(0, 8)}…</div>
                      <div><strong>Created:</strong> {new Date(m.createdAt).toLocaleDateString()}</div>
                      <div><strong>Updated:</strong> {new Date(m.updatedAt).toLocaleDateString()}</div>
                      <div><strong>Phone:</strong> {m.phone ?? m.profile?.profilePhone ?? '—'}</div>
                      <div><strong>Program:</strong> {m.enrolledProgram ? programDisplayTitle(m.enrolledProgram) : '—'}</div>
                      <div><strong>Assessment:</strong> {m.assessmentCompleted ? '✓' : '—'}</div>
                      <div><strong>Courses:</strong> {m.enrolledProgram ? (m.memberProgramProgress.find((row) => row.programSlug === m.enrolledProgram)?.coursesCompleted ?? m.courseProgress.filter((row) => row.programSlug === m.enrolledProgram).length) : m.courseProgress.length}</div>
                      <div><strong>Applications:</strong> {m._count.applications}</div>
                      <div><strong>Learning:</strong> {m._count.learningProgress}</div>
                      <div><strong>Certs:</strong> {m._count.userCertifications}</div>
                      <div><strong>Events:</strong> {m._count.memberEvents}</div>
                      <div><strong>Recaps:</strong> {m._count.weeklyRecaps}</div>
                      <div><strong>Counselor:</strong> {m._count.counselorAssignments}</div>
                      <div><strong>AI tools:</strong> {m._count.aiToolResults}</div>
                      <div><strong>Goals:</strong> {m._count.goals}</div>
                      <div><strong>Jobs:</strong> {m._count.jobApplications}</div>
                      <div><strong>Messages:</strong> {m._count.messagesAuthored}</div>
                      <div><strong>Referrals:</strong> {m._count.partnerReferrals}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '0.875rem 1.125rem', background: 'var(--surface-container-low)', borderTop: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={merging || sel.primary === sel.secondary}
                aria-busy={merging}
                onClick={() => requestMerge(group)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.5rem 1.125rem', borderRadius: '0.5rem',
                  border: 'none',
                  background: merging ? 'var(--surface-container-high)' : 'var(--color-accent)',
                  color: '#fff', fontWeight: 700, fontSize: '0.875rem',
                  cursor: merging || sel.primary === sel.secondary ? 'default' : 'pointer',
                  opacity: merging || sel.primary === sel.secondary ? 0.6 : 1,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1", animation: merging ? 'spin 1s linear infinite' : 'none' }} aria-hidden="true">{merging ? 'progress_activity' : 'merge_type'}</span>
                <span aria-live="polite">{merging ? 'Merging…' : 'Merge selected'}</span>
              </button>
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={confirmGroup !== null}
        title="Merge members?"
        body={(() => {
          if (!confirmGroup) return '';
          const sel = selections[confirmGroup.canonicalEmail];
          if (!sel) return '';
          return `Merge ${confirmGroup.members.find(m => m.id === sel.secondary)?.fullName ?? 'secondary'} into ${confirmGroup.members.find(m => m.id === sel.primary)?.fullName ?? 'primary'}? This cannot be undone.`;
        })()}
        danger
        confirmLabel="Merge"
        onConfirm={() => {
          const group = confirmGroup;
          setConfirmGroup(null);
          if (group) void handleMerge(group);
        }}
        onCancel={() => setConfirmGroup(null)}
      />
    </div>
  );
}
