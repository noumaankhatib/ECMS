import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { PasswordService } from './password.service';
import { PermissionGuard } from './permission.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthorizationService,
    PasswordService,
    SessionService,
    // Order matters: AuthGuard establishes who the caller is, PermissionGuard
    // then decides what they may do. Nest runs global guards in registration
    // order, so this pair must stay this way round.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService, AuthorizationService, PasswordService, SessionService],
})
export class AccessModule {}
