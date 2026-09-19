'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Bell, Clock, Eye, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CardHead, FormField, KitEmptyState, QueueRow, StatusTag, type QueueTone } from '@/components/portal/kit';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

type AttentionMember = {
  memberId: string;
  fullName: string;
  stage: string;
  stageLabel: string;
  programTitle: string;
  staleDays: number;
  riskTier: 'high' | 'medium' | 'low' | 'watch';
  nextBestAction: string;
  assignedPartnerUserId: string | null;
  assignedToName: string | null;
  lastTouchName: string | null;
};

type ConfirmedQueueFields = Partial<Pick<AttentionMember, 'assignedPartnerUserId' | 'assignedToName' | 'lastTouchName'>>;

type LogRow = {
  id: string;
  memberId: string;
  memberName: string;
  channel: string;
  note: string;
  createdAt: string;
  createdByName: string;
};

type MemberOption = { id: string; fullName: string };
type TeamUser = { id: string; fullName: string; email: string };

type TierFilter = 'all' | 'high' | 'medium' | 'low' | 'watch';

const TIER_TONE: Record<AttentionMember['riskTier'], QueueTone> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
  watch: 'blue',
};

const TIER_ICON: Record<AttentionMember['riskTier'], LucideIcon> = {
  high: AlertTriangle,
  medium: Clock,
  low: Eye,
  watch: Bell,
};

const kitFieldStyle: React.CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 13,
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '8px 10px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
};

const kitSmallSelectStyle: React.CSSProperties = {
  fontSize: 12,
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '5px 8px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
};

function mergeRecentLogs(fetched: LogRow[], current: LogRow[]): LogRow[] {
  const byId = new Map(current.map(log => [log.id, log]));
  for (const log of fetched) byId.set(log.id, log);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 80);
}

const ASSIGN_FAILED = 'Could not change the owner. Please try again.';

