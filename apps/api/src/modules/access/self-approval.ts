import type { SelfApprovalOverride } from '@ecms/contracts';

import type { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';

/**
 * Who may approve something they created themselves — nobody, except a person
 * who holds `approval:override_self` AND says why.
 *
 * Used by every approval in the system (drawing revisions, submissions,
 * modifications) so the rule reads the same everywhere. Returns the override
 * to record in the audit trail, or undefined when the approver is somebody
 * other than the creator (any override they sent is then ignored, not
 * recorded). Throws the refusal otherwise.
 */
export async function guardSelfApproval(
  prisma: PrismaService,
  input: {
    actorId: string;
    createdBy: string | null;
    override: SelfApprovalOverride | undefined;
    /** "drawing revision", "submission", "modification" — for the message. */
    what: string;
    context: Record<string, string>;
  },
): Promise<SelfApprovalOverride | undefined> {
  if (input.createdBy !== input.actorId) return undefined;

  if (!input.override) {
    throw appError('FORBIDDEN', {
      // Said to the person, not only logged: otherwise the refusal reads as a
      // missing permission when the real cause is who created the record.
      fields: [
        {
          field: 'selfApproval',
          reason: `You cannot approve a ${input.what} you created yourself. Ask another approver to do it.`,
        },
      ],
      context: { ...input.context, reason: 'self_approval' },
    });
  }

  // Held globally by System Administrator and Director only (see the
  // migration); there is no project-scoped form of this authority.
  const held = await prisma.rolePermission.count({
    where: {
      permission: 'approval:override_self',
      scope: 'GLOBAL',
      role: { users: { some: { userId: input.actorId } } },
    },
  });
  if (held === 0) {
    throw appError('FORBIDDEN', {
      fields: [
        {
          field: 'selfApproval',
          reason: `You cannot approve a ${input.what} you created yourself. Only a Director or System Administrator may, and only with a written reason.`,
        },
      ],
      context: { ...input.context, reason: 'self_approval_not_permitted' },
    });
  }

  return input.override;
}
