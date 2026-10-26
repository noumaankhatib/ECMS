import { PERMISSIONS, ROLES } from '@ecms/contracts';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { RoleController } from '../../src/modules/access/user.controller';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * The role list served to the administration screens.
 *
 * It explains roles to the person granting them, so it must report what the
 * database actually enforces — and nothing the permission catalogue does not
 * know about.
 */
describe('roles', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;
  const controller = new RoleController(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists all seven roles, each with its permissions and where they apply', async () => {
    const { roles } = await controller.list();
    expect(roles.map((r) => r.code).sort()).toEqual([...ROLES].sort());
    for (const role of roles) {
      for (const entry of role.permissions) {
        expect(['GLOBAL', 'PROJECT']).toContain(entry.scope);
      }
    }
  });

  it('reports only permissions the catalogue knows', async () => {
    const { roles } = await controller.list();
    const known = new Set<string>(PERMISSIONS);
    for (const role of roles) {
      for (const entry of role.permissions) expect(known.has(entry.permission)).toBe(true);
    }
  });

  it('keeps the model: a planner works inside projects, an administrator manages users', async () => {
    const { roles } = await controller.list();
    const byCode = new Map(roles.map((r) => [r.code, r]));

    const planner = byCode.get('PLANNING')?.permissions ?? [];
    expect(planner).toContainEqual({ permission: 'planning:edit', scope: 'PROJECT' });
    expect(planner.some((p) => p.permission === 'user:admin')).toBe(false);

    const admin = byCode.get('SYSTEM_ADMINISTRATOR')?.permissions ?? [];
    expect(admin).toContainEqual({ permission: 'user:admin', scope: 'GLOBAL' });
  });
});
