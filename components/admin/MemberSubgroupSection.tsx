'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './memberAssignmentSection.module.css';

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
    <section className="wa-kit-card" aria-labelledby="admin-member-subgroup-title">
      <h2 id="admin-member-subgroup-title" className={styles.title}>Subgroup assignment</h2>
      <p className={styles.lede}>
        Assign this member to subgroups so partners, managers, or churches can view their progress in the portal.
      </p>
      {currentSubgroupIds.length > 0 && (
        <div className={styles.current}>
          <strong>Current:</strong>
          {currentSubgroupIds.map((id) => {
            const sg = subgroups.find((s) => s.id === id);
            return sg ? (
              <span key={id} className={styles.chip}>
                <span>{sg.name}</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
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
        <div className={styles.row}>
          <select
            value={subgroupId}
            onChange={(e) => setSubgroupId(e.target.value)}
            aria-label="Select subgroup to add"
            className={`${styles.select} wa-kit-focus`}
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
        <p className={styles.note}>Member is in all subgroups.</p>
      )}
      {subgroups.length === 0 && (
        <p className={styles.note}>No subgroups exist.</p>
      )}
      {message && (
        <p
          role={message.type === 'ok' ? 'status' : 'alert'}
          className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
