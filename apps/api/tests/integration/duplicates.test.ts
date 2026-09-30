import { normalizeIdentifier, normalizePhone } from '@ecms/contracts';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { ContactService } from '../../src/modules/directory/contact.service';
import {
  findClientDuplicates,
  findPropertyDuplicates,
} from '../../src/modules/directory/duplicates';
import { PropertyService } from '../../src/modules/directory/property.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Duplicate detection.
 *
 * The rule under test: an official identity already on a live record stops
 * the write unless an override (with a reason) is given; a similar name or a
 * shared phone is only ever reported, never refused.
 *
 * The database is shared with every other test file, so every identifier is
 * randomised — a fixed CR number would match rows left by earlier runs.
 */
describe('duplicate detection', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const clients = new ClientService(prisma, audit);
  const contacts = new ContactService(prisma, audit);
  const properties = new PropertyService(prisma, audit);

  const actor = crypto.randomUUID();
  const requestId = '88888888-6666-4555-8444-333333333333';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  const token = () => crypto.randomUUID().slice(0, 8);
  const digits = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('normalisation', () => {
    it('reduces a phone number to one comparable form', () => {
      expect(normalizePhone('9123 4567')).toBe('+96891234567');
      expect(normalizePhone('+968 9123-4567')).toBe('+96891234567');
      expect(normalizePhone('00968 91234567')).toBe('+96891234567');
      expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
      expect(normalizePhone('123')).toBeNull();
    });

    it('reduces an identifier to the registry form', () => {
      expect(normalizeIdentifier('1234 567')).toBe('1234567');
      expect(normalizeIdentifier('ab-12/3.4')).toBe('AB1234');
    });
  });

  describe('clients', () => {
    it('refuses a second live client with the same CR number, however it is typed', async () => {
      const cr = digits(7);
      await inContext(() => clients.create({ name: `First ${token()}`, crNumber: cr }, actor));

      // What the API receives after the contract has normalised the input.
      const retyped = normalizeIdentifier(`${cr.slice(0, 4)} ${cr.slice(4)}`);

      await expect(
        inContext(() => clients.create({ name: `Second ${token()}`, crNumber: retyped }, actor)),
      ).rejects.toMatchObject({
        code: 'DUPLICATE_SUSPECTED',
        fields: [expect.objectContaining({ field: 'crNumber' })],
      });
    });

    it('lets only one of two simultaneous saves of the same CR number through', async () => {
      const cr = digits(7);
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          inContext(() => clients.create({ name: `Racer ${token()}`, crNumber: cr }, actor)),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { code: 'DUPLICATE_SUSPECTED' },
      });
    });

    it('saves over an identity match when overridden, and audits the reason', async () => {
      const civilId = digits(8);
      const first = await inContext(() =>
        clients.create({ name: `Original ${token()}`, civilId }, actor),
      );

      const second = await inContext(() =>
        clients.create(
          {
            name: `Override ${token()}`,
            civilId,
            duplicateOverride: { reason: 'Father and son share the old ID card on file.' },
          },
          actor,
        ),
      );

      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { entityId: second.id, action: 'CREATED' },
      });
      expect(entry.after).toMatchObject({
        duplicateOverride: {
          reason: 'Father and son share the old ID card on file.',
          matchedIds: [first.id],
        },
      });
    });

    it('ignores archived clients', async () => {
      const cr = digits(7);
      const old = await inContext(() =>
        clients.create({ name: `Old ${token()}`, crNumber: cr }, actor),
      );
      await inContext(() => clients.archive(old.id, actor));

      await expect(
        inContext(() => clients.create({ name: `New ${token()}`, crNumber: cr }, actor)),
      ).resolves.toMatchObject({ crNumber: cr });
    });

    it('refuses an edit that changes the CR number to one already in use', async () => {
      const cr = digits(7);
      await inContext(() => clients.create({ name: `Holder ${token()}`, crNumber: cr }, actor));
      const other = await inContext(() => clients.create({ name: `Other ${token()}` }, actor));

      await expect(
        inContext(() => clients.update(other.id, { crNumber: cr, version: other.version }, actor)),
      ).rejects.toMatchObject({ code: 'DUPLICATE_SUSPECTED' });
    });

    it('does not re-check an identifier the edit leaves unchanged', async () => {
      const cr = digits(7);
      await inContext(() => clients.create({ name: `A ${token()}`, crNumber: cr }, actor));
      const b = await inContext(() =>
        clients.create(
          {
            name: `B ${token()}`,
            crNumber: cr,
            duplicateOverride: { reason: 'Known group company.' },
          },
          actor,
        ),
      );

      // Renaming B must not demand the override again.
      await expect(
        inContext(() =>
          clients.update(b.id, { name: `B renamed ${token()}`, crNumber: cr, version: 1 }, actor),
        ),
      ).resolves.toBeDefined();
    });

    it('reports a transliterated spelling of the same name as likely', async () => {
      const t = token();
      const original = await inContext(() =>
        clients.create({ name: `Mohammed Al Rawahi ${t}` }, actor),
      );

      const matches = await findClientDuplicates(prisma, { name: `Muhammad Al-Rawahi ${t}` });

      expect(matches).toContainEqual(
        expect.objectContaining({ id: original.id, strength: 'LIKELY', matchedOn: ['name'] }),
      );
    });

    it('does not report a different person who shares only the family name', async () => {
      const salim = await inContext(() =>
        clients.create({ name: `Salim Al Balushi ${token()}` }, actor),
      );

      const matches = await findClientDuplicates(prisma, { name: `Ahmed Al Balushi ${token()}` });

      expect(matches.map((m) => m.id)).not.toContain(salim.id);
    });

    it('never refuses a create over a name-only likeness', async () => {
      const name = `Al Noor ${token()}`;
      await inContext(() => clients.create({ name }, actor));
      await expect(inContext(() => clients.create({ name }, actor))).resolves.toBeDefined();
    });

    it('reports a client whose contact has the same phone, typed differently', async () => {
      const local = `9${digits(7)}`;
      const client = await inContext(() => clients.create({ name: `Phone ${token()}` }, actor));
      await inContext(() =>
        contacts.create(client.id, {
          name: 'Reception',
          phone: `${local.slice(0, 4)} ${local.slice(4)}`,
          isPrimary: false,
        }),
      );

      const matches = await findClientDuplicates(prisma, { phone: `+968-${local}` });

      expect(matches).toContainEqual(
        expect.objectContaining({ id: client.id, strength: 'LIKELY', matchedOn: ['phone'] }),
      );
    });
  });

  describe('properties', () => {
    it('refuses the same plot in the same wilayat, even under another client', async () => {
      const plot = `${digits(3)}/${digits(1)}`;
      const a = await inContext(() => clients.create({ name: `Plot owner ${token()}` }, actor));
      const b = await inContext(() => clients.create({ name: `Plot buyer ${token()}` }, actor));

      await inContext(() =>
        properties.create(
          { clientId: a.id, name: 'Villa', plotNumber: plot, wilayat: 'As-Seeb' },
          actor,
        ),
      );

      await expect(
        inContext(() =>
          properties.create(
            { clientId: b.id, name: 'Villa', plotNumber: ` ${plot} `, wilayat: 'as seeb' },
            actor,
          ),
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_SUSPECTED' });
    });

    it('treats the slash in a plot number as significant', async () => {
      const [x, y] = [digits(3), digits(1)];
      const client = await inContext(() => clients.create({ name: `Slash ${token()}` }, actor));
      await inContext(() =>
        properties.create(
          { clientId: client.id, name: 'P1', plotNumber: `${x}/${y}`, wilayat: 'Bawshar' },
          actor,
        ),
      );

      // "102/8" and "10/28" are different plots.
      const shifted = `${x.slice(0, 2)}/${x.slice(2)}${y}`;
      const matches = await findPropertyDuplicates(prisma, {
        plotNumber: shifted,
        wilayat: 'Bawshar',
      });
      expect(
        matches.filter((m) => m.matchedOn.includes('plotNumber') && m.clientId === client.id),
      ).toEqual([]);
    });

    it('refuses the same Krookie serial', async () => {
      const serial = `1-35-${digits(3)}-01-${digits(3)}`;
      const client = await inContext(() => clients.create({ name: `Krookie ${token()}` }, actor));
      await inContext(() =>
        properties.create({ clientId: client.id, name: 'Plot', surveyReference: serial }, actor),
      );

      await expect(
        inContext(() =>
          properties.create(
            {
              clientId: client.id,
              name: 'Plot again',
              surveyReference: serial.replaceAll('-', ' '),
            },
            actor,
          ),
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_SUSPECTED' });
    });
  });

  describe('permission', () => {
    it('is held by System Administrator and Director only', async () => {
      const rows = await prisma.rolePermission.findMany({
        where: { permission: 'directory:override_duplicate' },
        select: { roleCode: true, scope: true },
      });
      expect(rows.map((r) => r.roleCode).sort()).toEqual(['DIRECTOR', 'SYSTEM_ADMINISTRATOR']);
      expect(rows.every((r) => r.scope === 'GLOBAL')).toBe(true);
    });
  });
});
