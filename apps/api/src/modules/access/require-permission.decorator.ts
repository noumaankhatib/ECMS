import type { Permission } from '@ecms/contracts';
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION = 'ecms:requiredPermission';

/**
 * Declares what a route needs. Read by PermissionGuard.
 *
 * This is the first of the two enforcement layers. The second is query-level
 * scoping in the repositories. Neither is trusted on its own.
 */
export const RequirePermission = (permission: Permission): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

export const REQUIRED_PERMISSION_ANYWHERE = 'ecms:requiredPermissionAnywhere';

/**
 * For LIST routes, and only for list routes.
 *
 * A collection endpoint names no project, so the ordinary check cannot run: a
 * PROJECT-scoped permission with no project is refused, which would shut a
 * Project Manager out of the project list entirely.
 *
 * This says something weaker and honest about what it says: the caller holds
 * this permission SOMEWHERE — globally, or on at least one project. It is
 * never sufficient on its own. The handler must scope its query with
 * `AuthorizationService.visibleProjectIds`, which is what decides the rows.
 * Someone holding it only through membership, but a member of nothing, passes
 * this guard and receives an empty page — an empty screen, not a breach.
 */
export const RequirePermissionAnywhere = (permission: Permission): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSION_ANYWHERE, permission);
