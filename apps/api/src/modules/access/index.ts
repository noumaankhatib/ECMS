/**
 * Access — authentication, users, roles, permissions, project membership.
 *
 * Owns: User, Session, Role, RolePermission, UserRole.
 *
 * This module is the single authorization choke point. Other modules ask it
 * "may this person do this here?" via AuthorizationService, and never decide
 * for themselves.
 */
export { AccessModule } from './access.module';
export { AuthService } from './auth.service';
export { AuthorizationService } from './authorization.service';
export type { Grants } from './authorization.service';
export { PasswordService } from './password.service';
export { SessionService } from './session.service';
export { Public } from './public.decorator';
export { RequirePermission, RequirePermissionAnywhere } from './require-permission.decorator';
export type { AuthenticatedUser, LoginResult } from './auth.types';
