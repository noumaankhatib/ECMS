import {
  createClientSchema,
  createContactSchema,
  createPropertySchema,
  listQuerySchema,
  updateClientSchema,
  updateContactSchema,
  updatePropertySchema,
  type CreateClient,
  type CreateContact,
  type CreateProperty,
  type ListQuery,
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
import { RequirePermission } from '../access';

import { ClientService } from './client.service';
import { ContactService } from './contact.service';
import { PropertyService } from './property.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

@Controller('clients')
export class ClientController {
  constructor(
    private readonly clients: ClientService,
    private readonly contacts: ContactService,
  ) {}

  @Get()
  @RequirePermission('client:view')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery): Promise<Page<Client>> {
    return this.clients.list(query);
  }

  @Get(':id')
  @RequirePermission('client:view')
  byId(@Param('id', ParseUUIDPipe) id: string): Promise<Client> {
    return this.clients.byId(id);
  }

  @Post()
  @RequirePermission('client:create')
  create(
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClient,
    @Req() req: Request,
  ): Promise<Client> {
    return this.clients.create(body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('client:edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClient,
    @Req() req: Request,
  ): Promise<Client> {
    return this.clients.update(id, body, actorOf(req));
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
  constructor(private readonly properties: PropertyService) {}

  @Get()
  @RequirePermission('property:view')
  list(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
    @Query('clientId') clientId?: string,
  ): Promise<Page<Property>> {
    return this.properties.list(query, clientId);
  }

  @Get(':id')
  @RequirePermission('property:view')
  byId(@Param('id', ParseUUIDPipe) id: string): Promise<Property> {
    return this.properties.byId(id);
  }

  @Post()
  @RequirePermission('property:create')
  create(
    @Body(new ZodValidationPipe(createPropertySchema)) body: CreateProperty,
    @Req() req: Request,
  ): Promise<Property> {
    return this.properties.create(body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('property:edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePropertySchema)) body: UpdateProperty,
    @Req() req: Request,
  ): Promise<Property> {
    return this.properties.update(id, body, actorOf(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('property:archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    return this.properties.archive(id, actorOf(req));
  }
}
