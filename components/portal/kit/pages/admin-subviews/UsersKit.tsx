'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import { DesignSurface } from '@/components/portal/kit/DesignSurface';
import { PageOpener } from '@/components/portal/kit/PageOpener';
import { DataTable, type Column } from '@/components/portal/kit/DataTable';
import { Avatar } from '@/components/portal/kit/Avatar';
import { useDirectoryNavigation } from '@/components/admin/useDirectoryNavigation';
import { directoryRoleLabel } from '@/lib/admin/roleLabels';

/** Staff roster: server search/pagination, with full readable identities on phones. */
export interface UserRow {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: string;
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
}

const manageHref = (row: UserRow) => `/admin/users?ui=legacy&search=${encodeURIComponent(row.email)}`;

function UserCell({ row }: { row: UserRow }) {
  return (
    <div className="wa-kit-people-identity">
      <Avatar initials={row.initials} size={32} />
      <Link className="wa-kit-people-name wa-kit-focus" href={manageHref(row)}>{row.name}</Link>
    </div>
  );
}

export function UsersKit({ users, total, currentPage = 1, pageSize = 50, searchQuery = '', roleFilter = '' }: UsersKitProps) {
  const { query, search, navigate, pending } = useDirectoryNavigation(searchQuery);
  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'Name', render: row => <UserCell row={row} /> },
    { key: 'email', header: 'Email', render: row => <span className="wa-kit-people-email">{row.email}</span> },
    { key: 'role', header: 'Role', render: row => directoryRoleLabel(row.role) },
    { key: 'lastLogin', header: 'Last login' },
    { key: 'status', header: 'Recent activity', render: row => <Token label={row.active ? 'Recent login' : 'No recent login'} size="sm" color={row.active ? 'green' : 'gray'} /> },
    { key: 'actions', header: 'Account', render: row => <Link className="wa-kit-people-action wa-kit-focus" href={manageHref(row)}>Manage account</Link> },
  ];

  return (
    <DesignSurface surface="dense" className="wa-kit-people-roster">
      <PageOpener className="wa-mb-5" title="Staff & admins" kicker="People" lede="Find a staff account and manage access."
        action={<div className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
          <AstryxLink href="/admin/users?ui=legacy" as={Link as never} isStandalone><Button label="All accounts" variant="secondary" /></AstryxLink>
          <AstryxLink href="/admin/invites/new" as={Link as never} isStandalone><Button label="Invite staff" variant="primary" icon={<Plus size={16} aria-hidden />} /></AstryxLink>
        </div>}
      />
      <div className="wa-kit-people-filters">
        <TextInput label="Search staff & admins" value={query} onChange={search} placeholder="Name or email" hasClear isLoading={pending} />
        <Selector label="Role" value={roleFilter} onChange={role => navigate({ role })} options={[
          { value: '', label: 'All staff roles' }, { value: 'admin', label: 'Admin' },
          { value: 'super_admin', label: 'Super admin' }, { value: 'case_manager', label: 'Case manager' }, { value: 'counselor', label: 'Counselor' },
        ]} />
      </div>
      <p className="wa-kit-people-count" role="status">{pending ? 'Searching all staff accounts…' : `${total.toLocaleString()} matching staff account${total === 1 ? '' : 's'}`}</p>
      <div aria-busy={pending}>
        <DataTable<UserRow> columns={columns} rows={users} rowKey={row => row.id} minWidth={800} mobile="cards"
          cardRender={row => (
            <article className="wa-kit-people-row">
              <UserCell row={row} />
              <p className="wa-kit-people-email">{row.email}</p>
              <p className="wa-kit-people-meta"><strong>{directoryRoleLabel(row.role)}</strong><span>Last login: {row.lastLogin}</span></p>
              <Link className="wa-kit-people-action wa-kit-focus" href={manageHref(row)}>Manage account</Link>
            </article>
          )}
          emptyTitle={pending ? 'Searching…' : searchQuery || roleFilter ? 'No matching staff accounts' : 'No staff accounts yet'}
          emptyDescription={searchQuery || roleFilter ? 'Try a different name, email, or role.' : 'Invite an admin or counselor to get started.'}
        />
      </div>
      {(searchQuery || roleFilter) && <Button label="Clear search & filters" variant="ghost" onClick={() => navigate({ search: '', role: '' })} />}
      {total > pageSize && <Pagination page={currentPage} totalItems={total} pageSize={pageSize} onChange={page => navigate({ page: String(page) })} isDisabled={pending} variant="compact" label="Staff pagination" />}
    </DesignSurface>
  );
}
