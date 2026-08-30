import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'ecms:isPublic';

/**
 * Marks a route as reachable without signing in. Used sparingly — currently
 * only the sign-in endpoint and the health checks.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
