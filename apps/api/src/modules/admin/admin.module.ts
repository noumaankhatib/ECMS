import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { AdminDeleteService } from './admin-delete.service';
import { AdminController } from './admin.controller';
import { ImpactService } from './impact.service';

@Module({
  imports: [AccessModule],
  controllers: [AdminController],
  providers: [ImpactService, AdminDeleteService],
})
export class AdminModule {}
