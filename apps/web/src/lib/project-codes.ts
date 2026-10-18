import { api } from '@/lib/api';
import type { Project } from '@/lib/types';

/**
 * Codes for just the projects a list is showing (e.g. the project a proposal
 * became). Asking for exactly the ids on the page is correct at any size; a
 * project that cannot be loaded (no access, deleted) is left out.
 */
export async function loadProjectCodes(
  projectIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(projectIds.filter((id): id is string => !!id))];
  const projects = await Promise.all(
    unique.map((id) => api.get<Project>(`/projects/${id}`).catch(() => null)),
  );
  return new Map(projects.filter((p): p is Project => p !== null).map((p) => [p.id, p.code]));
}
