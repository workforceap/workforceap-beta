'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Plus, SquarePen, Trash2, UserCog } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { DesignSurface } from '@/components/portal/kit/DesignSurface';
import { PageOpener } from '@/components/portal/kit/PageOpener';
import { DataTable, type Column } from '@/components/portal/kit/DataTable';
import { KitTableToolbar } from '@/components/portal/kit/KitTableToolbar';
import { KitRowMenu, type KitRowMenuItem } from '@/components/portal/kit/KitRowMenu';
import { QuickCreateUserForm } from '@/components/admin/QuickCreateUserForm';
import { StatusTag } from '@/components/portal/kit/StatusTag';
import { Avatar } from '@/components/portal/kit/Avatar';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';
import { useDirectoryNavigation } from '@/components/admin/useDirectoryNavigation';
import { directoryRoleLabel } from '@/lib/admin/roleLabels';
import { ADMIN_USER_ROLES } from '@/lib/admin/adminUserProvisioning';
import { isSelfRow, SELF_DELETE_BLOCKED_TITLE, SELF_ROLE_CHANGE_BLOCKED_TITLE } from '@/lib/admin/usersSelfGuard';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

/** Staff roster: server search/pagination, with full readable identities on phones. */
export interface UserRow {
  id: string;
  name: string;
  initials: string;
  email: string;
  /** Display role (label or code; rendered through `directoryRoleLabel`). */
  role: string;
  /** Stored role code (`admin`, `super_admin`, …) for the role editor. */
  roleCode?: string;
  lastLogin: string;
  active: boolean;
}

export interface UsersKitProps {
  users: UserRow[];
  total: number;
  currentPage?: number;
  pageSize?: number;
  searchQuery?: string;
  roleFilter?: string;
  /** Signed-in admin; their own row never offers Delete or a role change. */
  currentUserId?: string;
  /** Super admins may change roles and delete accounts. */
  canManageRoles?: boolean;
  /** Render the quick-create account form under the roster (WAP-193). */
  quickCreate?: boolean;
}

const roleCodeOf = (row: UserRow) => row.roleCode ?? row.role.trim().toLowerCase().replace(/\s+/g, '_');

type Feedback = { type: 'ok' | 'err'; text: string };

function UserCell({ row }: { row: UserRow }) {
  return (
    <div className="wa-kit-people-identity">
      <Avatar initials={row.initials} size={32} />
      <span className="wa-kit-people-name wa-kit-table-cell--truncate" title={row.name}>{row.name}</span>
    </div>
  );
}

