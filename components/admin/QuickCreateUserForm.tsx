'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { directoryRoleLabel } from '@/lib/admin/roleLabels';
import { describeMissingRequired, missingRequiredLabels } from '@/lib/forms/requiredFields';

export type CreatedUser = { id: string; fullName: string; email: string; role: string };

/**
 * Quick-create an account (POST /api/admin/users). Shared by the ?ui=legacy
 * manager (which passes onCreated to prepend the row) and the default staff
 * roster (WAP-193), where a successful create shows a status line and
 * refreshes the server-rendered page.
 */
export function QuickCreateUserForm({
  canManageRoles,
  onCreated,
  onStart,
}: {
  canManageRoles: boolean;
  onCreated?: (user: CreatedUser, warning?: string) => void;
  onStart?: () => void;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  /** Quick-create failure, rendered inline in the create form (audit 2026-09-20). */
  const [createError, setCreateError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<{ fullName: string; email: string; role: string; sendResetEmail: boolean }>({
    fullName: '',
    email: '',
    role: canManageRoles ? 'admin' : 'member',
    sendResetEmail: true,
  });
  const [notice, setNotice] = useState<string | null>(null);

  async function createUser() {
    setNotice(null);
    onStart?.();
    const missing = missingRequiredLabels([
      { label: 'Full name', ok: createDraft.fullName.trim().length > 0 },
      { label: 'Email', ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(createDraft.email.trim()) },
    ]);
    if (missing.length > 0) {
      setCreateError(describeMissingRequired(missing, { leadIn: 'Before you can create this account' }));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(createDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof data.error === 'string' && data.error ? data.error : 'Could not create user.');
        return;
      }

      setCreateDraft({
        fullName: '',
        email: '',
        role: canManageRoles ? 'admin' : 'member',
        sendResetEmail: true,
      });
      if (onCreated && data.user) {
        onCreated(data.user as CreatedUser, typeof data.warning === 'string' ? data.warning : undefined);
      } else {
        setNotice(typeof data.warning === 'string' ? data.warning : 'User created.');
        router.refresh();
      }
    } catch {
      setCreateError('Network error while creating user. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <details className="admin-users-create">
        <summary>Create an account</summary>
      <section className="portal-card portal-card--flat" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Quick create</h2>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)' }}>
            Fast access setup for admins, staff, or a basic member login. Use Add member for full enrollment intake.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <input
            type="text"
            aria-label="Full name"
            value={createDraft.fullName}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder="Full name"
            style={{ padding: '0.65rem 0.8rem', borderRadius: '0.65rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', color: 'var(--color-on-surface)' }}
          />
          <input
            type="email"
            aria-label="Email"
            value={createDraft.email}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="name@workforceap.org"
            style={{ padding: '0.65rem 0.8rem', borderRadius: '0.65rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', color: 'var(--color-on-surface)' }}
          />
          <select
            aria-label="Role"
            value={createDraft.role}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, role: e.target.value }))}
            style={{ padding: '0.65rem 0.8rem', borderRadius: '0.65rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', color: 'var(--color-on-surface)' }}
          >
            <option value="member">{directoryRoleLabel('member')}</option>
            {canManageRoles ? <option value="admin">{directoryRoleLabel('admin')}</option> : null}
            {canManageRoles ? <option value="case_manager">{directoryRoleLabel('case_manager')}</option> : null}
            {canManageRoles ? <option value="super_admin">{directoryRoleLabel('super_admin')}</option> : null}
          </select>
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={createDraft.sendResetEmail}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, sendResetEmail: e.target.checked }))}
          />
          Send password setup email right away
        </label>

        {notice ? (
          <p role="status" className="admin-inline-feedback" style={{ margin: 0 }}>
            {notice}
          </p>
        ) : null}

        {createError ? (
          <p
            id="admin-users-create-error"
            role="alert"
            className="admin-inline-feedback admin-inline-feedback--error"
            style={{ margin: 0 }}
            data-testid="admin-users-create-error"
          >
            {createError}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={creating}
            aria-describedby={createError ? 'admin-users-create-error' : undefined}
            onClick={() => void createUser()}
          >
            {creating ? 'Creating…' : 'Create user'}
          </button>
          <a href="/admin/members/new" className="btn btn-outline">Full member intake</a>
          <a href="/admin/invites/new" className="btn btn-outline">Invite instead</a>
        </div>
      </section>
      </details>
    </>
  );
}
