'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { NavBadgeKey } from '@/lib/nav/portalNav';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';
import { useFocusTrap } from '@/hooks/useFocusTrap';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type BadgeNotification = {
  key: string;
  label: string;
  href: string;
  icon: string;
  count: number;
};

function getRole(pathname: string): string {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/employer')) return 'employer';
  if (pathname.startsWith('/partner')) return 'partner';
  if (pathname.startsWith('/counselor')) return 'counselor';
  return 'member';
}

function buildBadgeNotifications(badges: Partial<Record<NavBadgeKey, number>>, role: string): BadgeNotification[] {
  const items: BadgeNotification[] = [];

  if (role === 'member') {
    if ((badges.counselor_messages_unread ?? 0) > 0) {
      items.push({ key: 'msg', label: 'New message from advisor', href: '/dashboard/messages', icon: 'forum', count: badges.counselor_messages_unread! });
    }
  }

  if (role === 'employer') {
    if ((badges.applications_new ?? 0) > 0) {
      items.push({ key: 'apps', label: `${badges.applications_new} new applicants`, href: '/employer/applications', icon: 'person_add', count: badges.applications_new! });
    }
    if ((badges.employer_messages_unread ?? 0) > 0) {
      items.push({ key: 'emsg', label: 'New message', href: '/employer/messages', icon: 'forum', count: badges.employer_messages_unread! });
    }
    if ((badges.employer_queue_review_today ?? 0) > 0) {
      items.push({ key: 'review', label: 'Candidates to review today', href: '/employer/work-queue', icon: 'grading', count: badges.employer_queue_review_today! });
    }
  }

  if (role === 'partner') {
    if ((badges.partner_needs_attention ?? 0) > 0) {
      items.push({ key: 'attn', label: `${badges.partner_needs_attention} members need attention`, href: '/partner/attention', icon: 'warning', count: badges.partner_needs_attention! });
    }
    if ((badges.partner_messages_unread ?? 0) > 0) {
      items.push({ key: 'pmsg', label: 'New message', href: '/partner/messages', icon: 'forum', count: badges.partner_messages_unread! });
    }
    if ((badges.milestones_new ?? 0) > 0) {
      items.push({ key: 'mile', label: `${badges.milestones_new} new milestones`, href: '/partner/milestones', icon: 'flag', count: badges.milestones_new! });
    }
  }

  if (role === 'counselor') {
    if ((badges.counselor_messages_unread ?? 0) > 0) {
      items.push({ key: 'cmsg', label: 'Unread member messages', href: '/counselor/messages', icon: 'forum', count: badges.counselor_messages_unread! });
    }
    if ((badges.counselor_sla_breach_48h ?? 0) > 0) {
      items.push({ key: 'sla', label: `${badges.counselor_sla_breach_48h} SLA breaches >48h`, href: '/counselor/messages', icon: 'schedule', count: badges.counselor_sla_breach_48h! });
    }
  }

  if (role === 'admin') {
    if ((badges.counselor_sla_breach_48h ?? 0) > 0) {
      items.push({ key: 'asla', label: `${badges.counselor_sla_breach_48h} message SLA breaches`, href: '/admin/messages', icon: 'schedule', count: badges.counselor_sla_breach_48h! });
    }
  }

  return items;
}

function getNotificationLink(n: NotificationItem): string {
  const data = n.data ?? {};
  if (data.link && typeof data.link === 'string') return data.link;
  if (data.threadId && typeof data.threadId === 'string') return '/dashboard/messages';
  if (data.jobId && typeof data.jobId === 'string') return '/dashboard/jobs';
  if (data.courseSlug && typeof data.courseSlug === 'string') return '/dashboard/program';
  if (data.surveyId && typeof data.surveyId === 'string') return '/survey/placement';
  return '#';
}

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

type NotificationBellProps = {
  badges?: Partial<Record<NavBadgeKey, number>>;
  readOnlyAudit?: boolean;
};

export default function NotificationBell(props: NotificationBellProps) {
  const role = getRole(usePathname() ?? '');
  // Role transitions discard old results and abort the previous request.
  return <RoleNotificationBell key={`${role}:${!!props.readOnlyAudit}`} {...props} role={role} />;
}

