import { PERMISSIONS, type Permission } from '@ecms/contracts';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * The authorization model, tested against the seeded matrix.
 *
 * This is the highest-risk part of the system: everything else is downstream of
 * getting it right. The cases below are mostly about what is REFUSED.
 */
describe('authorization', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const authorization = new AuthorizationService(prisma);
  const created: string[] = [];

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `authz-${crypto.randomUUID()}@example.com`,
        displayName: 'Authz Test',
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    created.push(user.id);
    return user.id;
  }

  let admin: string;
  let director: string;
  let projectManager: string;
  let planner: string;
  let roleless: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    director = await userWithRole('DIRECTOR');
    projectManager = await userWithRole('PROJECT_MANAGER');
    planner = await userWithRole('PLANNING');

    const bare = await prisma.user.create({
      data: {
        email: `authz-${crypto.randomUUID()}@example.com`,
        displayName: 'No Roles',
        passwordHash: 'not-used-in-this-test',
      },
    });
    created.push(bare.id);
    roleless = bare.id;
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it('grants an administrator everything in the catalogue', async () => {
    for (const permission of PERMISSIONS) {
      expect(await authorization.can(admin, permission)).toBe(true);
    }
  });

  it('gives a user with no role nothing at all', async () => {
    // Deny by default. Absence of a grant is never permission.
    for (const permission of PERMISSIONS) {
      expect(await authorization.can(roleless, permission)).toBe(false);
    }
  });

  it('lets a director see the portfolio but not change it', async () => {
    expect(await authorization.can(director, 'project:view')).toBe(true);
    expect(await authorization.can(director, 'client:view')).toBe(true);

    // Oversight, not data entry.
    expect(await authorization.can(director, 'client:edit')).toBe(false);
    expect(await authorization.can(director, 'project:edit')).toBe(false);
    expect(await authorization.can(director, 'user:admin')).toBe(false);
  });

  it('refuses a project manager on a project they do not belong to', async () => {
    // They hold project:edit — but only within their own projects. Without
    // membership of THIS project, the answer is no.
    expect(await authorization.can(projectManager, 'project:edit', crypto.randomUUID())).toBe(
      false,
    );
  });

  it('refuses a project-scoped permission when no project is named', async () => {
    // Falling back to a global check here would silently widen access. It is
    // refused instead.
    expect(await authorization.can(projectManager, 'project:edit')).toBe(false);
    expect(await authorization.can(planner, 'project:view')).toBe(false);
  });

  it('still allows a project manager their global grants', async () => {
    expect(await authorization.can(projectManager, 'project:create')).toBe(true);
    expect(await authorization.can(projectManager, 'client:view')).toBe(true);
  });

  it('gives planning read-only reference data and nothing more', async () => {
    expect(await authorization.can(planner, 'client:view')).toBe(true);
    expect(await authorization.can(planner, 'client:edit')).toBe(false);
    expect(await authorization.can(planner, 'project:create')).toBe(false);
    expect(await authorization.can(planner, 'user:admin')).toBe(false);
  });

  it('throws FORBIDDEN from require(), without naming the missing permission', async () => {
    await expect(authorization.require(planner, 'user:admin')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    // The message must not tell the caller which permission would have worked.
    await authorization.require(planner, 'user:admin').catch((error: Error) => {
      expect(error.message).not.toContain('user:admin');
    });
  });

  it('scopes list queries so a forgotten check returns nothing, not everything', async () => {
    // null means "no restriction" — the holder has it globally.
    expect(await authorization.visibleProjectIds(admin, 'project:view')).toBeNull();
    expect(await authorization.visibleProjectIds(director, 'project:view')).toBeNull();

    // An empty list, never "all projects". This is the second layer of defence:
    // if an endpoint forgets its explicit check, the query still returns
    // nothing.
    expect(await authorization.visibleProjectIds(planner, 'project:view')).toEqual([]);
    expect(await authorization.visibleProjectIds(roleless, 'project:view')).toEqual([]);
  });

  it('holds no permission outside the shared catalogue', async () => {
    // Guards against a typo in the seed migration sitting unnoticed: a
    // misspelled permission would never match, and would fail open-looking
    // (silently denied) rather than loudly.
    const rows = await prisma.rolePermission.findMany({ select: { permission: true } });
    const catalogue = new Set<string>(PERMISSIONS);
    const unknown = rows.map((r) => r.permission).filter((p) => !catalogue.has(p as Permission));

    expect(unknown).toEqual([]);
  });
});
