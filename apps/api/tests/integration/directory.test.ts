import { formatClientName } from '@ecms/contracts';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { ContactService } from '../../src/modules/directory/contact.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { WilayatService } from '../../src/modules/directory/wilayat.service';
import { SequenceService } from '../../src/modules/sequence';
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
  const clients = new ClientService(prisma, audit, new SequenceService());
  const properties = new PropertyService(prisma, audit, new SequenceService());
  const contacts = new ContactService(prisma, audit);
  const wilayats = new WilayatService(prisma, audit);

  const actor = crypto.randomUUID();
  const requestId = '77777777-6666-4555-8444-333333333333';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  let clientId: string;

  beforeEach(async () => {
    const client = await inContext(() =>
      clients.create({ firstName: `Test Client ${crypto.randomUUID()}` }, actor),
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
    await inContext(() =>
      clients.update(clientId, { firstName: 'First Edit', version: 1 }, actor),
    );

    // The second writer read version 1 before the first write landed. Accepting
    // this would silently discard the first edit.
    await expect(
      inContext(() => clients.update(clientId, { firstName: 'Second Edit', version: 1 }, actor)),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });

    const current = await clients.byId(clientId);
    expect(current.firstName).toBe('First Edit');
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
    const name = (await clients.byId(clientId)).firstName;
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

  it('generates a client reference when none is given, and leaves a given one alone', async () => {
    const generated = await inContext(() => clients.create({ firstName: 'Auto Ref' }, actor));
    expect(generated.reference).toMatch(/^CL-\d{4}-\d{3}$/);

    const explicit = `REF-${crypto.randomUUID().slice(0, 8)}`;
    const given = await inContext(() =>
      clients.create({ firstName: 'Explicit Ref', reference: explicit }, actor),
    );
    expect(given.reference).toBe(explicit);
  });

  it('generates a property reference when none is given', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Auto Ref Plot' }, actor),
    );
    expect(property.reference).toMatch(/^PR-\d{4}-\d{3}$/);
  });

  it('lets an archived reference be reused by a new client', async () => {
    const reference = `REF-${crypto.randomUUID().slice(0, 8)}`;
    const first = await inContext(() => clients.create({ firstName: 'First', reference }, actor));
    await inContext(() => clients.archive(first.id, actor));

    // The partial unique index ignores archived rows, so archiving does not
    // reserve the reference forever.
    const second = await inContext(() => clients.create({ firstName: 'Second', reference }, actor));
    expect(second.reference).toBe(reference);
  });

  it('refuses a duplicate reference among live clients', async () => {
    const reference = `REF-${crypto.randomUUID().slice(0, 8)}`;
    await inContext(() => clients.create({ firstName: 'First', reference }, actor));

    await expect(
      inContext(() => clients.create({ firstName: 'Second', reference }, actor)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a property on an archived client', async () => {
    await inContext(() => clients.archive(clientId, actor));

    await expect(
      inContext(() => properties.create({ clientId, name: 'Too Late' }, actor)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('records the Oman land-registry identity on a property, all fields optional', async () => {
    // Real-shaped values, made unique per run: the same plot twice is now
    // refused as a duplicate, and this database outlives any one test run.
    const n = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    const plotNumber = `102/${n}`;
    const property = await inContext(() =>
      properties.create(
        {
          clientId,
          name: 'Villa, Al Mawaleh South',
          plotNumber,
          wilayat: 'Al Seeb',
          village: 'Al Mawaleh South',
          surveyReference: `1-35-055-01-${n}`,
          titleDeedReference: '2015/19618',
          ownerName: 'Nasreen bint Abdul Rahim bin Sheikh',
          ownerNationalId: '62898538',
        },
        actor,
      ),
    );

    expect(property.plotNumber).toBe(plotNumber);
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

  it('finds a property by its client, village or owner — the client only for a caller who may see clients', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const client = await inContext(() =>
      clients.create({ firstName: `Owner${tag}`, surname: 'Findings' }, actor),
    );
    const property = await inContext(() =>
      properties.create(
        { clientId: client.id, name: 'Hidden Name', village: `Village${tag}`, ownerName: `Deed${tag}` },
        actor,
      ),
    );

    const found = async (search: string, searchClients: boolean): Promise<boolean> => {
      const page = await properties.list(
        { page: 1, pageSize: 100, includeArchived: false, search },
        undefined,
        { searchClients },
      );
      return page.items.some((p) => p.id === property.id);
    };

    expect(await found(`Village${tag}`, false)).toBe(true);
    expect(await found(`Deed${tag}`, false)).toBe(true);
    expect(await found(`owner${tag} findings`, true)).toBe(true);
    // Without permission to see clients, the client's name finds nothing.
    expect(await found(`Owner${tag}`, false)).toBe(false);
  });

  it('keeps a managed list of wilayats, with the villages already recorded under each', async () => {
    const name = `Testwilayat ${crypto.randomUUID().slice(0, 8)}`;
    const village = `Village ${crypto.randomUUID().slice(0, 8)}`;

    const entry = await inContext(() => wilayats.create({ name, sortOrder: 0 }));
    await inContext(() =>
      properties.create({ clientId, name: 'Wilayat plot', wilayat: name, village }, actor),
    );

    // Listed with the village recorded under it (matched without regard to case).
    const listed = await wilayats.list();
    expect(listed.find((w) => w.id === entry.id)?.villages).toEqual([village]);

    // The same name twice is refused, and a retired one is brought back.
    await expect(inContext(() => wilayats.create({ name, sortOrder: 0 }))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await inContext(() => wilayats.archive(entry.id));
    expect((await wilayats.list()).some((w) => w.id === entry.id)).toBe(false);
    const restored = await inContext(() => wilayats.create({ name, sortOrder: 3 }));
    expect(restored.id).toBe(entry.id);
    expect((await wilayats.list()).some((w) => w.id === entry.id)).toBe(true);

    // The property itself keeps what was written, whatever happens to the list.
    await inContext(() => wilayats.archive(entry.id));
    const stored = await prisma.property.findFirst({ where: { wilayat: name } });
    expect(stored?.village).toBe(village);
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

  it('refuses a second contact with the same name on the same client', async () => {
    await inContext(() => contacts.create(clientId, { name: 'Saif Al Kharusi', isPrimary: false }));

    await expect(
      inContext(() => contacts.create(clientId, { name: 'Saif Al Kharusi', isPrimary: false })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows the same contact name on two different clients', async () => {
    const other = await inContext(() => clients.create({ firstName: 'Another Client' }, actor));

    await inContext(() => contacts.create(clientId, { name: 'Common Name', isPrimary: false }));
    const second = await inContext(() => contacts.create(other.id, { name: 'Common Name', isPrimary: false }));

    expect(second.name).toBe('Common Name');
  });

  it('refuses a duplicate contact ID number even across different clients', async () => {
    const other = await inContext(() => clients.create({ firstName: 'Another Client' }, actor));
    const idNumber = `ID-${crypto.randomUUID().slice(0, 8)}`;

    await inContext(() => contacts.create(clientId, { name: 'First Person', idNumber, isPrimary: false }));

    await expect(
      inContext(() => contacts.create(other.id, { name: 'Second Person', idNumber, isPrimary: false })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a duplicate survey reference (Krookie / Land ID) among live properties', async () => {
    const surveyReference = `01-05-${crypto.randomUUID().slice(0, 6)}`;
    await inContext(() =>
      properties.create({ clientId, name: 'First Plot', surveyReference }, actor),
    );

    await expect(
      inContext(() => properties.create({ clientId, name: 'Second Plot', surveyReference }, actor)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('stores a client name as 4 parts and finds it by any of them', async () => {
    const unique = crypto.randomUUID().slice(0, 8);
    const client = await inContext(() =>
      clients.create(
        {
          firstName: `Saif-${unique}`,
          fatherName: 'Salim',
          grandfatherName: 'Hamed',
          surname: 'Al Kharusi',
        },
        actor,
      ),
    );

    expect(formatClientName(client)).toBe(`Saif-${unique} Salim Hamed Al Kharusi`);

    const bySurname = await clients.list({
      search: 'Al Kharusi',
      page: 1,
      pageSize: 25,
      includeArchived: true,
    });
    expect(bySurname.items.some((c) => c.id === client.id)).toBe(true);
  });

  it('allows a client with only a first name — the other 3 parts are optional', async () => {
    const client = await inContext(() =>
      clients.create({ firstName: 'Al Rawahi Family Trading LLC' }, actor),
    );
    expect(formatClientName(client)).toBe('Al Rawahi Family Trading LLC');
  });
});