function RoleNotificationBell({ badges: externalBadges, readOnlyAudit = false, role }: NotificationBellProps & { role: string }) {
  const [selfBadges, setSelfBadges] = useState<Partial<Record<NavBadgeKey, number>>>({});
  const [dbNotifications, setDbNotifications] = useState<NotificationItem[]>([]);
  const [dbUnreadCount, setDbUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const closeDropdown = useCallback(() => setOpen(false), []);
  // Escape closes the dropdown and returns focus to the bell button (the
  // previously-focused element); Tab stays inside the panel while it's open.
  const panelTrapRef = useFocusTrap(open, closeDropdown);

  const badges = externalBadges ?? selfBadges;
  const hasExternalBadges = externalBadges != null;

  const refresh = useCallback(async () => {
    if (readOnlyAudit || (role !== 'member' && hasExternalBadges) || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const isMember = role === 'member';
    const timeout = setTimeout(() => controller.abort('notification-timeout'), 10_000);
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
    try {
      setLoading(true);
      setFetchError(null);
      const url = isMember ? '/api/member/notifications?limit=5'
        : `/api/portal/nav-badges?role=${encodeURIComponent(role)}`;
      const response = await fetch(url, { credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new Error(await getErrorMessageFromResponse(response));
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (isMember) {
        setDbNotifications(data.notifications);
        setDbUnreadCount(data.unreadCount);
      } else setSelfBadges(data);
      setLastFetch(Date.now());
    } catch (error) {
      if (controller.signal.reason === 'notification-timeout') setFetchError('Notifications are temporarily unavailable.');
      else if (!controller.signal.aborted) setFetchError(error instanceof Error ? error.message : 'Notifications are temporarily unavailable.');
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'notification-timeout') setLoading(false);
    }
  }, [readOnlyAudit, role, hasExternalBadges]);

  const markRead = useCallback(async (id: string) => {
    if (readOnlyAudit) return;
    try {
      const r = await fetch(`/api/member/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
      if (r.ok) {
        setDbNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
        );
        setDbUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      /* non-fatal */
    }
  }, [readOnlyAudit]);

  const markAllRead = useCallback(async () => {
    if (readOnlyAudit) return;
    try {
      const r = await fetch('/api/member/notifications/read-all', { method: 'POST', credentials: 'include' });
      if (r.ok) {
        setDbNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
        setDbUnreadCount(0);
      }
    } catch {
      /* non-fatal */
    }
  }, [readOnlyAudit]);

  const dismiss = useCallback(async (id: string) => {
    if (readOnlyAudit) return;
    try {
      const r = await fetch(`/api/member/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) {
        // Decrement the unread badge ONLY if the dismissed notification was
        // actually unread. Otherwise dismissing an already-read item makes
        // the bell underreport unread count until the next poll.
        setDbNotifications((prev) => {
          const target = prev.find((n) => n.id === id);
          if (target && !target.readAt) {
            setDbUnreadCount((c) => Math.max(0, c - 1));
          }
          return prev.filter((n) => n.id !== id);
        });
      }
    } catch {
      /* non-fatal */
    }
  }, [readOnlyAudit]);

  // Visible active tabs poll every 45s; idle tabs back off to five minutes.
  // Hidden tabs stop entirely. Explicit refresh/open remains immediate.
  useEffect(() => {
    if (readOnlyAudit || (role !== 'member' && hasExternalBadges)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = Date.now();
    let disposed = false;
    const schedule = () => {
      clearTimeout(timer);
      if (disposed || document.visibilityState === 'hidden') return;
      const delay = Date.now() - lastActivity >= 120_000 ? 300_000 : 45_000;
      timer = setTimeout(() => { void refresh().finally(schedule); }, delay);
    };
    const explicitRefresh = () => {
      lastActivity = Date.now();
      clearTimeout(timer);
      if (document.visibilityState !== 'hidden') void refresh().finally(schedule);
    };
    const activity = () => {
      const wasIdle = Date.now() - lastActivity >= 120_000;
      lastActivity = Date.now();
      if (wasIdle) explicitRefresh();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') clearTimeout(timer);
      else explicitRefresh();
    };
    explicitRefresh();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('keydown', activity);
    window.addEventListener('wa-nav-badges-refresh', explicitRefresh);
    return () => {
      disposed = true;
      clearTimeout(timer);
      requestRef.current?.abort();
      requestRef.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('wa-nav-badges-refresh', explicitRefresh);
    };
  }, [refresh, readOnlyAudit, role, hasExternalBadges]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const badgeNotifications = buildBadgeNotifications(badges, role);
  const badgeTotal = badgeNotifications.reduce((s, n) => s + n.count, 0);
  const totalUnread = role === 'member' ? dbUnreadCount : badgeTotal;
  const isDbMode = role === 'member';

  return (
    <div
      ref={dropRef}
      data-portal-audit-suppressed={readOnlyAudit ? 'notification-fetch-poll-and-mutations' : undefined}
      data-portal-error-state={fetchError ? 'notification-bell-fetch' : undefined}
      style={{ position: 'relative', flexShrink: 0 }}
    >
      <button
        type="button"
        className="portal-icon-btn"
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen) {
            // NOTE: opening does NOT auto-mark notifications read — use the
            // "Mark all read" action in the dropdown header instead.
            if (!readOnlyAudit && Date.now() - lastFetch > 10_000) {
              void refresh();
            }
          }
        }}
        aria-label={totalUnread > 0 ? `${totalUnread} notification${totalUnread !== 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={open}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem', background: open ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent', border: 'none', cursor: 'pointer', color: totalUnread > 0 ? 'var(--color-accent)' : 'var(--color-on-surface-variant)', transition: 'background 0.15s' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', fontVariationSettings: totalUnread > 0 ? "'FILL' 1" : "'FILL' 0" }}>
          notifications
        </span>
        {totalUnread > 0 && (
          <span style={{ position: 'absolute', top: '-2px', right: '-2px', minWidth: '1.125rem', height: '1.125rem', borderRadius: '9999px', background: 'var(--color-accent)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 0.25rem', lineHeight: 1, border: '2px solid var(--surface-container-low, #1a1c1e)' }}>
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelTrapRef as React.RefObject<HTMLDivElement>} style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, width: '22rem', maxWidth: '90vw', zIndex: 200, borderRadius: '0.875rem', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontWeight: 800, fontSize: '0.8125rem', color: 'var(--color-on-surface)', margin: 0 }}>Notifications</p>
            {isDbMode && dbUnreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.375rem' }}
              >
                Mark all read
              </button>
            )}
            {!isDbMode && badgeTotal > 0 && (
              <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {badgeTotal} new
              </span>
            )}
          </div>

          {fetchError && (
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(173,44,77,0.08)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-accent)' }}>error</span>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-accent)', fontWeight: 600 }}>{fetchError}</p>
            </div>
          )}

          {isDbMode ? (
            loading && dbNotifications.length === 0 ? (
              <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>Loading…</p>
              </div>
            ) : dbNotifications.length === 0 && !fetchError ? (
              <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.75rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.5rem', fontVariationSettings: "'FILL' 1" }}>notifications_none</span>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>All caught up</p>
              </div>
            ) : (
              <div style={{ maxHeight: '24rem', overflowY: 'auto' }}>
                {dbNotifications.map((n) => (
                  <div
                    key={n.id}
                    className="portal-notification-item"
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1rem', textDecoration: 'none', color: 'inherit', transition: 'background 0.15s', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: n.readAt ? 0.7 : 1, background: n.readAt ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 4%, transparent)' }}
                  >
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '0.125rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>
                        {n.type === 'message' ? 'forum' : n.type === 'course_complete' ? 'school' : n.type === 'job_match' ? 'work' : n.type === 'survey_due' ? 'assignment' : n.type === 'broadcast' ? 'campaign' : 'notifications'}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={getNotificationLink(n)} onClick={() => { if (!n.readAt) void markRead(n.id); setOpen(false); }} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3 }}>{n.title}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.body}</p>
                      </a>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>{formatTimeAgo(n.createdAt)}</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {!n.readAt && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void markRead(n.id); }}
                              style={{ fontSize: '0.7rem', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              Mark read
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); void dismiss(n.id); }}
                            style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            badgeNotifications.length === 0 ? (
              <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.75rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.5rem', fontVariationSettings: "'FILL' 1" }}>notifications_none</span>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>All caught up</p>
              </div>
            ) : (
              <div>
                {badgeNotifications.map((n) => (
                  <a
                    key={n.key}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="portal-notification-item"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem', textDecoration: 'none', color: 'inherit', transition: 'background 0.15s', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>{n.icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</p>
                    </div>
                    {n.count > 0 && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-accent)', flexShrink: 0 }}>{n.count}</span>
                    )}
                  </a>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
