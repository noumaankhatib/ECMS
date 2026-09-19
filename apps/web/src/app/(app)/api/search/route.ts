import type { SearchResult } from '@ecms/contracts';
import { NextResponse } from 'next/server';

import { api, ApiError } from '@/lib/api';

/**
 * A thin, JSON-returning twin of `/search` (`app/(app)/search/page.tsx`) —
 * the same `GET /search?q=` call the search page already makes, just
 * reachable from client-side `fetch` (the command palette) instead of a
 * full page navigation. It proxies the API's answer, refusals included,
 * exactly the way every other route handler in this app does (see
 * `documents/[documentId]/content/route.ts`) — it does not decide anything
 * the API has not already decided.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q) return NextResponse.json([]);

  try {
    const results = await api.get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`);
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
