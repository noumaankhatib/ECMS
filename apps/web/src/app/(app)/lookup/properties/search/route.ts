import { formatClientName } from '@ecms/contracts';
import { NextResponse } from 'next/server';

import { api, ApiError } from '@/lib/api';
import type { Client, Page as ApiPage, Property } from '@/lib/types';

/**
 * Backs the `EntityCombobox` type-ahead fields that pick a property —
 * see `api/clients/search/route.ts` for the pattern this mirrors.
 *
 * The sublabel includes the owning client's name, not just the property's
 * own reference — the plain `<select>` this replaced showed the client name
 * against every property specifically so a mismatched pairing (a property
 * that looks right but belongs to the wrong client) looks wrong at a glance,
 * see `projects/new/page.tsx`'s original comment. Losing that here would be
 * a real regression, not just a cosmetic difference.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q) return NextResponse.json([]);

  try {
    const page = await api.get<ApiPage<Property>>(
      `/properties?${new URLSearchParams({ search: q, pageSize: '8' }).toString()}`,
    );

    const clientIds = [...new Set(page.items.map((p) => p.clientId))];
    const clientNames = new Map(
      await Promise.all(
        clientIds.map(
          (clientId) =>
            api
              .get<Client>(`/clients/${clientId}`)
              .then((c): [string, string] => [clientId, formatClientName(c)])
              .catch((): [string, string] => [clientId, 'unknown client']), // archived or deleted since
        ),
      ),
    );

    return NextResponse.json(
      page.items.map((property) => ({
        id: property.id,
        label: property.name,
        sublabel: [clientNames.get(property.clientId), property.reference ?? property.surveyReference]
          .filter(Boolean)
          .join(' · '),
      })),
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
