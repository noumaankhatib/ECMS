import {
  assignRoleSchema,
  createUserSchema,
  listQuerySchema,
  setPasswordSchema,
  updateUserSchema,
  ROLES,
  ROLE_DEFINITIONS,
  type AssignRole,
  type CreateUser,
  type ListQuery,
  type Page,
  type Role,
  type SetPassword,
  type UpdateUser,
  type UserSummary,
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
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';

import { RequirePermission } from './require-permission.decorator';
import { UserService } from './user.service';

function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/** Rejects a role code that is not one of the seven. */
function parseRole(value: string): Role {
  if (!(ROLES as readonly string[]).includes(value)) {
    throw appError('VALIDATION_FAILED', {
      fields: [{ field: 'roleCode', reason: 'That is not a role.' }],
    });
  }
  return value as Role;
}

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @RequirePermission('user:view')
  list(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Page<UserSummary>> {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermission('user:view')
  byId(@Param('id', ParseUUIDPipe) id: string): Promise<UserSummary> {
    return this.users.byId(id);
  }

  @Post()
  @RequirePermission('user:admin')
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUser,
    @Req() req: Request,
  ): Promise<UserSummary> {
    return this.users.create(body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('user:admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUser,
    @Req() req: Request,
  ): Promise<UserSummary> {
    return this.users.update(id, body, actorOf(req));
  }

  /**
   * Setting a password is its own endpoint, not a field on the edit form, so it
   * cannot happen as a side effect of correcting a typo in someone's name.
   */
  @Post(':id/password')
  @HttpCode(204)
  @RequirePermission('user:admin')
  setPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setPasswordSchema)) body: SetPassword,
    @Req() req: Request,
  ): Promise<void> {
    return this.users.setPassword(id, body, actorOf(req));
  }

  // Granting and revoking a role is granting and revoking access, so it sits
  // behind role:admin rather than user:admin. Someone who manages people is not
  // automatically someone who decides what people may do.
  @Post(':id/roles')
  @RequirePermission('role:admin')
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignRoleSchema)) body: AssignRole,
    @Req() req: Request,
  ): Promise<UserSummary> {
    return this.users.assignRole(id, body, actorOf(req));
  }

  @Delete(':id/roles/:roleCode')
  @RequirePermission('role:admin')
  removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleCode') roleCode: string,
    @Req() req: Request,
  ): Promise<UserSummary> {
    return this.users.removeRole(id, parseRole(roleCode), actorOf(req));
  }
}

@Controller('roles')
export class RoleController {
  /**
   * The seven roles, for a picker.
   *
   * Served from the shared catalogue rather than the database. The two are kept
   * honest by a test that asserts every seeded role appears here, so this
   * cannot quietly drift into offering a role that does not exist.
   */
  @Get()
  @RequirePermission('role:view')
  list(): { roles: typeof ROLE_DEFINITIONS } {
    return { roles: ROLE_DEFINITIONS };
  }
}
