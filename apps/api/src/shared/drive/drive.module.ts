import { Global, Module } from '@nestjs/common';

import { DRIVE_ADAPTER } from './drive-adapter';
import { LocalDriveAdapter } from './local-drive-adapter';

/**
 * Global infrastructure, the same posture `DatabaseModule` takes — every
 * module that stores a file needs this, and re-importing it per module would
 * be noise rather than a meaningful boundary.
 */
@Global()
@Module({
  providers: [{ provide: DRIVE_ADAPTER, useClass: LocalDriveAdapter }],
  exports: [DRIVE_ADAPTER],
})
export class DriveModule {}
