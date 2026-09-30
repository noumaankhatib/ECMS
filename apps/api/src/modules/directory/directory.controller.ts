import {
  clientDuplicateQuerySchema,
  createClientSchema,
  createContactSchema,
  createPropertySchema,
  listQuerySchema,
  propertyDuplicateQuerySchema,
  propertyListQuerySchema,
  updateClientSchema,
  updateContactSchema,
  updatePropertySchema,
  type ClientDuplicateQuery,
  type CreateClient,
  type CreateContact,
  type CreateProperty,
  type DuplicateMatch,
  type DuplicateOverride,
  type ListQuery,
  type PropertyDuplicateQuery,
  type PropertyListQuery,
  type Page,
  type UpdateClient,
  type UpdateContact,
  type UpdateProperty,
} from '@ecms/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Client, Contact, Property } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { AuthorizationService, RequirePermission } from '../access';

import { ClientService } from './client.service';
import { ContactService } from './contact.service';
import { DuplicateService } from './duplicates';
import { PropertyService } from './property.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/**
 * Saving over an identity match is a separate authority from saving at all.
 * Checked before the service runs, so a caller without it is refused whether
 * or not a match turns out to exist — the answer never depends on data they
 * may not be entitled to know about.
 */
async function requireOverrideIfRequested(
  authorization: AuthorizationService,
  actorId: string,
  override: DuplicateOverride | undefined,
): Promise<void> {
  if (override) await authorization.require(actorId, 'directory:override_duplicate');
}

@Controller('clients')
export class ClientController {
  constructor(
    private readonly clients: ClientService,
    private readonly contacts: ContactService,
    private readonly duplicates: DuplicateService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('client:view')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery): Promise<Page<Client>> {
    return this.clients.list(query);
  }

  /**
   * A read, but a POST: the body carries CR numbers and Civil IDs, which in a
   * query string would be written to every proxy's access log.
   */
  @Post('duplicates')
  @HttpCode(200)
  @RequirePermission('client:view')
  findDuplicates(
    @Body(new ZodValidationPipe(clientDuplicateQuerySchema)) query: ClientDuplicateQuery,
  ): Promise<DuplicateMatch[]> {
    return this.duplicates.clients(query);
  }

  @Get(':id')
  @RequirePermission('client:view')
  byId(@Param('id', ParseUUIDPipe) id: string): Promise<Client> {
    return this.clients.byId(id);
  }

  @Post()
  @RequirePermission('client:create')
  async create(
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClient,
    @Req() req: Request,
  ): Promise<Client> {
    const actor = actorOf(req);
    await requireOverrideIfRequested(this.authorization, actor, body.duplicateOverride);
    return this.clients.create(body, actor);
  }

  @Patch(':id')
  @RequirePermission('client:edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClient,
    @Req() req: Request,
  ): Promise<Client> {
    const actor = actorOf(req);
    await requireOverrideIfRequested(this.authorization, actor, body.duplicateOverride);
    return this.clients.update(id, body, actor);
  }

  /**
   * Archives rather than deletes. The verb is DELETE because that is what the
   * user is expressing; the record is kept, because PRD §6 requires history to
   * survive.
   */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('client:archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    return this.clients.archive(id, actorOf(req));
  }

  @Get(':id/contacts')
  @RequirePermission('client:view')
  listContacts(@Param('id', ParseUUIDPipe) id: string): Promise<Contact[]> {
    return this.contacts.listForClient(id);
  }

  @Post(':id/contacts')
  @RequirePermission('client:edit')
  addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContact,
  ): Promise<Contact> {
    return this.contacts.create(id, body);
  }
}

@Controller('contacts')
export class ContactController {
  constructor(private readonly contacts: ContactService) {}

  @Patch(':id')
  @RequirePermission('client:edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContact,
  ): Promise<Contact> {
    return this.contacts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('client:edit')
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.contacts.archive(id);
  }
}

@Controller('properties')
export class PropertyController {
  constructor(
    private readonly properties: PropertyService,
    private readonly duplicates: DuplicateService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('property:view')
  list(
    @Query(new ZodValidationPipe(propertyListQuerySchema)) query: PropertyListQuery,
  ): Promise<Page<Property>> {
    return this.properties.list(query, query.clientId);
  }

  /**
   * A read, but a POST: the body carries CR numbers and Civil IDs, which in a
   * query string would be written to every proxy's access log.
   */
  @Post('duplicates')
  @HttpCode(200)
  @RequirePermission('property:view')
  findDuplicates(
    @Body(new ZodValidationPipe(propertyDuplicateQuerySchema)) query: PropertyDuplicateQuery,
  ): Promise<DuplicateMatch[]> {
    return this.duplicates.properties(query);
  }

  @Get(':id')
  @RequirePermission('property:view')
  byId(@Param('id', ParseUUIDPipe) id: string): Promise<Property> {
    return this.properties.byId(id);
  }

  @Post()
  @RequirePermission('property:create')
  async create(
    @Body(new ZodValidationPipe(createPropertySchema)) body: CreateProperty,
    @Req() req: Request,
  ): Promise<Property> {
    const actor = actorOf(req);
    await requireOverrideIfRequested(this.authorization, actor, body.duplicateOverride);
    return this.properties.create(body, actor);
  }

  @Patch(':id')
  @RequirePermission('property:edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePropertySchema)) body: UpdateProperty,
    @Req() req: Request,
  ): Promise<Property> {
    const actor = actorOf(req);
    await requireOverrideIfRequested(this.authorization, actor, body.duplicateOverride);
    return this.properties.update(id, body, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('property:archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    return this.properties.archive(id, actorOf(req));
  }
}
