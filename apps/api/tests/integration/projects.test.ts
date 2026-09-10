import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { MembershipService } from '../../src/modules/projects/membership.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { WorkstreamService } from '../../src/modules/projects/workstream.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Projects, membership and workstreams.
 *
 * The case this file exists for is the one the plan calls critical: a user who
 * is not a member of a project receives NOTHING for it from the API. Not a
 * hidden button — no row. Everything else here supports that claim or protects
 * the records it depends on.
 */
describe('projects', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const projects = new ProjectService(prisma, audit, authorization, new SequenceService());
  const members = new MembershipService(prisma, audit);
  const workstreams = new WorkstreamService(prisma, audit);

  const requestId = '55555555-4444-4333-8222-111111111111';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  const createdUsers: string[] = [];

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `projects-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    createdUsers.push(user.id);
    return user.id;
  }

  const uniqueCode = (): string => `P-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  let admin: string;
  let director: string;
  let owningManager: string;
  let otherManager: string;
  let planner: string;
  let clientId: string;
  let propertyId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    director = await userWithRole('DIRECTOR');
    owningManager = await userWithRole('PROJECT_MANAGER');
    otherManager = await userWithRole('PROJECT_MANAGER');
    planner = await userWithRole('PLANNING');

    const client = await inContext(() =>
      clients.create({ name: `Projects Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Riverside House' }, admin),
    );
    propertyId = property.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A project owned by `owningManager`, who becomes its first member. */
  async function newProject(type: 'PLANNING' | 'SUPERVISION' | 'BOTH' = 'BOTH'): Promise<string> {
    const project = await inContext(() =>
      projects.create(
        { clientId, propertyId, code: uniqueCode(), name: 'Test Project', type },
        owningManager,
      ),
    );
    return project.id;
  }

  // -------------------------------------------------------------------------
  // The critical test
  // -------------------------------------------------------------------------

  it('gives a non-member nothing at all for a project they are not on', async () => {
    const projectId = await newProject();

    // A Project Manager holds project:view — but only within their own
    // projects. This one is not theirs.
    const visible = await authorization.visibleProjectIds(otherManager, 'project:view');
    expect(visible).not.toBeNull();
    expect(visible).not.toContain(projectId);

    // The list returns no row for it. Not a filtered UI — the query never
    // selected it.
    const page = await projects.list({ page: 1, pageSize: 100 }, otherManager);
    expect(page.items.map((p) => p.id)).not.toContain(projectId);

    // And fetching it directly is refused, without confirming it exists.
    await expect(projects.byId(projectId, otherManager)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(await authorization.can(otherManager, 'project:edit', projectId)).toBe(false);
  });

  it('shows the project to the manager who is on it', async () => {
    const projectId = await newProject();

    const page = await projects.list({ page: 1, pageSize: 100 }, owningManager);
    expect(page.items.map((p) => p.id)).toContain(projectId);

    expect(await authorization.can(owningManager, 'project:edit', projectId)).toBe(true);
    expect(await authorization.can(owningManager, 'project:close', projectId)).toBe(true);
  });

  it('shows every project to a director, who is a member of none of them', async () => {
    const projectId = await newProject();

    // Portfolio-wide visibility is a GLOBAL grant, so no membership row exists
    // and none is needed.
    expect(await authorization.visibleProjectIds(director, 'project:view')).toBeNull();

    const page = await projects.list({ page: 1, pageSize: 100 }, director);
    expect(page.items.map((p) => p.id)).toContain(projectId);

    // Seeing everything is not the same as touching anything.
    expect(await authorization.can(director, 'project:edit', projectId)).toBe(false);
  });

  it('gives a planner an empty page rather than everyone else’s work', async () => {
    await newProject();

    // They hold project:view, but only through membership — and they are a
    // member of nothing. An empty screen, not a breach.
    const page = await projects.list({ page: 1, pageSize: 100 }, planner);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('opens membership to a planner once they are added, and only for that project', async () => {
    const theirs = await newProject();
    const notTheirs = await newProject();

    await inContext(() =>
      members.add(theirs, { userId: planner, roleCode: 'PLANNING' }, owningManager),
    );

    const page = await projects.list({ page: 1, pageSize: 100 }, planner);
    const ids = page.items.map((p) => p.id);
    expect(ids).toContain(theirs);
    expect(ids).not.toContain(notTheirs);

    // Membership widened WHERE they may work, not WHAT they may do: Planning
    // holds no project:edit at any scope.
    expect(await authorization.can(planner, 'project:edit', theirs)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------

  it('makes the creator a member, so they can edit what they just created', async () => {
    const projectId = await newProject();

    const roster = await members.list(projectId);
    expect(roster.map((m) => m.userId)).toContain(owningManager);
    expect(await authorization.can(owningManager, 'project:edit', projectId)).toBe(true);
  });

  it('opens the workstreams the project type calls for', async () => {
    const both = await newProject('BOTH');
    expect((await workstreams.listForProject(both)).map((w) => w.type).sort()).toEqual([
      'PLANNING',
      'SUPERVISION',
    ]);

    const supervision = await newProject('SUPERVISION');
    expect((await workstreams.listForProject(supervision)).map((w) => w.type)).toEqual([
      'SUPERVISION',
    ]);
  });

  it('refuses a project code already in use, whatever the casing', async () => {
    const code = uniqueCode();
    await inContext(() =>
      projects.create({ clientId, propertyId, code, name: 'First', type: 'PLANNING' }, admin),
    );

    await expect(
      inContext(() =>
        projects.create(
          { clientId, propertyId, code: code.toLowerCase(), name: 'Second', type: 'PLANNING' },
          admin,
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('generates a code from the type-matched sequence when none is given', async () => {
    const year = String(new Date().getUTCFullYear() % 100).padStart(2, '0');

    const supervision = await inContext(() =>
      projects.create({ clientId, propertyId, name: 'No code given', type: 'SUPERVISION' }, admin),
    );
    expect(supervision.code).toMatch(new RegExp(`^${year}\\.S\\.\\d{3,}$`));

    const planning = await inContext(() =>
      projects.create({ clientId, propertyId, name: 'Planning, no code', type: 'PLANNING' }, admin),
    );
    expect(planning.code).toMatch(new RegExp(`^${year}\\.P\\.\\d{3,}$`));

    // An explicit code, e.g. for a migrated historical project, still works
    // exactly as before and is not overridden.
    const explicit = await inContext(() =>
      projects.create(
        { clientId, propertyId, code: uniqueCode(), name: 'Explicit', type: 'PLANNING' },
        admin,
      ),
    );
    expect(explicit.code).not.toMatch(/\.P\.|\.S\./);
  });

  it('refuses a property that belongs to a different client', async () => {
    const otherClient = await inContext(() =>
      clients.create({ name: `Other ${crypto.randomUUID()}` }, admin),
    );

    await expect(
      inContext(() =>
        projects.create(
          { clientId: otherClient.id, propertyId, code: uniqueCode(), name: 'Wrong', type: 'BOTH' },
          admin,
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  // -------------------------------------------------------------------------
  // Transitions
  // -------------------------------------------------------------------------

  it('walks a project through its lifecycle', async () => {
    const projectId = await newProject();

    let project = await inContext(() =>
      projects.transition(projectId, 'activate', { version: 1 }, admin),
    );
    expect(project.status).toBe('ACTIVE');

    project = await inContext(() =>
      projects.transition(projectId, 'hold', { version: project.version }, admin),
    );
    expect(project.status).toBe('ON_HOLD');

    project = await inContext(() =>
      projects.transition(projectId, 'activate', { version: project.version }, admin),
    );
    expect(project.status).toBe('ACTIVE');

    project = await inContext(() =>
      projects.transition(projectId, 'complete', { version: project.version }, admin),
    );
    expect(project.status).toBe('COMPLETED');
    expect(project.actualEndDate).not.toBeNull();

    project = await inContext(() =>
      projects.transition(projectId, 'close', { version: project.version }, admin),
    );
    expect(project.status).toBe('CLOSED');
  });

  it('refuses a move the transition table does not allow', async () => {
    const projectId = await newProject();

    // DRAFT → COMPLETED skips the work entirely.
    await expect(
      inContext(() => projects.transition(projectId, 'complete', { version: 1 }, admin)),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    expect((await projects.byId(projectId, admin)).status).toBe('DRAFT');
  });

  it('records the refused transition, not only the ones that happened', async () => {
    const projectId = await newProject();
    await expect(
      inContext(() => projects.transition(projectId, 'complete', { version: 1 }, admin)),
    ).rejects.toThrow();

    const rejected = await prisma.auditEntry.count({
      where: { entityId: projectId, action: 'STATUS_CHANGED', outcome: 'REJECTED' },
    });
    expect(rejected).toBe(1);
  });

  it('lets nothing out of CLOSED, or change inside it', async () => {
    const projectId = await newProject();
    let project = await inContext(() =>
      projects.transition(projectId, 'activate', { version: 1 }, admin),
    );
    project = await inContext(() =>
      projects.transition(projectId, 'complete', { version: project.version }, admin),
    );
    project = await inContext(() =>
      projects.transition(projectId, 'close', { version: project.version }, admin),
    );

    await expect(
      inContext(() =>
        projects.transition(projectId, 'activate', { version: project.version }, admin),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await expect(
      inContext(() =>
        projects.update(projectId, { name: 'Renamed', version: project.version }, admin),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await expect(
      inContext(() => members.add(projectId, { userId: planner, roleCode: 'PLANNING' }, admin)),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('refuses a second transition made from a stale version', async () => {
    const projectId = await newProject();
    await inContext(() => projects.transition(projectId, 'activate', { version: 1 }, admin));

    // The second caller read version 1 before the first move landed.
    await expect(
      inContext(() => projects.transition(projectId, 'hold', { version: 1 }, admin)),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  it('refuses a stale edit', async () => {
    const projectId = await newProject();
    await inContext(() => projects.update(projectId, { name: 'First Edit', version: 1 }, admin));

    await expect(
      inContext(() => projects.update(projectId, { name: 'Second Edit', version: 1 }, admin)),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  it('audits members joining and leaving', async () => {
    const projectId = await newProject();
    await inContext(() =>
      members.add(projectId, { userId: otherManager, roleCode: 'PROJECT_MANAGER' }, owningManager),
    );

    expect(await authorization.can(otherManager, 'project:edit', projectId)).toBe(true);

    await inContext(() => members.remove(projectId, otherManager, owningManager));

    // Removing them takes the access with it.
    expect(await authorization.can(otherManager, 'project:edit', projectId)).toBe(false);

    const trail = await prisma.auditEntry.findMany({
      where: { projectId, entityType: 'ProjectMember' },
      select: { action: true },
    });
    expect(trail.map((e) => e.action).sort()).toEqual(['MEMBER_ADDED', 'MEMBER_REMOVED']);
  });

  it('refuses to leave a project with no members at all', async () => {
    const projectId = await newProject();

    await expect(
      inContext(() => members.remove(projectId, owningManager, admin)),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_EXISTS' });
  });

  it('refuses to add the same person twice', async () => {
    const projectId = await newProject();

    await expect(
      inContext(() =>
        members.add(projectId, { userId: owningManager, roleCode: 'PROJECT_MANAGER' }, admin),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to give a disabled account access to a project', async () => {
    const projectId = await newProject();
    const disabled = await userWithRole('PLANNING');
    await prisma.user.update({ where: { id: disabled }, data: { status: 'DISABLED' } });

    await expect(
      inContext(() => members.add(projectId, { userId: disabled, roleCode: 'PLANNING' }, admin)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  // -------------------------------------------------------------------------
  // Workstreams
  // -------------------------------------------------------------------------

  it('moves a workstream only through legal transitions', async () => {
    const projectId = await newProject('PLANNING');
    const [workstream] = await workstreams.listForProject(projectId);
    const id = workstream!.id;

    await expect(
      inContext(() => workstreams.transition(projectId, id, { to: 'COMPLETED', version: 1 })),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    const started = await inContext(() =>
      workstreams.transition(projectId, id, { to: 'IN_PROGRESS', version: 1 }),
    );
    expect(started.status).toBe('IN_PROGRESS');
  });

  it('refuses a workstream reached through the wrong project', async () => {
    const mine = await newProject('PLANNING');
    const theirs = await newProject('PLANNING');
    const [target] = await workstreams.listForProject(theirs);

    // The permission guard authorises the project in the URL. If the record did
    // not have to belong to it, a member of one project could reach into
    // another by passing an id.
    await expect(
      inContext(() => workstreams.transition(mine, target!.id, { to: 'IN_PROGRESS', version: 1 })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a second workstream of a kind the project already has', async () => {
    const projectId = await newProject('BOTH');

    await expect(
      inContext(() => workstreams.create(projectId, { type: 'PLANNING', name: 'Duplicate' })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  // -------------------------------------------------------------------------
  // Archival, now that projects depend on the directory
  // -------------------------------------------------------------------------

  it('refuses to archive a property a project sits on, and records the refusal', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: `Site ${crypto.randomUUID().slice(0, 8)}` }, admin),
    );
    await inContext(() =>
      projects.create(
        { clientId, propertyId: property.id, code: uniqueCode(), name: 'On Site', type: 'BOTH' },
        admin,
      ),
    );

    await expect(inContext(() => properties.archive(property.id, admin))).rejects.toMatchObject({
      code: 'DEPENDENCY_EXISTS',
    });

    expect((await properties.byId(property.id)).archivedAt).toBeNull();
    expect(
      await prisma.auditEntry.count({
        where: { entityId: property.id, action: 'ARCHIVED', outcome: 'REJECTED' },
      }),
    ).toBe(1);
  });

  it('refuses to archive a client that has projects', async () => {
    await expect(inContext(() => clients.archive(clientId, admin))).rejects.toMatchObject({
      code: 'DEPENDENCY_EXISTS',
    });
  });
});
