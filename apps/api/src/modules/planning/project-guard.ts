import type { Prisma } from '@prisma/client';

import { appError } from '../../shared/errors/app-error';

/**
 * Refuses any mutation on a closed project.
 *
 * Shared by every write in this module — a closed project is the historical
 * record of an engagement, the same rule that already blocks new members and
 * new workstreams on one in the projects module.
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
