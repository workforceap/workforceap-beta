'use client';

import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import {
  Bell,
  BellOff,
  MessageSquare,
  GraduationCap,
  Briefcase,
  ClipboardList,
  ListChecks,
  Megaphone,
  Check,
  CheckCheck,
  X as DismissIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import { StatusTag, CardHead, type KitTone } from '@/components/portal/kit';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type MemberOption = {
  id: string;
  fullName: string | null;
};

const NOTIFICATION_TYPES = [
  { value: '', label: 'All types' },
  { value: 'message', label: 'Message' },
  { value: 'course_complete', label: 'Course complete' },
  { value: 'job_match', label: 'Job match' },
  { value: 'survey_due', label: 'Survey due' },
  { value: 'task_assigned', label: 'Task assigned' },
  { value: 'broadcast', label: 'Broadcast' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  NOTIFICATION_TYPES.filter((t) => t.value).map((t) => [t.value, t.label]),
);

const TYPE_ICON: Record<string, LucideIcon> = {
  message: MessageSquare,
  course_complete: GraduationCap,
  job_match: Briefcase,
  survey_due: ClipboardList,
  task_assigned: ListChecks,
  broadcast: Megaphone,
};

const TYPE_TONE: Record<string, KitTone> = {
  message: 'info',
  course_complete: 'ok',
  job_match: 'ok',
  survey_due: 'warn',
  task_assigned: 'alert',
  broadcast: 'muted',
};

const TONE_COLOR: Record<KitTone, string> = {
  ok: 'var(--wa-success)',
  warn: 'var(--wa-gold)',
  alert: 'var(--wa-accent)',
  danger: 'var(--wa-danger)',
  info: 'var(--wa-info)',
  muted: 'var(--wa-muted)',
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const fieldInputStyle: CSSProperties = {
  width: '100%',
  marginTop: 4,
  padding: '9px 12px',
  borderRadius: 'var(--wa-radius-sm)',
  border: '1px solid var(--wa-border)',
  background: 'var(--wa-bg)',
  color: 'var(--wa-text)',
  fontSize: 13,
};

export default function CounselorNotificationCenter({ members }: { members: MemberOption[] }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [readFilter, setReadFilter] = useState('');

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (memberId) params.set('memberId', memberId);
      if (type) params.set('type', type);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (readFilter) params.set('read', readFilter === 'read' ? 'true' : 'false');

      const r = await fetch(`/api/counselor/notifications?${params.toString()}`, { credentials: 'include' });
      if (r.ok) {
        const data = await r.json() as { notifications: NotificationItem[]; unreadCount: number };
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [memberId, type, dateFrom, dateTo, readFilter]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/member/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
      if (r.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const r = await fetch('/api/member/notifications/read-all', { method: 'POST', credentials: 'include' });
      if (r.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
        setUnreadCount(0);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const dismiss = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/member/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) {
        // Only decrement the unread badge if the dismissed notification was
        // actually unread. Mirrors the fix in NotificationBell.dismiss().
        setNotifications((prev) => {
          const target = prev.find((n) => n.id === id);
          if (target && !target.readAt) {
            setUnreadCount((c) => Math.max(0, c - 1));
          }
          return prev.filter((n) => n.id !== id);
        });
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  return (
    <div>
      {/* Filters */}
      <div className="wa-kit-card wa-kit-card--sm" style={{ marginBottom: '1.25rem' }}>
        <CardHead title="Filters" />
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-5 wa-gap-3">
          <div>
            <label htmlFor="cn-member-filter" className="wa-kit-field-label">Member</label>
            <select id="cn-member-filter" value={memberId} onChange={(e) => setMemberId(e.target.value)} className="wa-kit-focus" style={fieldInputStyle}>
              <option value="">All members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName ?? m.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cn-type-filter" className="wa-kit-field-label">Type</label>
            <select id="cn-type-filter" value={type} onChange={(e) => setType(e.target.value)} className="wa-kit-focus" style={fieldInputStyle}>
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cn-date-from" className="wa-kit-field-label">From</label>
            <input id="cn-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="wa-kit-focus" style={fieldInputStyle} />
          </div>
          <div>
            <label htmlFor="cn-date-to" className="wa-kit-field-label">To</label>
            <input id="cn-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="wa-kit-focus" style={fieldInputStyle} />
          </div>
          <div>
            <label htmlFor="cn-status-filter" className="wa-kit-field-label">Status</label>
            <select id="cn-status-filter" value={readFilter} onChange={(e) => setReadFilter(e.target.value)} className="wa-kit-focus" style={fieldInputStyle}>
              <option value="">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
        </div>
      </div>

      {/* Header row */}
      <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: '0.75rem', gap: 8 }}>
        <div className="wa-flex wa-items-center wa-gap-3">
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)', fontVariantNumeric: 'tabular-nums' }}>
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
          </span>
          {unreadCount > 0 && (
            <StatusTag tone="alert">{unreadCount} unread</StatusTag>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => void markAllRead()}
            className="wa-kit-focus"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 'var(--wa-radius-sm)' }}
          >
            <CheckCheck size={14} aria-hidden />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      {loading && notifications.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--wa-muted)', margin: 0 }}>Loading…</p>
        </div>
      ) : notifications.length === 0 ? (
        <PortalEmptyState
          headingAs="h2"
          title="No notifications"
          description="Notifications will appear here when members complete courses, match with jobs, or need follow-up."
          icon={<BellOff size={40} aria-hidden style={{ color: 'var(--wa-accent)' }} />}
          primaryAction={{ label: 'Refresh', onClick: fetchNotifications }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            const tone = TYPE_TONE[n.type] ?? 'muted';
            const toneColor = TONE_COLOR[tone];
            return (
              <div
                key={n.id}
                className="wa-kit-card wa-kit-card--sm wa-kit-card--hover"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  background: n.readAt ? 'var(--wa-surface)' : 'var(--wa-accent-soft)',
                  borderColor: n.readAt ? 'var(--wa-border)' : 'transparent',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--wa-radius-sm)',
                    background: `color-mix(in srgb, ${toneColor} 12%, transparent)`,
                    color: toneColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="wa-flex wa-items-start wa-justify-between" style={{ gap: 8 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--wa-text)', margin: 0, lineHeight: 1.3 }}>{n.title}</p>
                    <span style={{ fontSize: 13, color: 'var(--wa-muted)', flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {formatTimeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>{n.body}</p>
                  <div className="wa-flex wa-items-center wa-gap-3" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                    <StatusTag tone={tone}>{TYPE_LABEL[n.type] ?? n.type}</StatusTag>
                    <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(n.createdAt)}</span>
                    {!n.readAt && (
                      <button
                        onClick={() => void markRead(n.id)}
                        className="wa-kit-focus"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <Check size={12} aria-hidden />
                        Mark read
                      </button>
                    )}
                    <button
                      onClick={() => void dismiss(n.id)}
                      className="wa-kit-focus"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--wa-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <DismissIcon size={12} aria-hidden />
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
