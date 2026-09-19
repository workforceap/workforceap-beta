'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';
import {
  X,
  ShieldAlert,
  ShieldHalf,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  Check,
  RotateCcw,
  ArrowUpRight,
  Clock,
  StickyNote,
  Activity} from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';

interface AtRiskFactor {
  name: string;
  weight: number;
  description: string;
}

interface AtRiskMember {
  userId: string;
  alertId: string;
  name: string;
  email: string;
  phone: string | null;
  score: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'open' | 'acknowledged' | 'resolved' | 'escalated';
  factors: AtRiskFactor[];
  enrolledProgram: string | null;
  enrolledAt: string | null;
  memberSince: string;
  profile: {
    employmentStatus: string | null;
    educationLevel: string | null;
  } | null;
  alertCreatedAt: string;
  alertUpdatedAt: string;
  lastActivityAt?: string | null;
}

interface TimelineEvent {
  id: string;
  eventName: string;
  sourcePage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface CounselorNote {
  id: string;
  content: string;
  author: string | null;
  createdAt: string;
}

interface Props {
  member: AtRiskMember | null;
  onClose: () => void;
  onStatusChange: (alertId: string, status: 'acknowledged' | 'resolved' | 'escalated') => void;
}

export default function AtRiskDetailModal({ member, onClose, onStatusChange }: Props) {
  const tCommon = useTranslations('common');
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<CounselorNote[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kit trap: Tab containment + Escape (shared stack) + focus restore to the
  // triggering roster row when the modal closes.
  const dialogRef = useFocusTrap<HTMLDivElement>(!!member, { onEscape: onClose });

  const fetchTimeline = useCallback(async (userId: string) => {
    setLoadingTimeline(true);
    try {
      const res = await fetch(`/api/counselor/members/${userId}/activity-timeline?limit=20`);
      if (!res.ok) throw new Error('Failed to load timeline');
      const data = await res.json();
      setTimeline(data.events ?? []);
    } catch (err) {
      setTimeline([]);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  const fetchNotes = useCallback(async (userId: string) => {
    setLoadingNotes(true);
    try {
      const res = await fetch(`/api/counselor/members/${userId}/notes`);
      if (!res.ok) throw new Error('Failed to load notes');
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch (err) {
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  useEffect(() => {
    if (member) {
      setError(null);
      fetchTimeline(member.userId);
      fetchNotes(member.userId);
    } else {
      setTimeline([]);
      setNotes([]);
      setNoteText('');
    }
  }, [member, fetchTimeline, fetchNotes]);

  async function addNote() {
    if (!member || !noteText.trim()) return;
    setSavingNote(true);
    setError(null);
    try {
      const res = await fetch(`/api/counselor/members/${member.userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteText.trim() })});
      if (!res.ok) throw new Error('Failed to save note');
      const data = await res.json();
      setNotes((prev) => [data.note, ...prev]);
      setNoteText('');
    } catch (err) {
      setError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Failed to save note' }, 'at-risk-note'));
    } finally {
      setSavingNote(false);
    }
  }

  async function handleStatusChange(status: 'acknowledged' | 'resolved' | 'escalated') {
    if (!member) return;
    setActing(true);
    try {
      await onStatusChange(member.alertId, status);
    } finally {
      setActing(false);
    }
  }

  if (!member) return null;

  const riskColor =
    member.riskLevel === 'CRITICAL'
      ? 'var(--color-accent)'
      : member.riskLevel === 'HIGH'
        ? 'var(--color-gold)'
        : 'var(--color-blue)';

  return (
    <div
      ref={dialogRef}
      className="at-risk-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`At-risk detail: ${member.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto'}}
    >
      <div
        className="at-risk-modal"
        style={{
          background: 'var(--surface-container-lowest)',
          borderRadius: '1rem',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid var(--outline-variant)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column'}}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--outline-variant)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            position: 'sticky',
            top: 0,
            background: 'var(--surface-container-lowest)',
            zIndex: 10,
            borderRadius: '1rem 1rem 0 0'}}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <div
              style={{
                width: '2.75rem',
                height: '2.75rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `color-mix(in srgb, ${riskColor} 12%, transparent)`,
                border: `2px solid ${riskColor}40`,
                flexShrink: 0}}
            >
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: riskColor }}>{member.score}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.2 }}>{member.name}</h2>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                {member.email}
                {member.phone ? ` · ${member.phone}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '0.5rem',
              color: 'var(--color-on-surface-variant)',
              flexShrink: 0}}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Risk level + status */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: `color-mix(in srgb, ${riskColor} 12%, transparent)`,
                color: riskColor,
                border: `1.5px solid ${riskColor}40`}}
            >
              {member.riskLevel === 'CRITICAL' && <ShieldAlert size={14} />}
              {member.riskLevel === 'HIGH' && <ShieldHalf size={14} />}
              {member.riskLevel === 'MEDIUM' && <ShieldCheck size={14} />}
              {member.riskLevel} Risk
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'var(--surface-container-high)',
                color: 'var(--color-on-surface-variant)'}}
            >
              Status: {member.status}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>
              Alerted {new Date(member.alertCreatedAt).toLocaleDateString()}
            </span>
          </div>

          {/* Quick links */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              href={`/counselor/students/${member.userId}`}
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.8rem' }}
            >
              <ArrowUpRight size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
              Full profile
            </Link>
            <Link
              href={`/counselor/messages?memberId=${encodeURIComponent(member.userId)}`}
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.8rem' }}
            >
              <MessageSquare size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
              Message
            </Link>
          </div>

          {/* Factor scores */}
          <div>
            <h3
              style={{
                margin: '0 0 0.75rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--color-on-surface-variant)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'}}
            >
              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
              Risk factors ({member.factors.length})
            </h3>
            {member.factors.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                No specific factors recorded for this alert.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {member.factors.map((f) => (
                  <div
                    key={f.name}
                    style={{
                      padding: '0.6rem 0.85rem',
                      borderRadius: '0.625rem',
                      background: 'var(--surface-container-high)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem'}}
                  >
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{f.description}</span>
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: 'var(--color-on-surface-variant)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0}}
                    >
                      weight {f.weight}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div>
            <h3
              style={{
                margin: '0 0 0.75rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--color-on-surface-variant)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'}}
            >
              <Activity size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
              Recent activity
            </h3>
            {loadingTimeline ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
                <PortalInlineSpinner size={14} />
                Loading timeline…
              </div>
            ) : timeline.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                No recent activity recorded.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {timeline.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      padding: '0.6rem 0.85rem',
                      borderRadius: '0.625rem',
                      background: 'var(--surface-container-high)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem'}}
                  >
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ev.eventName}</span>
                      {ev.sourcePage && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-on-surface-variant)', marginLeft: '0.5rem' }}>
                          {ev.sourcePage}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                      {new Date(ev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Counselor notes */}
          <div>
            <h3
              style={{
                margin: '0 0 0.75rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--color-on-surface-variant)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'}}
            >
              <StickyNote size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
              Counselor notes
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addNote();
                  }
                }}
                placeholder="Add a note…"
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container-high)',
                  color: 'inherit',
                  fontSize: '0.85rem'}}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={addNote}
                disabled={savingNote || !noteText.trim()}
              >
                {savingNote ? <PortalInlineSpinner size={14} /> : 'Add'}
              </button>
            </div>
            {error && (
              <p role="alert" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-accent)' }}>
                {error}
              </p>
            )}
            {loadingNotes ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
                <PortalInlineSpinner size={14} />
                Loading notes…
              </div>
            ) : notes.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                No notes yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {notes.map((note) => (
                  <div
                    key={note.id}
                    style={{
                      padding: '0.6rem 0.85rem',
                      borderRadius: '0.625rem',
                      background: 'var(--surface-container-high)'}}
                  >
                    <p style={{ margin: '0 0 0.35rem', fontSize: '0.85rem', lineHeight: 1.45 }}>{note.content}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                      {note.author ?? 'Counselor'} · {new Date(note.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--outline-variant)',
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            position: 'sticky',
            bottom: 0,
            background: 'var(--surface-container-lowest)',
            borderRadius: '0 0 1rem 1rem'}}
        >
          {member.status === 'open' && (
            <button
              type="button"
              className="btn btn-muted btn-sm"
              disabled={acting}
              onClick={() => handleStatusChange('acknowledged')}
            >
              {acting ? <PortalInlineSpinner size={14} /> : <Check size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />}
              Acknowledge
            </button>
          )}
          {member.status !== 'resolved' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={acting}
              onClick={() => handleStatusChange('resolved')}
            >
              {acting ? <PortalInlineSpinner size={14} /> : 'Resolve'}
            </button>
          )}
          {member.status !== 'escalated' && (
            <button
              type="button"
              className="btn btn-accent btn-sm"
              disabled={acting}
              onClick={() => handleStatusChange('escalated')}
              title="Escalate to admin for additional support"
            >
              {acting ? <PortalInlineSpinner size={14} /> : <AlertTriangle size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />}
              Escalate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
