import type { CreateContact, UpdateContact } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Contact } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForClient(clientId: string): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: { clientId, archivedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
  }

  async create(clientId: string, input: CreateContact): Promise<Contact> {
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { archivedAt: true },
      });
      if (!client) throw appError('NOT_FOUND');
      if (client.archivedAt) throw appError('CONFLICT');

      // Demote the existing primary rather than letting the database refuse
      // the write. Marking a new primary is a normal thing to do, and the user
      // should not have to unset the old one first.
      if (input.isPrimary) {
        await tx.contact.updateMany({
          where: { clientId, isPrimary: true, archivedAt: null },
          data: { isPrimary: false, version: { increment: 1 } },
        });
      }

      const contact = await tx.contact.create({
        data: {
          clientId,
          name: input.name,
          position: input.position ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          isPrimary: input.isPrimary,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Contact',
        entityId: contact.id,
        after: { name: contact.name, clientId },
      });

      return contact;
    });
  }

  async update(id: string, input: UpdateContact): Promise<Contact> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.contact.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');
      if (before.archivedAt) throw appError('CONFLICT');

      if (input.isPrimary === true) {
        await tx.contact.updateMany({
          where: { clientId: before.clientId, isPrimary: true, archivedAt: null, id: { not: id } },
          data: { isPrimary: false, version: { increment: 1 } },
        });
      }

      const { count } = await tx.contact.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw appError('STALE_RECORD');

      const after = await tx.contact.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Contact',
        entityId: id,
        before: { name: before.name, email: before.email },
        after: { name: after.name, email: after.email },
      });

      return after;
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findUnique({ where: { id } });
      if (!contact) throw appError('NOT_FOUND');
      if (contact.archivedAt) return;

      await tx.contact.update({
        where: { id },
        data: { archivedAt: new Date(), isPrimary: false, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Contact',
        entityId: id,
      });
    });
  }
}
