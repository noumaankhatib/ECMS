import type { Prisma } from '@prisma/client';

import { appError } from '../../shared/errors/app-error';

/**
 * Refuses any mutation on a closed project. Identical to planning's guard of
 * the same name — duplicated rather than imported, because a module may only
 * reach into another module's `index`, and this helper is deliberately not
 * part of either module's public surface.
 */
export async function requireOpenProject(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) throw appError('NOT_FOUND');
  if (project.status === 'CLOSED') {
    throw appError('ILLEGAL_TRANSITION', {
      fields: [{ field: 'projectId', reason: 'This project is closed.' }],
    });
  }
}

/**
 * Observations and instructions are reached through a site visit, which is
 * itself reached through a project — two levels of nesting, so two checks:
 * the visit must belong to the project named in the URL, exactly as an
 * activity is checked against the project in Phase 2's other module, and a
 * workstream against its project in Phase 1.
 */
export async function requireSiteVisit(
  tx: Prisma.TransactionClient,
  projectId: string,
  siteVisitId: string,
): Promise<{ id: string; projectId: string }> {
  const visit = await tx.siteVisit.findUnique({
    where: { id: siteVisitId },
    select: { id: true, projectId: true },
  });
  if (!visit || visit.projectId !== projectId) throw appError('NOT_FOUND');
  return visit;
}
