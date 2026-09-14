import { stream } from '@/lib/api';

/** A thin, cookie-forwarding pass-through to the API's own CSV export —
 *  the same shape `documents/[documentId]/content/route.ts` already takes
 *  for a document's bytes, since a CSV cannot go through `api.get` either. */
export async function GET(): Promise<Response> {
  return stream('/export/clients.csv');
}
