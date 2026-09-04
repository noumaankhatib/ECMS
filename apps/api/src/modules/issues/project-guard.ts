import type { Prisma } from '@prisma/client';

import { appError } from '../../shared/errors/app-error';

/**
 * Refuses any mutation on a closed project. Identical to planning's and
 * supervision's guard of the same name — duplicated rather than imported,
 * because a module may only reach into another module's `index`, and this
 * helper is deliberately not part of any module's public surface.
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
