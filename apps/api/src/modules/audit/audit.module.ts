import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * Global because every module writes audit entries. This is the one exception
 * to modules only reaching each other through explicit imports — auditing is a
 * cross-cutting obligation, not a dependency.
 */
@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
