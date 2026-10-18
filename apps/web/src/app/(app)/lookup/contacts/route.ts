import { NextResponse } from 'next/server';

import { api, ApiError } from '@/lib/api';
import type { Contact } from '@/lib/types';

/**
 * The saved contacts of one client, for the "pick a saved contact" list on the
 * proposal form. Trimmed to what that list shows and fills in.
 */
export async function GET(request: Request): Promise<Response> {
  const clientId = new URL(request.url).searchParams.get('clientId')?.trim();
  if (!clientId) return NextResponse.json([]);

  try {
    const contacts = await api.get<Contact[]>(`/clients/${encodeURIComponent(clientId)}/contacts`);
    return NextResponse.json(
      contacts
        .filter((contact) => !contact.archivedAt)
        .map((contact) => ({
          id: contact.id,
          name: contact.name,
          phone: contact.phone ?? '',
          position: contact.position ?? '',
          isPrimary: contact.isPrimary,
        })),
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
