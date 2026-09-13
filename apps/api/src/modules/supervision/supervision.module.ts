import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { InstructionService } from './instruction.service';
import { ObservationService } from './observation.service';
import { SiteVisitService } from './site-visit.service';
import { SupervisionAgreementService } from './supervision-agreement.service';
import {
  InstructionController,
  ObservationController,
  SiteVisitController,
  SupervisionAgreementController,
} from './supervision.controller';

@Module({
  imports: [AccessModule],
  controllers: [
    SiteVisitController,
    ObservationController,
    InstructionController,
    SupervisionAgreementController,
  ],
  providers: [
    SiteVisitService,
    ObservationService,
    InstructionService,
    SupervisionAgreementService,
  ],
  exports: [SiteVisitService, ObservationService, InstructionService, SupervisionAgreementService],
})
export class SupervisionModule {}
