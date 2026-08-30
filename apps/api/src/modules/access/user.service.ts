import type {
  AssignRole,
  CreateUser,
  ListQuery,
  Page,
  Role,
  SetPassword,
  UpdateUser,
  UserStatus,
  UserSummary,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/** A user row as the interface sees it. The password hash never leaves here. */
type UserWithRoles = Prisma.UserGetPayload<{ include: { roles: true } }>;

const toSummary = (user: UserWithRoles): UserSummary => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  status: user.status as UserStatus,
  roles: user.roles.map((r) => r.roleCode as Role),
  createdAt: user.createdAt.toISOString(),
});

/**
 * User administration.
 *
 * The break-glass CLI stays, but this is how accounts are managed from now on.
 * Two rules run through everything here:
 *
 *   A password is never returned, never logged, and never included in an audit
 *   row — not even as a redacted placeholder that someone might later "fix" by
 *   filling in.
 *
 *   Disabling someone takes effect immediately. Sessions are server-side
 *   precisely so that revoking access does not mean waiting for a token to
 *   expire, and this is the place that promise is kept.
 */
@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async list(query: ListQuery): Promise<Page<UserSummary>> {
    const where: Prisma.UserWhereInput = {
      ...(query.includeArchived ? {} : { deletedAt: null }),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { roles: true },
        orderBy: { displayName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async byId(id: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!user) throw appError('NOT_FOUND');
    return toSummary(user);
  }

  async create(input: CreateUser, actorId: string): Promise<UserSummary> {
    // Hashing is deliberately outside the transaction. Argon2id is meant to be
    // slow — that is the entire point of it — and holding a database
    // transaction open for the duration would put that cost on the connection
    // pool for no benefit.
    const passwordHash = await this.passwords.hash(input.password);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw appError('CONFLICT', {
          fields: [{ field: 'email', reason: 'An account already uses that address.' }],
        });
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          roles: { create: { roleCode: input.roleCode, grantedBy: actorId } },
        },
        include: { roles: true },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'User',
        entityId: user.id,
        // Note what is absent. The password does not appear here in any form.
        after: { email: user.email, displayName: user.displayName, role: input.roleCode },
      });

      return toSummary(user);
    });
  }

  /**
   * Changes a name, or enables and disables an account.
   *
   * Disabling revokes every session the person holds, in the same transaction.
   * Leaving them signed in until their cookie expired would make "disabled"
   * mean "disabled tomorrow", which is not what anyone reaching for it means.
   */
  async update(id: string, input: UpdateUser, actorId: string): Promise<UserSummary> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, include: { roles: true } });
      if (!before) throw appError('NOT_FOUND');

      if (input.status === 'DISABLED' && id === actorId) {
        // Locking yourself out is recoverable only from the command line.
        throw appError('CONFLICT', {
          fields: [{ field: 'status', reason: 'You cannot disable your own account.' }],
        });
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: { roles: true },
      });

      if (input.status === 'DISABLED' && before.status !== 'DISABLED') {
        await this.sessions.revokeAllForUser(tx, id);
      }

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'User',
        entityId: id,
        before: { displayName: before.displayName, status: before.status },
        after: { displayName: user.displayName, status: user.status },
      });

      return toSummary(user);
    });
  }

  /**
   * Sets someone's password.
   *
   * Every other session they hold is revoked. If this is being used because an
   * account was compromised, leaving the attacker's session alive would defeat
   * the exercise entirely.
   */
  async setPassword(id: string, input: SetPassword, actorId: string): Promise<void> {
    const passwordHash = await this.passwords.hash(input.password);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) throw appError('NOT_FOUND');

      await tx.user.update({ where: { id }, data: { passwordHash } });
      await this.sessions.revokeAllForUser(tx, id);

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'User',
        entityId: id,
        // That it happened, by whom, and to whom. Never what it was changed to.
        after: { passwordChanged: true, by: actorId },
      });
    });
  }

  async assignRole(id: string, input: AssignRole, actorId: string): Promise<UserSummary> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) throw appError('NOT_FOUND');

      const existing = await tx.userRole.findUnique({
        where: { userId_roleCode: { userId: id, roleCode: input.roleCode } },
      });
      if (existing) {
        throw appError('CONFLICT', {
          fields: [{ field: 'roleCode', reason: 'They already hold that role.' }],
        });
      }

      await tx.userRole.create({
        data: { userId: id, roleCode: input.roleCode, grantedBy: actorId },
      });

      // A role change is a change to what somebody may do. It belongs in the
      // audit trail as prominently as anything else in this system.
      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'UserRole',
        entityId: id,
        after: { roleCode: input.roleCode, granted: true },
      });

      const after = await tx.user.findUniqueOrThrow({
        where: { id },
        include: { roles: true },
      });
      return toSummary(after);
    });
  }

  /**
   * Takes a role away.
   *
   * Removing the last System Administrator is refused. There would then be
   * nobody able to grant the role back, and the only way out would be the
   * command line on the server — which is exactly the situation nobody wants to
   * be in at five o'clock on a Friday.
   */
  async removeRole(id: string, roleCode: Role, _actorId: string): Promise<UserSummary> {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.userRole.findUnique({
        where: { userId_roleCode: { userId: id, roleCode } },
      });
      if (!membership) throw appError('NOT_FOUND');

      if (roleCode === 'SYSTEM_ADMINISTRATOR') {
        const administrators = await tx.userRole.count({
          where: { roleCode: 'SYSTEM_ADMINISTRATOR', user: { status: 'ACTIVE', deletedAt: null } },
        });
        if (administrators <= 1) {
          throw appError('DEPENDENCY_EXISTS', {
            fields: [
              {
                field: 'roleCode',
                reason: 'This is the last active System Administrator. Appoint another first.',
              },
            ],
          });
        }
      }

      await tx.userRole.delete({ where: { userId_roleCode: { userId: id, roleCode } } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'UserRole',
        entityId: id,
        before: { roleCode, granted: true },
        after: { roleCode, granted: false },
      });

      const after = await tx.user.findUniqueOrThrow({ where: { id }, include: { roles: true } });
      return toSummary(after);
    });
  }
}
