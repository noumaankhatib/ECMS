import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { InstructionService } from './instruction.service';
import { ObservationService } from './observation.service';
import { SiteVisitService } from './site-visit.service';
import {
  InstructionController,
  ObservationController,
  SiteVisitController,
} from './supervision.controller';

@Module({
  imports: [AccessModule],
  controllers: [SiteVisitController, ObservationController, InstructionController],
  providers: [SiteVisitService, ObservationService, InstructionService],
  exports: [SiteVisitService, ObservationService, InstructionService],
})
export class SupervisionModule {}
