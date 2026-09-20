'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type SubgroupOpt = { id: string; name: string; type: string };

export default function MemberSubgroupSection({
  memberId,
  subgroups,
  currentSubgroupIds,
}: {
  memberId: string;
  subgroups: SubgroupOpt[];
  currentSubgroupIds: string[];
}) {
  const router = useRouter();
  const [subgroupId, setSubgroupId] = useState<string>(currentSubgroupIds[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setSubgroupId(currentSubgroupIds[0] ?? '');
  }, [currentSubgroupIds]);

  async function add() {
    if (!subgroupId) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}/subgroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subgroupId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Add failed' });
        return;
      }
      setMessage({ type: 'ok', text: 'Added.' });
      router.refresh();
    } catch {
      setMessage({ type: 'err', text: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  async function remove(sgId: string) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}/subgroup?subgroup=${sgId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Remove failed' });
        return;
      }
      setMessage({ type: 'ok', text: 'Removed.' });
      router.refresh();
    } catch {
      setMessage({ type: 'err', text: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  const availableToAdd = subgroups.filter((s) => !currentSubgroupIds.includes(s.id));

  return (
    <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Subgroup assignment</h2>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
        Assign this member to subgroups so partners, managers, or churches can view their progress in the portal.
      </p>
      {currentSubgroupIds.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <strong>Current:</strong>{' '}
          {currentSubgroupIds.map((id) => {
            const sg = subgroups.find((s) => s.id === id);
            return sg ? (
              <span key={id} style={{ marginRight: '0.5rem' }}>
                <span style={{ marginRight: '0.25rem' }}>{sg.name}</span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '0.8125rem', padding: '0.15rem 0.35rem' }}
                  onClick={() => remove(id)}
                  disabled={loading}
                  aria-label={`Remove from ${sg.name}`}
                >
                  Remove
                </button>
              </span>
            ) : null;
          })}
        </div>
      )}
      {availableToAdd.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={subgroupId}
            onChange={(e) => setSubgroupId(e.target.value)}
            aria-label="Select subgroup to add"
            style={{ padding: '0.5rem', minWidth: 260, borderRadius: 6, border: '1px solid var(--color-border)' }}
          >
            <option value="">Select subgroup</option>
            {availableToAdd.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => subgroupId && void add()}
            disabled={loading || !subgroupId}
          >
            {loading ? 'Saving…' : 'Add to subgroup'}
          </button>
        </div>
      )}
      {availableToAdd.length === 0 && currentSubgroupIds.length > 0 && (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>Member is in all subgroups.</p>
      )}
      {subgroups.length === 0 && (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>No subgroups exist.</p>
      )}
      {message && (
        <p
          role={message.type === 'ok' ? 'status' : 'alert'}
          style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: message.type === 'ok' ? '#166534' : '#b91c1c' }}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
