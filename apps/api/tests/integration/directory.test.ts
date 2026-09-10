import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { ContactService } from '../../src/modules/directory/contact.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Clients, contacts and properties.
 *
 * The interesting cases are the ones that protect data: refusing a stale write,
 * refusing to archive something other records still depend on, and keeping
 * archived rows out of the way without losing them.
 */
describe('directory', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const contacts = new ContactService(prisma, audit);

  const actor = crypto.randomUUID();
  const requestId = '77777777-6666-4555-8444-333333333333';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  let clientId: string;

  beforeEach(async () => {
    const client = await inContext(() =>
      clients.create({ name: `Test Client ${crypto.randomUUID()}` }, actor),
    );
    clientId = client.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a client and audits it', async () => {
    const entries = await prisma.auditEntry.count({
      where: { entityId: clientId, action: 'CREATED', entityType: 'Client' },
    });
    expect(entries).toBe(1);
  });

  it('refuses a second edit made from a stale version', async () => {
    await inContext(() => clients.update(clientId, { name: 'First Edit', version: 1 }, actor));

    // The second writer read version 1 before the first write landed. Accepting
    // this would silently discard the first edit.
    await expect(
      inContext(() => clients.update(clientId, { name: 'Second Edit', version: 1 }, actor)),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });

    const current = await clients.byId(clientId);
    expect(current.name).toBe('First Edit');
    expect(current.version).toBe(2);
  });

  it('refuses to archive a client while a live property is attached', async () => {
    await inContext(() => properties.create({ clientId, name: 'A Building' }, actor));

    await expect(inContext(() => clients.archive(clientId, actor))).rejects.toMatchObject({
      code: 'DEPENDENCY_EXISTS',
    });

    // The client is untouched — a refused archive must change nothing.
    expect((await clients.byId(clientId)).archivedAt).toBeNull();
  });

  it('records the refusal to archive, not just successful archives', async () => {
    await inContext(() => properties.create({ clientId, name: 'A Building' }, actor));
    await expect(inContext(() => clients.archive(clientId, actor))).rejects.toThrow();

    const rejected = await prisma.auditEntry.count({
      where: { entityId: clientId, action: 'ARCHIVED', outcome: 'REJECTED' },
    });
    expect(rejected).toBe(1);
  });

  it('archives once the dependent property is archived', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'A Building' }, actor),
    );
    await inContext(() => properties.archive(property.id, actor));
    await inContext(() => clients.archive(clientId, actor));

    expect((await clients.byId(clientId)).archivedAt).not.toBeNull();
  });

  it('hides archived clients from the default list but keeps them', async () => {
    const name = (await clients.byId(clientId)).name;
    await inContext(() => clients.archive(clientId, actor));

    const visible = await clients.list({
      search: name,
      page: 1,
      pageSize: 25,
      includeArchived: false,
    });
    expect(visible.total).toBe(0);

    const all = await clients.list({ search: name, page: 1, pageSize: 25, includeArchived: true });
    expect(all.total).toBe(1);
  });

  it('lets an archived reference be reused by a new client', async () => {
    const reference = `REF-${crypto.randomUUID().slice(0, 8)}`;
    const first = await inContext(() => clients.create({ name: 'First', reference }, actor));
    await inContext(() => clients.archive(first.id, actor));

    // The partial unique index ignores archived rows, so archiving does not
    // reserve the reference forever.
    const second = await inContext(() => clients.create({ name: 'Second', reference }, actor));
    expect(second.reference).toBe(reference);
  });

  it('refuses a duplicate reference among live clients', async () => {
    const reference = `REF-${crypto.randomUUID().slice(0, 8)}`;
    await inContext(() => clients.create({ name: 'First', reference }, actor));

    await expect(
      inContext(() => clients.create({ name: 'Second', reference }, actor)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a property on an archived client', async () => {
    await inContext(() => clients.archive(clientId, actor));

    await expect(
      inContext(() => properties.create({ clientId, name: 'Too Late' }, actor)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('records the Oman land-registry identity on a property, all fields optional', async () => {
    const property = await inContext(() =>
      properties.create(
        {
          clientId,
          name: 'Villa, Al Mawaleh South',
          plotNumber: '102/8',
          wilayat: 'Al Seeb',
          village: 'Al Mawaleh South',
          surveyReference: '1-35-055-01-585',
          titleDeedReference: '2015/19618',
          ownerName: 'Nasreen bint Abdul Rahim bin Sheikh',
          ownerNationalId: '62898538',
        },
        actor,
      ),
    );

    expect(property.plotNumber).toBe('102/8');
    expect(property.titleDeedReference).toBe('2015/19618');
    expect(property.ownerNationalId).toBe('62898538');

    // A property with none of it given is not blocked — the paperwork may
    // arrive after the record does.
    const bare = await inContext(() => properties.create({ clientId, name: 'Bare Plot' }, actor));
    expect(bare.plotNumber).toBeNull();
  });

  it('finds a property by its plot number, not only its name', async () => {
    const plotNumber = `PLOT-${crypto.randomUUID()}`;
    await inContext(() => properties.create({ clientId, name: 'Findable', plotNumber }, actor));

    const page = await properties.list({
      page: 1,
      pageSize: 10,
      includeArchived: false,
      search: plotNumber,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.plotNumber).toBe(plotNumber);
  });

  it('keeps at most one primary contact, demoting the previous one', async () => {
    await inContext(() => contacts.create(clientId, { name: 'First', isPrimary: true }));
    await inContext(() => contacts.create(clientId, { name: 'Second', isPrimary: true }));

    const list = await contacts.listForClient(clientId);
    expect(list.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(list.find((c) => c.isPrimary)?.name).toBe('Second');
  });

  it('reports a missing client as not found rather than failing obscurely', async () => {
    await expect(clients.byId(crypto.randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('paginates', async () => {
    const page = await clients.list({ page: 1, pageSize: 2, includeArchived: true });
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.pageSize).toBe(2);
    expect(page.total).toBeGreaterThan(0);
  });
});