export function UsersKit({
  users: initialUsers,
  total,
  currentPage = 1,
  pageSize = 50,
  searchQuery = '',
  roleFilter = '',
  currentUserId,
  canManageRoles = false,
  quickCreate = false,
}: UsersKitProps) {
  const router = useRouter();
  const { query, search, navigate, pending } = useDirectoryNavigation(searchQuery);
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  useEffect(() => { setUsers(initialUsers); }, [initialUsers]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<string>('admin');
  // Inline name/email edit (WAP-193: used to open the ?ui=legacy manager).
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const closeConfirmDelete = () => setConfirmDeleteId(null);
  const confirmTrapRef = useFocusTrap<HTMLSpanElement>(Boolean(confirmDeleteId), { onEscape: closeConfirmDelete });

  async function saveRole(row: UserRow) {
    setBusyId(row.id);
    setFeedback(null);
    try {
      // Same route and payload shape as the legacy manager's Save.
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fullName: row.name, email: row.email, role: draftRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error ?? 'Could not update the role.' });
        return;
      }
      const nextRole: string = data.user?.role ?? draftRole;
      setUsers((prev) => prev.map((u) => (u.id === row.id ? { ...u, role: nextRole, roleCode: nextRole } : u)));
      setEditingId(null);
      setFeedback({ type: 'ok', text: `${row.name} is now ${directoryRoleLabel(nextRole)}.` });
      router.refresh();
    } catch {
      setFeedback({ type: 'err', text: 'Network error while updating the role.' });
    } finally {
      setBusyId(null);
    }
  }

  async function saveDetails(row: UserRow) {
    const fullName = draftName.trim();
    const email = draftEmail.trim();
    if (!fullName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFeedback({ type: 'err', text: 'Enter a full name and a valid email.' });
      return;
    }
    setBusyId(row.id);
    setFeedback(null);
    try {
      // Same route as the legacy manager's Save; name and email only, so a
      // super admin's own row never sends a role.
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fullName, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error ?? 'Could not save the account.' });
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === row.id ? { ...u, name: data.user?.fullName ?? fullName, email: data.user?.email ?? email } : u,
        ),
      );
      setDetailsId(null);
      setFeedback({ type: 'ok', text: `${fullName} was updated.` });
      router.refresh();
    } catch {
      setFeedback({ type: 'err', text: 'Network error while saving the account.' });
    } finally {
      setBusyId(null);
    }
  }

  async function sendReset(row: UserRow) {
    setBusyId(row.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${row.id}/reset-password`, { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error ?? 'Could not send the reset email.' });
        return;
      }
      setFeedback({ type: 'ok', text: data.message ?? `Password reset sent to ${row.email}.` });
    } catch {
      setFeedback({ type: 'err', text: 'Network error while sending the reset email.' });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(row: UserRow) {
    setBusyId(row.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error ?? 'Could not delete the account.' });
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== row.id));
      setConfirmDeleteId(null);
      setFeedback({ type: 'ok', text: `${row.name} was deleted.` });
      router.refresh();
    } catch {
      setFeedback({ type: 'err', text: 'Network error while deleting the account.' });
    } finally {
      setBusyId(null);
    }
  }

  const menuItemsFor = (row: UserRow): KitRowMenuItem[] => {
    const self = isSelfRow(currentUserId, row.id);
    const items: KitRowMenuItem[] = [
      {
        key: 'edit',
        label: 'Edit name & email',
        icon: <SquarePen size={16} />,
        onSelect: () => {
          setDraftName(row.name);
          setDraftEmail(row.email);
          setDetailsId(row.id);
          setEditingId(null);
          setFeedback(null);
        },
      },
    ];
    if (canManageRoles) {
      items.push({
        key: 'role',
        label: 'Change role',
        icon: <UserCog size={16} />,
        disabled: self,
        reason: self ? SELF_ROLE_CHANGE_BLOCKED_TITLE : undefined,
        onSelect: () => {
          setDraftRole(roleCodeOf(row));
          setEditingId(row.id);
          setFeedback(null);
        },
      });
    }
    items.push({
      key: 'reset',
      label: 'Send password reset',
      icon: <KeyRound size={16} />,
      onSelect: () => void sendReset(row),
    });
    if (canManageRoles) {
      items.push({
        key: 'delete',
        label: 'Delete account',
        icon: <Trash2 size={16} />,
        tone: 'danger',
        disabled: self,
        reason: self ? SELF_DELETE_BLOCKED_TITLE : undefined,
        onSelect: () => setConfirmDeleteId(row.id),
      });
    }
    return items;
  };

  const actionsFor = (row: UserRow) => {
    if (confirmDeleteId === row.id) {
      return (
        <span
          ref={confirmTrapRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Confirm delete user ${row.name}`}
          className="wa-flex wa-items-center wa-gap-2"
        >
          <span className="wa-kit-meta">Delete {row.name}?</span>
          <Button label={busyId === row.id ? 'Deleting…' : 'Yes, delete'} variant="primary" size="sm" isDisabled={busyId === row.id} onClick={() => void deleteUser(row)} />
          <Button label="Cancel" variant="ghost" size="sm" onClick={closeConfirmDelete} />
        </span>
      );
    }
    return <KitRowMenu label={`Actions for ${row.name}`} items={menuItemsFor(row)} />;
  };

  const roleFor = (row: UserRow) => {
    if (editingId !== row.id) return directoryRoleLabel(row.role);
    return (
      <span className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
        <select
          aria-label="Account role"
          className="wa-kit-toolbar__input wa-kit-focus"
          style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }}
          value={draftRole}
          disabled={isSelfRow(currentUserId, row.id)}
          onChange={(e) => setDraftRole(e.target.value)}
        >
          {ADMIN_USER_ROLES.map((role) => (
            <option key={role} value={role}>{directoryRoleLabel(role)}</option>
          ))}
        </select>
        <Button label={busyId === row.id ? 'Saving…' : 'Save role'} variant="primary" size="sm" isDisabled={busyId === row.id} onClick={() => void saveRole(row)} />
        <Button label="Cancel" variant="ghost" size="sm" onClick={() => setEditingId(null)} />
      </span>
    );
  };

  const nameFor = (row: UserRow) => {
    if (detailsId !== row.id) return <UserCell row={row} />;
    return (
      <span className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
        <input
          aria-label="Full name"
          className="wa-kit-toolbar__input wa-kit-focus"
          style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />
        <input
          aria-label="Email"
          type="email"
          className="wa-kit-toolbar__input wa-kit-focus"
          style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }}
          value={draftEmail}
          onChange={(e) => setDraftEmail(e.target.value)}
        />
        <Button label={busyId === row.id ? 'Saving…' : 'Save'} variant="primary" size="sm" isDisabled={busyId === row.id} onClick={() => void saveDetails(row)} />
        <Button label="Cancel" variant="ghost" size="sm" onClick={() => setDetailsId(null)} />
      </span>
    );
  };

  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'Name', stickyLeft: true, minWidth: 200, render: nameFor },
    { key: 'email', header: 'Email', render: row => <span className="wa-kit-people-email wa-kit-table-cell--truncate" title={row.email}>{row.email}</span> },
    { key: 'role', header: 'Role', render: roleFor },
    { key: 'lastLogin', header: 'Last login', render: row => <span className="wa-kit-table-cell--nowrap">{row.lastLogin}</span> },
    { key: 'status', header: 'Recent activity', render: row => <StatusTag tone={row.active ? 'ok' : 'muted'}>{row.active ? 'Recent login' : 'No recent login'}</StatusTag> },
    { key: 'actions', header: <span className="wa-sr-only">Actions</span>, align: 'right', render: actionsFor },
  ];

  const filtersOn = roleFilter ? 1 : 0;
  const hasQuery = Boolean(searchQuery || roleFilter);

  return (
    <DesignSurface surface="dense" className="wa-kit-people-roster">
      <PageOpener className="wa-mb-5" title="Staff & admins" kicker="People" lede="Find a staff account and manage access."
        action={<div className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
          <KitLinkButton href="/admin/users?ui=legacy" label="All accounts" variant="secondary" size="md" />
          <KitLinkButton href="/admin/invites/new" label="Invite staff" variant="primary" size="md" icon={<Plus size={16} aria-hidden />} />
        </div>}
      />
      <KitTableToolbar
        searchLabel="Search staff & admins"
        searchValue={query}
        onSearchChange={search}
        searchPlaceholder="Name or email"
        pending={pending}
        filtersOn={filtersOn}
        onClearFilters={() => navigate({ search: '', role: '' })}
        filters={
          <Selector label="Role" value={roleFilter} onChange={role => navigate({ role })} options={[
            { value: '', label: 'All staff roles' }, { value: 'admin', label: 'Admin' },
            { value: 'super_admin', label: 'Super admin' }, { value: 'case_manager', label: 'Case manager' }, { value: 'counselor', label: 'Counselor' },
          ]} />
        }
      />
      <p className="wa-kit-people-count" role="status">{pending ? 'Searching all staff accounts…' : `${total.toLocaleString()} matching staff account${total === 1 ? '' : 's'}`}</p>
      {feedback?.type === 'ok' ? <p className="wa-kit-people-count" role="status" data-testid="users-feedback">{feedback.text}</p> : null}
      <DataTable<UserRow> columns={columns} rows={users} rowKey={row => row.id} rowLabel={row => row.name} minWidth={800} mobile="cards"
        loading={pending}
        scrollCue
        errorNotice={feedback?.type === 'err' ? feedback.text : undefined}
        pagination={{ page: currentPage, pageSize, totalItems: total, onChange: page => navigate({ page: String(page) }), isDisabled: pending, label: 'Staff pagination' }}
        cardRender={row => (
          <article className="wa-kit-people-row">
            <div className="wa-flex wa-items-start wa-justify-between wa-gap-2">
              {nameFor(row)}
              {actionsFor(row)}
            </div>
            <p className="wa-kit-people-email">{row.email}</p>
            <p className="wa-kit-people-meta"><strong>{roleFor(row)}</strong><span>Last login: {row.lastLogin}</span></p>
            <StatusTag tone={row.active ? 'ok' : 'muted'}>{row.active ? 'Recent login' : 'No recent login'}</StatusTag>
          </article>
        )}
        emptyTitle={pending ? 'Searching…' : hasQuery ? 'No matching staff accounts' : 'No staff accounts yet'}
        emptyDescription={hasQuery ? 'Try a different name, email, or role.' : 'Invite an admin or counselor to get started.'}
      />
      {quickCreate ? (
        <section aria-label="Create an account" style={{ marginTop: 24 }}>
          <QuickCreateUserForm canManageRoles={canManageRoles} />
        </section>
      ) : null}
    </DesignSurface>
  );
}
