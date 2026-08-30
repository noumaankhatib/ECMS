import type { AddProjectMember } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { ProjectMember } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

/**
 * Who is on a project.
 *
 * Membership is the mechanism the whole authorization model rests on, so every
 * change here is audited and named: adding someone to a project widens what
 * they can reach, and that must be answerable six months later.
 *
 * Confirmed with the client (decision 3): a System Administrator and a Project
 * Manager may both add members, the Project Manager only on projects they are
 * themselves a member of. Both of those fall out of `project:manage_members`
 * being GLOBAL for one role and PROJECT for the other — no code here needs to
 * know the difference.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string): Promise<ProjectMember[]> {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { grantedAt: 'asc' },
    });
  }

  async add(projectId: string, input: AddProjectMember, actorId: string): Promise<ProjectMember> {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { status: true },
      });
      if (!project) throw appError('NOT_FOUND');
      // A closed project is a historical record. Changing who can reach it
      // after the fact would change what the history means.
      if (project.status === 'CLOSED') {
        throw appError('ILLEGAL_TRANSITION', {
          fields: [{ field: 'projectId', reason: 'This project is closed.' }],
        });
      }

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!user) throw appError('NOT_FOUND', { context: { user_id: input.userId } });
      // A disabled account keeps its history but must not be given new access.
      if (user.status !== 'ACTIVE' || user.deletedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'userId', reason: 'That account is not active.' }],
        });
      }

      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: input.userId } },
      });
      if (existing) {
        throw appError('CONFLICT', {
          fields: [{ field: 'userId', reason: 'They are already on this project.' }],
        });
      }

      const member = await tx.projectMember.create({
        data: {
          projectId,
          userId: input.userId,
          roleCode: input.roleCode,
          grantedBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'MEMBER_ADDED',
        entityType: 'ProjectMember',
        entityId: input.userId,
        projectId,
        after: { userId: input.userId, roleCode: input.roleCode },
      });

      return member;
    });
  }

  /**
   * Takes someone off a project, which takes away everything their role granted
   * them inside it.
   *
   * Removing the last member is refused. A project nobody belongs to is one
   * only a Director or an Administrator can still reach — recoverable, but a
   * surprise nobody wants to discover on a Friday afternoon.
   */
  async remove(projectId: string, userId: string, _actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!member) throw appError('NOT_FOUND');

      const remaining = await tx.projectMember.count({ where: { projectId } });
      if (remaining <= 1) {
        throw appError('DEPENDENCY_EXISTS', {
          fields: [{ field: 'userId', reason: 'A project must keep at least one member.' }],
        });
      }

      await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });

      await this.audit.record(tx, {
        action: 'MEMBER_REMOVED',
        entityType: 'ProjectMember',
        entityId: userId,
        projectId,
        before: { userId, roleCode: member.roleCode },
      });
    });
  }
}