export default function PartnerAttentionClient({ initialTier = 'high' as TierFilter }) {
  const t = useTranslations('partner');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<AttentionMember[] | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>(initialTier);
  const [team, setTeam] = useState<TeamUser[] | null>(null);
  const [allMembers, setAllMembers] = useState<MemberOption[] | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [memberId, setMemberId] = useState('');
  const [channel, setChannel] = useState<'email' | 'call' | 'text' | 'other'>('email');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [queueRevision, setQueueRevision] = useState(0);
  const [total, setTotal] = useState(0);
  const [tierCounts, setTierCounts] = useState<Record<TierFilter, number> | null>(null);
  const [resourceErrors, setResourceErrors] = useState<Partial<Record<'logs' | 'members' | 'team', string>>>({});
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const outreachRevision = useRef(0);
  const draftRevision = useRef(0);
  const confirmedQueueFields = useRef(new Map<string, ConfirmedQueueFields>());
  const tCommon = useTranslations('common');

  const routeTier = searchParams?.get('tier');
  useEffect(() => {
    const tr = routeTier;
    setCursor(null);
    setCursorHistory([]);
    if (!tr) {
      setTierFilter('high');
      return;
    }
    if (tr === 'high' || tr === 'medium' || tr === 'low' || tr === 'watch' || tr === 'all') {
      setTierFilter(tr);
    }
  }, [routeTier]);

  const pushTierRoute = useCallback(
    (t: TierFilter) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      if (t === 'high') next.delete('tier');
      else next.set('tier', t);
      const qs = next.toString();
      if (pathname) router.replace(qs.length ? `${pathname}?${qs}` : pathname, { scroll: false });
      setCursor(null);
      setCursorHistory([]);
      setTierFilter(t);
    },
    [pathname, router, searchParams],
  );

  const loadQueue = useCallback(async (signal: AbortSignal) => {
    // Only writes confirmed after this GET starts can supersede its fields.
    confirmedQueueFields.current = new Map();
    setQueueLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ tier: tierFilter, limit: '50' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/partner/members/needs-attention?${params}`, { credentials: 'include', signal });
      const data = await response.json();
      if (!response.ok) throw new Error('The attention queue could not load. Refresh the queue and try again.');
      if (!Array.isArray(data.members) || !data.counts || !Number.isSafeInteger(data.total) || data.total < 0 ||
        !['all', 'high', 'medium', 'low', 'watch'].every(key => Number.isSafeInteger(data.counts[key]) && data.counts[key] >= 0) ||
        !(data.nextCursor === null || (typeof data.nextCursor === 'string' && data.nextCursor.length > 0))) throw new Error('The attention queue response could not be confirmed.');
      if (signal.aborted) return;
      setRows(data.members.map((member: AttentionMember) => ({ ...member, ...confirmedQueueFields.current.get(member.memberId) }))); setTierCounts(data.counts); setTotal(data.total); setNextCursor(data.nextCursor);
    } catch {
      if (!signal.aborted) setLoadError('The attention queue could not load. Refresh the queue and try again.');
    } finally {
      if (!signal.aborted) setQueueLoading(false);
    }
  }, [tierFilter, cursor]);

  useEffect(() => {
    const controller = new AbortController();
    void loadQueue(controller.signal);
    return () => controller.abort();
  }, [loadQueue, queueRevision]);

  const loadResource = useCallback(async (kind: 'logs' | 'members' | 'team', signal?: AbortSignal) => {
    const startedAtRevision = outreachRevision.current;
    const urls = { logs: '/api/partner/outreach', members: '/api/partner/referral-members', team: '/api/partner/team-assign' };
    try {
      const response = await fetch(urls[kind], { credentials: 'include', signal });
      const data = await response.json();
      const value = data[kind === 'team' ? 'users' : kind];
      if (!response.ok || !Array.isArray(value)) throw new Error('Resource unavailable');
      if (signal?.aborted) return;
      if (kind === 'logs') {
        // A GET started before a confirmed POST cannot erase that saved log.
        setLogs(previous => startedAtRevision === outreachRevision.current ? value : mergeRecentLogs(value, previous ?? []));
      }
      else if (kind === 'members') setAllMembers(value);
      else setTeam(value);
      setResourceErrors(previous => ({ ...previous, [kind]: undefined }));
    } catch {
      if (!signal?.aborted) setResourceErrors(previous => ({ ...previous, [kind]: `Could not load ${kind === 'logs' ? 'recent outreach' : kind === 'team' ? 'team owners' : 'member choices'}.` }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(['logs', 'members', 'team'].map(kind => loadResource(kind as 'logs' | 'members' | 'team', controller.signal)));
    return () => controller.abort();
  }, [loadResource]);

  const refreshQueue = () => {
    setCursor(null); setCursorHistory([]); setQueueRevision(value => value + 1);
  };
  const filtered = rows ?? [];
  const memberChoices = useMemo(() => {
    const choices = new Map((allMembers ?? []).map(member => [member.id, member]));
    for (const row of rows ?? []) choices.set(row.memberId, { id: row.memberId, fullName: row.fullName });
    if (selectedMember) choices.set(selectedMember.id, selectedMember);
    return [...choices.values()];
  }, [allMembers, rows, selectedMember]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!memberId || !note.trim()) {
      setMessage('Choose a member and add a note.');
      return;
    }
    const submittedDraftRevision = draftRevision.current;
    setSaving(true);
    try {
      const r = await fetch('/api/partner/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberId, channel, note: note.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage(typeof data.error === 'string' ? data.error : 'Save failed');
        return;
      }
      if (typeof data.id !== 'string' || typeof data.memberName !== 'string' || typeof data.createdAt !== 'string' || data.memberId !== memberId) {
        setMessage('The saved response could not be confirmed. Refresh recent outreach before retrying.');
        return;
      }
      if (draftRevision.current === submittedDraftRevision) setNote('');
      outreachRevision.current += 1;
      setMessage('Outreach logged.');
      setLogs(previous => [{ ...data, createdByName: 'You' } as LogRow, ...(previous ?? []).filter(log => log.id !== data.id)].slice(0, 80));
      confirmedQueueFields.current.set(memberId, { ...confirmedQueueFields.current.get(memberId), lastTouchName: 'You' });
      setRows(previous => previous?.map(row => row.memberId === memberId ? { ...row, lastTouchName: 'You' } : row) ?? null);
    } catch (err) {
      setMessage(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Save failed' }, 'partner-outreach'));
    } finally {
      setSaving(false);
    }
  };

  const assign = async (memberIdTarget: string, userId: string | null) => {
    setAssignBusy(memberIdTarget);
    setAssignError(null);
    try {
      const r = await fetch(`/api/partner/referrals/${memberIdTarget}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assignedPartnerUserId: userId }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.ok !== true || data.assignedPartnerUserId !== userId || !(data.assignedToName === null || typeof data.assignedToName === 'string')) {
          setAssignError('The saved owner could not be confirmed. Refresh the queue before retrying.');
          return;
        }
        confirmedQueueFields.current.set(memberIdTarget, { ...confirmedQueueFields.current.get(memberIdTarget), assignedPartnerUserId: data.assignedPartnerUserId, assignedToName: data.assignedToName });
        setRows(previous => previous?.map(row => row.memberId === memberIdTarget
          ? { ...row, assignedPartnerUserId: data.assignedPartnerUserId, assignedToName: data.assignedToName } : row) ?? null);
        return;
      }
      // The select re-renders back to the saved owner; say why it did not stick.
      const data = (await r.json().catch(() => ({}))) as { error?: unknown };
      setAssignError(typeof data.error === 'string' && data.error.trim() ? data.error : ASSIGN_FAILED);
    } catch (err) {
      setAssignError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: ASSIGN_FAILED }, 'partner-assign-owner'));
    } finally {
      setAssignBusy(null);
    }
  };

  return (
    <div className="wa-flex wa-flex-col wa-gap-4">
      <section className="wa-kit-card">
        <CardHead title="Who needs you right now" />
        <p style={{ color: 'var(--wa-muted)', fontSize: 13, marginTop: -8, marginBottom: 16, lineHeight: 1.5 }}>
          Sorted by time since the member record was last updated, with the longest gaps first. Assign owners and log outreach so nothing slips through the cracks.
        </p>
        <p style={{ color: 'var(--wa-muted)', fontSize: 12 }}>
          Counts use the same reference time across these pages. Member updates can change the order; refresh for the current queue.
        </p>
        {(['members', 'team'] as const).map(kind => resourceErrors[kind] ? (
          <p role="alert" key={kind}>{resourceErrors[kind]} <button type="button" onClick={() => void loadResource(kind)}>Retry {kind}</button></p>
        ) : null)}
        <div role="tablist" aria-label="Risk tier" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['all', 'high', 'medium', 'low', 'watch'] as const).map((t) => {
            const active = tierFilter === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pushTierRoute(t)}
                className="wa-kit-focus"
                style={{
                  textTransform: 'capitalize',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'var(--wa-accent)' : 'var(--wa-border)'}`,
                  background: active ? 'var(--wa-accent)' : 'var(--wa-surface)',
                  color: active ? 'var(--wa-on-accent)' : 'var(--wa-text)',
                  cursor: 'pointer',
                }}
              >
                {t === 'all' ? 'All' : t}
                {tierCounts ? (
                  <span className="wa-tabular-nums" style={{ marginLeft: 6, opacity: 0.85 }}>
                    {t === 'all' ? tierCounts.all : tierCounts[t]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {assignError ? (
          <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-danger)', margin: '0 0 12px' }}>
            {assignError}
          </p>
        ) : null}
        {loadError ? (
          <div role="alert" className="wa-kit-card wa-kit-card--sm">
            <p style={{ color: 'var(--wa-muted)', marginBottom: 12 }}>{loadError}</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={refreshQueue}>
              Retry
            </button>
          </div>
        ) : queueLoading ? (
          <p style={{ color: 'var(--wa-muted)' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <KitEmptyState title={t('attentionQueue')} description={t('noMembersInFilter')} />
        ) : (
          <div className="wa-flex wa-flex-col wa-gap-3">
            {filtered.map((m) => {
              const Icon = TIER_ICON[m.riskTier];
              return (
                <div key={m.memberId} className="wa-flex wa-flex-col wa-gap-2">
                  <QueueRow
                    tone={TIER_TONE[m.riskTier]}
                    icon={<Icon size={16} aria-hidden />}
                    title={m.fullName}
                    meta={`${m.stageLabel} · ${m.programTitle} · member record updated ${m.staleDays}d ago`}
                    flag={m.riskTier.toUpperCase()}
                    action={
                      <Link href={`/partner/referred-members/${m.memberId}`} className="portal-section-action">
                        Review
                      </Link>
                    }
                  />
                  <div style={{ paddingLeft: 50, fontSize: 12, color: 'var(--wa-text)' }}>
                    <strong>Next:</strong> <span style={{ color: 'var(--wa-muted)' }}>{m.nextBestAction}</span>
                  </div>
                  <div style={{ paddingLeft: 50, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--wa-muted)' }}>
                      Owner
                      <select
                        aria-label={`Assign owner for ${m.fullName}`}
                        value={m.assignedPartnerUserId ?? ''}
                        disabled={assignBusy === m.memberId || !team || queueLoading}
                        onChange={(e) => {
                          const v = e.target.value;
                          void assign(m.memberId, v === '' ? null : v);
                        }}
                        className="wa-kit-focus"
                        style={kitSmallSelectStyle}
                      >
                        <option value="">Unassigned</option>
                        {(team ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--wa-muted)' }}>
                      Last touch: {m.lastTouchName ?? '—'}
                    </span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { draftRevision.current += 1; setMemberId(m.memberId); setSelectedMember({ id: m.memberId, fullName: m.fullName }); }}>
                      Log outreach
                    </button>
                    <Link
                      href={`/partner/messages?memberId=${m.memberId}`}
                      className="btn btn-outline btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <MessageSquare size={13} aria-hidden />
                      Message
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <nav aria-label="Attention queue pages" className="wa-flex wa-items-center wa-gap-3 wa-mt-4">
          <button type="button" disabled={queueLoading || cursorHistory.length === 0} onClick={() => {
            setCursor(cursorHistory.at(-1) ?? null); setCursorHistory(history => history.slice(0, -1));
          }}>Previous page</button>
          <span>Page {cursorHistory.length + 1}{tierCounts ? ` · ${filtered.length} of ${total} members in this tier` : ''}</span>
          <button type="button" disabled={queueLoading || !!loadError || !nextCursor} onClick={() => {
            if (nextCursor) { setCursorHistory(history => [...history, cursor]); setCursor(nextCursor); }
          }}>Next page</button>
          <button type="button" disabled={queueLoading} onClick={refreshQueue}>Refresh queue</button>
        </nav>
      </section>

      <section className="wa-kit-card">
        <CardHead title="Log outreach" />
        {message ? (
          <p role="status" style={{ fontSize: 13, color: 'var(--wa-accent)', fontWeight: 600, marginTop: -8, marginBottom: 12 }}>
            {message}
          </p>
        ) : null}
        <form onSubmit={submit} className="wa-grid wa-grid-cols-1 md:wa-grid-cols-3 wa-gap-3" style={{ maxWidth: 640 }}>
          <FormField label="Member">
            <select value={memberId} onChange={(e) => {
              draftRevision.current += 1;
              setMemberId(e.target.value);
              setSelectedMember(memberChoices.find(member => member.id === e.target.value) ?? null);
            }} required style={kitFieldStyle}>
              <option value="">Select member…</option>
              {memberChoices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Channel">
            <select value={channel} onChange={(e) => { draftRevision.current += 1; setChannel(e.target.value as typeof channel); }} style={kitFieldStyle}>
              <option value="email">Email</option>
              <option value="call">Call</option>
              <option value="text">Text</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          <FormField label="Note" full>
            <textarea
              value={note}
              onChange={(e) => { draftRevision.current += 1; setNote(e.target.value); }}
              rows={3}
              required
              style={{ ...kitFieldStyle, resize: 'vertical' }}
            />
          </FormField>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save log'}
            </button>
          </div>
        </form>
      </section>

      <section className="wa-kit-card">
        <CardHead title="Recent outreach" />
        {resourceErrors.logs && <p role="alert">{resourceErrors.logs} <button type="button" onClick={() => void loadResource('logs')}>Retry recent outreach</button></p>}
        {!logs ? (
          resourceErrors.logs ? null : <p style={{ color: 'var(--wa-muted)' }}>Loading…</p>
        ) : logs.length === 0 ? (
          <p style={{ color: 'var(--wa-muted)' }}>No logs yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logs.map((l) => (
              <li key={l.id} style={{ paddingBottom: 10, borderBottom: '1px solid var(--wa-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--wa-text)' }}>{l.memberName}</span>
                  <StatusTag tone="muted">{l.channel}</StatusTag>
                  <span style={{ fontSize: 11, color: 'var(--wa-muted)' }}>{new Date(l.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ color: 'var(--wa-muted)', marginTop: 4, fontSize: 13 }}>{l.note}</div>
                <div style={{ fontSize: 11, color: 'var(--wa-muted)', marginTop: 2 }}>By {l.createdByName}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
