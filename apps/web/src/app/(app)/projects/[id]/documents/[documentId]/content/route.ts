import { stream } from '@/lib/api';

/**
 * A document's bytes cannot be JSON, so they cannot go through a server
 * action or `api.get`. This route handler is a thin, cookie-forwarding
 * pass-through to the API's own download endpoint — the API still decides
 * `document:view`; this proxies whatever it answers, error responses
 * included, without the browser ever learning the API's address.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  const { id, documentId } = await params;
  return stream(`/projects/${id}/documents/${documentId}/content`);
}
