import { stream } from '@/lib/api';

/**
 * A drawing revision's bytes cannot be JSON, so they cannot go through a
 * server action or `api.get` — the same reason the document content route
 * exists. This is a thin, cookie-forwarding pass-through to the API's own
 * download endpoint; the API still decides `drawing:view`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; drawingId: string; revisionId: string }> },
): Promise<Response> {
  const { id, drawingId, revisionId } = await params;
  return stream(`/projects/${id}/drawings/${drawingId}/revisions/${revisionId}/content`);
}
