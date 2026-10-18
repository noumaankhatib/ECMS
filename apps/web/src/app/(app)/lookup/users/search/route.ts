import { NextResponse } from 'next/server';

import { api, ApiError } from '@/lib/api';
import type { Page as ApiPage, UserRow } from '@/lib/types';

/**
 * Backs the `EntityCombobox` type-ahead fields that pick a user (assigned
 * architect, site engineer, project member) — see
 * `api/clients/search/route.ts` for the pattern this mirrors.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  // Project-member pickers pass the current members' ids here so someone
  // already on the project doesn't show up as a candidate to re-add — the
  // API has no such filter itself, this is purely a UI narrowing.
  const excludeIds = new Set(searchParams.get('excludeIds')?.split(',').filter(Boolean) ?? []);
  const activeOnly = searchParams.get('activeOnly') === 'true';
  // Narrows candidates to people holding one of these roles, e.g. an architect
  // is chosen from planning staff rather than every account.
  const roles = new Set(searchParams.get('roles')?.split(',').filter(Boolean) ?? []);
  // An empty term lists people (for `browseOnFocus` fields) only when asked to.
  const browse = searchParams.get('browse') === 'true';

  if (!q && !browse) return NextResponse.json([]);

  try {
    const page = await api.get<ApiPage<UserRow>>(
      // Overfetch a little before filtering locally, so excluding a few ids,
      // roles or disabled accounts doesn't leave fewer than 8 results on screen.
      `/users?${new URLSearchParams({ ...(q ? { search: q } : {}), pageSize: '100' }).toString()}`,
    );
    const filtered = page.items
      .filter((user) => !excludeIds.has(user.id))
      .filter((user) => !activeOnly || user.status === 'ACTIVE')
      .filter((user) => roles.size === 0 || user.roles.some((role) => roles.has(role)))
      .slice(0, 8);
    return NextResponse.json(
      filtered.map((user) => ({
        id: user.id,
        label: user.displayName,
        sublabel: user.username,
      })),
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
