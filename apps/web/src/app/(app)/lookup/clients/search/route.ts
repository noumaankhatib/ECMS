import { formatClientName } from '@ecms/contracts';
import { NextResponse } from 'next/server';

import { api, ApiError } from '@/lib/api';
import type { Client, Page as ApiPage } from '@/lib/types';

/**
 * Backs the `EntityCombobox` type-ahead fields that pick a client — the
 * same `GET /clients?search=` the Clients list page and proposal "Find the
 * client" box already use, just reachable from client-side `fetch` and
 * trimmed to the shape the combobox needs, the way `api/search/route.ts`
 * already does for the command palette.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q) return NextResponse.json([]);

  try {
    const page = await api.get<ApiPage<Client>>(
      `/clients?${new URLSearchParams({ search: q, pageSize: '8' }).toString()}`,
    );
    return NextResponse.json(
      page.items.map((client) => ({
        id: client.id,
        label: formatClientName(client),
        sublabel: client.reference ?? undefined,
        meta: {
          name: formatClientName(client),
          idNumber: client.civilId ?? client.crNumber ?? '',
          mobile: client.mobileNumber ?? '',
        },
      })),
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
