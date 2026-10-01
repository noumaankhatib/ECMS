import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Marks every workstream on a project Completed, directly.
 *
 * For tests whose subject is something after completion (closing, read-only
 * rules): completing a project now requires its workstreams to be finished
 * first (CompletionGateService), and walking each one through the real gate
 * is `completion-gates.test.ts`'s job, not theirs.
 */
export async function finishWorkstreams(prisma: PrismaService, projectId: string): Promise<void> {
  await prisma.workstream.updateMany({
    where: { projectId },
    data: { status: 'COMPLETED', version: { increment: 1 } },
  });
}
