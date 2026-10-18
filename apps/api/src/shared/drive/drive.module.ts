import { Global, Module } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import { DRIVE_ADAPTER, type DriveAdapter } from './drive-adapter';
import { LocalDriveAdapter } from './local-drive-adapter';
import { PostgresDriveAdapter } from './postgres-drive-adapter';
import { R2DriveAdapter } from './r2-drive-adapter';

/**
 * Global infrastructure, the same posture `DatabaseModule` takes — every
 * module that stores a file needs this, and re-importing it per module would
 * be noise rather than a meaningful boundary.
 *
 * Which `DriveAdapter` is active is one env var, `DRIVE_BACKEND` — `local`
 * (the default, for ordinary development) or `postgres` (for an environment
 * with nowhere else to put files yet, see `PostgresDriveAdapter`'s own
 * comment). Nothing outside this file reads the flag; every route, service
 * and test above it depends on the `DriveAdapter` interface only.
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIVE_ADAPTER,
      useFactory: (prisma: PrismaService): DriveAdapter => {
        const backend = process.env['DRIVE_BACKEND'];
        if (backend === 'postgres') return new PostgresDriveAdapter(prisma);
        if (backend === 'r2') return new R2DriveAdapter();
        if (backend === undefined || backend === '' || backend === 'local') {
          return new LocalDriveAdapter();
        }
        // A misspelling must stop the server, not quietly fall back to local
        // disk — in a container that disk is thrown away on every redeploy, so
        // uploaded files would simply vanish.
        throw new Error(
          `Unknown DRIVE_BACKEND "${backend}". Use "local", "postgres" or "r2" (or leave it unset for local).`,
        );
      },
      inject: [PrismaService],
    },
  ],
  exports: [DRIVE_ADAPTER],
})
export class DriveModule {}
