import { api } from '@/lib/api';
import type { UserRow } from '@/lib/types';

/**
 * Display names for just the users a page is showing (assignees, owners).
 *
 * Looking names up in "the first 100 users" or "this project's members" leaves
 * anyone else as a raw id. Asking for exactly the ids on the page is correct
 * at any size. A user that cannot be loaded is simply left out.
 */
export async function loadUserNames(
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  const users = await Promise.all(
    unique.map((id) => api.get<UserRow>(`/users/${id}`).catch(() => null)),
  );
  return new Map(
    users.filter((u): u is UserRow => u !== null).map((u) => [u.id, u.displayName]),
  );
}

/** Display names of active staff, for pickers that store plain text. */
export async function loadStaffNames(): Promise<string[]> {
  const page = await api
    .get<{ items: UserRow[] }>('/users?pageSize=100')
    .catch(() => null);
  return (page?.items ?? [])
    .filter((u) => u.status === 'ACTIVE')
    .map((u) => u.displayName)
    .sort((a, b) => a.localeCompare(b));
}
