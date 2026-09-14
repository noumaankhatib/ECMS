import { stream } from '@/lib/api';

/** See `export/clients/route.ts` — same pass-through, next register. */
export async function GET(): Promise<Response> {
  return stream('/export/issues.csv');
}
