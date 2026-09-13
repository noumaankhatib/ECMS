import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { HandoverController } from './handover.controller';
import { HandoverService } from './handover.service';

@Module({
  imports: [AccessModule],
  controllers: [HandoverController],
  providers: [HandoverService],
  exports: [HandoverService],
})
export class HandoverModule {}
