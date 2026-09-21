'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './memberAssignmentSection.module.css';

type PartnerOpt = { id: string; name: string };

export default function MemberPartnerSection({
  memberId,
  partners,
  currentPartnerId,
}: {
  memberId: string;
  partners: PartnerOpt[];
  currentPartnerId: string | null;
}) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState<string>(currentPartnerId ?? '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setPartnerId(currentPartnerId ?? '');
  }, [currentPartnerId]);

  async function save() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}/partner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partnerId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const parts = [
          typeof data.error === 'string' ? data.error : null,
          typeof data.detail === 'string' ? data.detail : null,
        ].filter(Boolean) as string[];
        setMessage({ type: 'err', text: parts.length > 0 ? parts.join(' — ') : `Update failed (${res.status})` });
        return;
      }
      setMessage({ type: 'ok', text: 'Saved.' });
      router.refresh();
    } catch {
      setMessage({ type: 'err', text: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="wa-kit-card" aria-labelledby="admin-member-partner-title">
      <h2 id="admin-member-partner-title" className={styles.title}>Partner assignment</h2>
      <p className={styles.lede}>
        Link this member to a partner organization for referral tracking and milestone emails to the partner contact.
      </p>
      <div className={styles.row}>
        <select
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label="Partner organization"
          className={`${styles.select} wa-kit-focus`}
        >
          <option value="">No partner</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={loading}>
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
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
