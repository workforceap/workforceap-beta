'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';

type MemberHit = { id: string; fullName: string; email: string };

export default function RecordPlacementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const initialMemberId = searchParams?.get('memberId') ?? '';

  const [memberId, setMemberId] = useState(initialMemberId);
  const [selectedMember, setSelectedMember] = useState<MemberHit | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberHits, setMemberHits] = useState<MemberHit[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const memberInputRef = useRef<HTMLInputElement>(null);

  const [employerName, setEmployerName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [startingSalary, setStartingSalary] = useState('');
  const [placedAt, setPlacedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Search-as-you-type member lookup, debounced 300ms. Reuses the existing
  // admin member-search API (already powers subgroup/employer member pickers).
  useEffect(() => {
    const term = memberQuery.trim();
    if (term.length < 2) {
      setMemberHits([]);
      setMemberSearching(false);
      return;
    }
    setMemberSearching(true);
    const handle = setTimeout(() => {
      fetch(`/api/admin/members?q=${encodeURIComponent(term)}&limit=10`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: MemberHit[]) => {
          setMemberHits(Array.isArray(data) ? data : []);
          setActiveIndex(Array.isArray(data) && data.length > 0 ? 0 : -1);
        })
        .catch(() => {
          // non-fatal; keep previous results
        })
        .finally(() => setMemberSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [memberQuery]);

  function pickMember(m: MemberHit) {
    setSelectedMember(m);
    setMemberId(m.id);
    setMemberQuery('');
    setMemberHits([]);
    setMemberDropdownOpen(false);
    setActiveIndex(-1);
  }

  function clearMember() {
    setSelectedMember(null);
    setMemberId('');
    setMemberQuery('');
    setTimeout(() => memberInputRef.current?.focus(), 0);
  }

  function handleMemberKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!memberDropdownOpen || memberHits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, memberHits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && memberHits[activeIndex]) {
        e.preventDefault();
        pickMember(memberHits[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setMemberDropdownOpen(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId.trim()) {
      setError('Search above and select a member');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/members/${memberId.trim()}/placed-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employerName,
          jobTitle,
          startingSalary: startingSalary ? parseInt(startingSalary, 10) : null,
          placedAt: placedAt ? new Date(placedAt).toISOString() : undefined,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      // Query-param → role="status" toast on the destination page — same
      // pattern as the member-creation success toast (see AddMemberWizard →
      // CreateSuccessToast) — instead of a silent redirect.
      const toastParams = new URLSearchParams({ toast: 'placed' });
      if (selectedMember?.fullName) toastParams.set('member', selectedMember.fullName);
      if (employerName) toastParams.set('employer', employerName);
      router.push(`/admin/pipeline?${toastParams.toString()}`);
    } catch (err) {
      // `String(err)` rendered "TypeError: Failed to fetch" to staff when the
      // connection dropped; map it to the shared plain copy instead.
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Could not save the placement. Please try again.' },
          'admin-placement-new',
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  const field: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.75rem 0.875rem',
    border: '1px solid var(--outline-variant)',
    borderRadius: '0.75rem',
    fontSize: '0.95rem',
    marginTop: '0.35rem',
    boxSizing: 'border-box',
    background: 'var(--surface-container-low)',
    color: 'var(--color-on-surface)',
  };

  return (
    <PortalPageFrame>
      <PageHeader
        title="Record Placement"
        subtitle="Add a confirmed placement outcome for a member and send them to the placed stage."
      />

      <div className="portal-card portal-card--flat" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="portal-card__body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label htmlFor="placement-member-search" style={{ fontWeight: 600, display: 'block' }}>
                Member *
              </label>
              {selectedMember ? (
                <div
                  style={{
                    ...field,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{selectedMember.fullName}</strong>{' '}
                    <span style={{ color: 'var(--color-on-surface-variant)' }}>({selectedMember.email})</span>
                  </span>
                  <button type="button" onClick={clearMember} className="btn btn-outline btn-sm" style={{ flexShrink: 0 }}>
                    Change
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    id="placement-member-search"
                    ref={memberInputRef}
                    role="combobox"
                    aria-expanded={memberDropdownOpen && memberHits.length > 0}
                    aria-controls="placement-member-listbox"
                    aria-autocomplete="list"
                    aria-activedescendant={activeIndex >= 0 ? `placement-member-option-${activeIndex}` : undefined}
                    style={field}
                    value={memberQuery}
                    onChange={(e) => {
                      setMemberQuery(e.target.value);
                      setMemberDropdownOpen(true);
                    }}
                    onFocus={() => setMemberDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setMemberDropdownOpen(false), 150)}
                    onKeyDown={handleMemberKeyDown}
                    placeholder="Search by name or email"
                    autoComplete="off"
                  />
                  {memberSearching && (
                    <span
                      style={{
                        position: 'absolute',
                        right: '0.875rem',
                        top: '1.25rem',
                        fontSize: '0.8125rem',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      Searching…
                    </span>
                  )}
                  {memberDropdownOpen && memberHits.length > 0 && (
                    <ul
                      id="placement-member-listbox"
                      role="listbox"
                      aria-label="Matching members"
                      style={{
                        position: 'absolute',
                        zIndex: 20,
                        left: 0,
                        right: 0,
                        marginTop: '0.25rem',
                        listStyle: 'none',
                        padding: '0.25rem 0',
                        background: 'var(--surface-container-low)',
                        border: '1px solid var(--outline-variant)',
                        borderRadius: '0.75rem',
                        maxHeight: 220,
                        overflowY: 'auto',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      }}
                    >
                      {memberHits.map((m, i) => (
                        <li
                          key={m.id}
                          id={`placement-member-option-${i}`}
                          role="option"
                          aria-selected={i === activeIndex}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickMember(m);
                          }}
                          onMouseEnter={() => setActiveIndex(i)}
                          style={{
                            padding: '0.5rem 0.875rem',
                            cursor: 'pointer',
                            background: i === activeIndex ? 'var(--surface-container-high)' : 'transparent',
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{m.fullName}</div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{m.email}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {memberDropdownOpen && !memberSearching && memberQuery.trim().length >= 2 && memberHits.length === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        zIndex: 20,
                        left: 0,
                        right: 0,
                        marginTop: '0.25rem',
                        padding: '0.5rem 0.875rem',
                        background: 'var(--surface-container-low)',
                        border: '1px solid var(--outline-variant)',
                        borderRadius: '0.75rem',
                        fontSize: '0.85rem',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      No members found
                    </div>
                  )}
                  {memberId && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.35rem' }}>
                      Prefilled member ID: {memberId} — search above to confirm or change.
                    </p>
                  )}
                </div>
              )}
            </div>
            <label>
              <span style={{ fontWeight: 600 }}>Employer Name *</span>
              <input
                style={field}
                value={employerName}
                onChange={(e) => setEmployerName(e.target.value)}
                placeholder="Acme Corp"
                required
              />
            </label>
            <label>
              <span style={{ fontWeight: 600 }}>Job Title *</span>
              <input
                style={field}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Software Engineer"
                required
              />
            </label>
            <label>
              <span style={{ fontWeight: 600 }}>Starting Salary (annual $, optional)</span>
              <input
                style={field}
                type="number"
                min={0}
                value={startingSalary}
                onChange={(e) => setStartingSalary(e.target.value)}
                placeholder="55000"
              />
            </label>
            <label>
              <span style={{ fontWeight: 600 }}>Start Date (optional)</span>
              <input style={field} type="date" value={placedAt} onChange={(e) => setPlacedAt(e.target.value)} />
            </label>
            <label>
              <span style={{ fontWeight: 600 }}>Notes (optional)</span>
              <textarea
                style={{ ...field, minHeight: 96, resize: 'vertical' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" style={{ color: 'var(--color-error)', margin: 0 }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Saving…' : 'Save Placement'}
              </button>
              <button type="button" onClick={() => router.push('/admin/pipeline')} className="btn btn-outline">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </PortalPageFrame>
  );
}
