import { ROLE_DEFINITIONS } from '@ecms/contracts';
import Link from 'next/link';

import { Badge, Card, DateText, Empty, PageHead, Pagination } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Page as ApiPage, UserRow } from '@/lib/types';

export const metadata = { title: 'Users — ECMS' };

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const session = await requirePermission('user:view');
  const params = await searchParams;
  const pageNumber = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) });
  if (params.search) query.set('search', params.search);

  const page = await api.get<ApiPage<UserRow>>(`/users?${query.toString()}`);
  const roleName = new Map(ROLE_DEFINITIONS.map((r) => [r.code as string, r.name]));

  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    q.set('page', String(targetPage));
    return `/users?${q.toString()}`;
  }

  return (
    <>
      <PageHead title="Users" description="Who can sign in, and what kind of work they do.">
        {session.can('user:admin') ? (
          <Link href="/users/new" className="button">
            New user
          </Link>
        ) : null}
      </PageHead>

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by name, username or email"
          aria-label="Search users"
          style={{ maxWidth: 320 }}
        />
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <Empty title="No users found">Try a different search term.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {page.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <Link href={`/users/${user.id}`}>{user.displayName}</Link>
                    </td>
                    <td className="mono">{user.username}</td>
                    <td>{user.email ?? <span className="faint">—</span>}</td>
                    <td>
                      <div className="row">
                        {user.roles.length === 0 ? (
                          // Worth pointing out: no role means no permissions at
                          // all, which looks like a broken account to its owner.
                          <span className="faint">No role — cannot do anything</span>
                        ) : (
                          user.roles.map((role) => (
                            <Badge key={role}>{roleName.get(role) ?? role}</Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="nowrap">
                      <DateText value={user.createdAt} />
                    </td>
                    <td className="right">
                      {user.status === 'DISABLED' ? <span className="badge">Disabled</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={pageNumber} pageSize={PAGE_SIZE} total={page.total} buildHref={buildHref} />
    </>
  );
}
