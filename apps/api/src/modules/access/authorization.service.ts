import type { Permission } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';

/** What a user may do, resolved once per request. */
export interface Grants {
  /** Permissions held across the whole portfolio. */
  readonly global: ReadonlySet<Permission>;
  /** Permissions held only inside projects the user belongs to. */
  readonly project: ReadonlySet<Permission>;
}

/**
 * The single place a permission decision is made.
 *
 * The rule, in one line:
 *
 *   what you may do = your role's global grants
 *                   ∪ your role's project grants, within projects you belong to
 *
 * Two things are deliberate.
 *
 * DENY BY DEFAULT. Absence of a grant is never permission. There is no "allow
 * unless denied" path through this class.
 *
 * A PROJECT-scoped permission ALWAYS requires a project. Calling `require` with
 * a project-scoped permission and no project id is refused, rather than quietly
 * falling back to a global check. That mistake would silently widen access,
 * which is exactly the failure this design exists to prevent.
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves everything a user's roles grant them. */
  async grantsFor(userId: string): Promise<Grants> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { users: { some: { userId } } } },
      select: { permission: true, scope: true },
    });

    const global = new Set<Permission>();
    const project = new Set<Permission>();

    for (const row of rows) {
      const permission = row.permission as Permission;
      if (row.scope === 'GLOBAL') global.add(permission);
      else project.add(permission);
    }

    return { global, project };
  }

  /**
   * True when the user may perform this action.
   *
   * `projectId` must be supplied for anything belonging to a project. Without
   * it, only a global grant can satisfy the check.
   */
  async can(userId: string, permission: Permission, projectId?: string): Promise<boolean> {
    const grants = await this.grantsFor(userId);

    if (grants.global.has(permission)) return true;
    if (!grants.project.has(permission)) return false;

    // The permission is project-scoped, so it means nothing without a project,
    // and everything depends on membership.
    if (!projectId) return false;
    return this.isMemberOf(userId, projectId);
  }

  /**
   * True when the user holds this permission anywhere at all — globally, or on
   * at least one project.
   *
   * Used only by list routes, which name no project. It is a gate, not a
   * decision: the query still has to scope itself with `visibleProjectIds`.
   */
  async canAnywhere(userId: string, permission: Permission): Promise<boolean> {
    const grants = await this.grantsFor(userId);
    return grants.global.has(permission) || grants.project.has(permission);
  }

  async requireAnywhere(userId: string, permission: Permission): Promise<void> {
    if (await this.canAnywhere(userId, permission)) return;
    throw appError('FORBIDDEN', { context: { permission, project_id: null } });
  }

  /** As `can`, but throws. The normal way to guard an operation. */
  async require(userId: string, permission: Permission, projectId?: string): Promise<void> {
    if (await this.can(userId, permission, projectId)) return;

    throw appError('FORBIDDEN', {
      // Recorded in the log so a genuine access problem can be diagnosed.
      // Never returned: telling someone which permission they lack maps out
      // the system for them.
      context: { permission, project_id: projectId ?? null },
    });
  }

  /**
   * The projects this user may see.
   *
   * This is the second, independent layer of protection. List and search
   * queries filter by it, so an endpoint that forgets its explicit check
   * returns NOTHING rather than everything. One missed check should be an empty
   * screen, not a data breach.
   *
   * `null` means "no restriction" — the user holds the permission globally.
   */
  async visibleProjectIds(userId: string, permission: Permission): Promise<string[] | null> {
    const grants = await this.grantsFor(userId);
    if (grants.global.has(permission)) return null;
    if (!grants.project.has(permission)) return [];
    return this.projectIdsForMember(userId);
  }

  /**
   * Membership lookup — the row that turns "your role's project grants" into a
   * specific set of projects.
   *
   * Note what this does NOT consult: `project_member.role_code`. A person's
   * permissions come from their global role; membership decides only WHERE
   * those permissions apply (decision 3 — job title says what kind of work you
   * do, membership says where you may do it). The role recorded on the
   * membership is what they do on that project, kept for display and for the
   * phases that follow.
   */
  private async isMemberOf(userId: string, projectId: string): Promise<boolean> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { userId: true },
    });
    return membership !== null;
  }

  private async projectIdsForMember(userId: string): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    return rows.map((row) => row.projectId);
  }
}
