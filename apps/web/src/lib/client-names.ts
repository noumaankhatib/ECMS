import { formatClientName } from '@ecms/contracts';

import { api } from '@/lib/api';
import type { Client } from '@/lib/types';

/**
 * Display names for just the clients a list page is showing.
 *
 * Fetching "the first 100 clients" and looking names up in that breaks as soon
 * as there are more than 100, leaving most rows blank. Asking for exactly the
 * ids on the page is correct at any size (a page holds at most 100 rows).
 * A client that cannot be loaded is simply left out.
 */
export async function loadClientNames(
  clientIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(clientIds.filter((id): id is string => !!id))];
  const clients = await Promise.all(
    unique.map((id) => api.get<Client>(`/clients/${id}`).catch(() => null)),
  );
  return new Map(
    clients.filter((c): c is Client => c !== null).map((c) => [c.id, formatClientName(c)]),
  );
}
