'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter, LayoutHeader, HStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
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

const TITLE_ID = 'at-risk-detail-title';

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

  // Stay mounted across close: Astryx Dialog restores focus to the trigger
  // only when `isOpen` flips false while mounted (no unmount cleanup), so the
  // caller passes `member={null}` to close and the last member keeps the body
  // populated through the close animation (kit precedent:
  // EmailTemplatesClient's `isOpen={!!editingId}`).
  const lastMemberRef = useRef<AtRiskMember | null>(null);
  if (member) lastMemberRef.current = member;
  const shown = member ?? lastMemberRef.current;
  if (!shown) return null;

  const riskColor =
    shown.riskLevel === 'CRITICAL'
      ? 'var(--color-accent)'
      : shown.riskLevel === 'HIGH'
        ? 'var(--color-gold)'
        : 'var(--color-blue)';

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  // Kit dialog primitive (Astryx `Dialog`, native <dialog>.showModal()): focus
  // trap, Escape (shared kit stack), backdrop dismiss and — because this stays
  // mounted, see above — focus restore to the roster row; `aria-labelledby`
  // names the dialog after the member heading, which `data-autofocus` puts
  // focus on at open. No `.at-risk-modal` class: the primitive animates entry.
  return (
    <Dialog
      isOpen={!!member}
      onOpenChange={handleOpenChange}
      purpose="info"
      width={640}
      maxHeight="90vh"
      aria-labelledby={TITLE_ID}
      data-testid="at-risk-detail-dialog"
    >
      <Layout
        header={
          <LayoutHeader hasDivider>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <div
                  aria-hidden
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
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: riskColor }}>{shown.score}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <Heading level={2} id={TITLE_ID} tabIndex={-1} data-autofocus="true" style={{ outline: 'none' }}>
                    {shown.name}
                  </Heading>
                  <Text type="body" size="sm" color="secondary">
                    {shown.email}
                    {shown.phone ? ` · ${shown.phone}` : ''}
                  </Text>
                </div>
              </div>
              <Button
                variant="ghost"
                label="Close"
                icon={<X size={18} aria-hidden />}
                isIconOnly
                onClick={onClose}
              />
            </div>
          </LayoutHeader>
        }
        content={
          <LayoutContent isScrollable>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Risk level + status */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.8125rem',
                fontWeight: 700,
                background: `color-mix(in srgb, ${riskColor} 12%, transparent)`,
                color: riskColor,
                border: `1.5px solid ${riskColor}40`}}
            >
              {shown.riskLevel === 'CRITICAL' && <ShieldAlert size={14} />}
              {shown.riskLevel === 'HIGH' && <ShieldHalf size={14} />}
              {shown.riskLevel === 'MEDIUM' && <ShieldCheck size={14} />}
              {shown.riskLevel} Risk
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                background: 'var(--surface-container-high)',
                color: 'var(--color-on-surface-variant)'}}
            >
              Status: {shown.status}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>
              Alerted {new Date(shown.alertCreatedAt).toLocaleDateString()}
            </span>
          </div>

          {/* Quick links */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              href={`/counselor/students/${shown.userId}`}
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.8125rem' }}
            >
              <ArrowUpRight size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
              Full profile
            </Link>
            <Link
              href={`/counselor/messages?memberId=${encodeURIComponent(shown.userId)}`}
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.8125rem' }}
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
              Risk factors ({shown.factors.length})
            </h3>
            {shown.factors.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                No specific factors recorded for this alert.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {shown.factors.map((f) => (
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
                        fontSize: '0.8125rem',
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
                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginLeft: '0.5rem' }}>
                          {ev.sourcePage}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap', flexShrink: 0 }}>
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
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      {note.author ?? 'Counselor'} · {new Date(note.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} justify="end" wrap="wrap">
              {shown.status === 'open' && (
                <Button
                  label="Acknowledge"
                  variant="secondary"
                  icon={<Check size={14} aria-hidden />}
                  isDisabled={acting}
                  isLoading={acting}
                  onClick={() => void handleStatusChange('acknowledged')}
                />
              )}
              {shown.status !== 'resolved' && (
                <Button
                  label="Resolve"
                  variant="primary"
                  isDisabled={acting}
                  isLoading={acting}
                  onClick={() => void handleStatusChange('resolved')}
                />
              )}
              {shown.status !== 'escalated' && (
                <Button
                  label="Escalate"
                  variant="secondary"
                  icon={<AlertTriangle size={14} aria-hidden />}
                  tooltip="Escalate to admin for additional support"
                  isDisabled={acting}
                  isLoading={acting}
                  onClick={() => void handleStatusChange('escalated')}
                />
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
