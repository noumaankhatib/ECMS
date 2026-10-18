import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { SequenceModule } from '../sequence';

import { ProposalSketchTypeService } from './proposal-sketch-type.service';
import { ProposalService } from './proposal.service';
import { ProposalController, ProposalSketchTypeController } from './proposals.controller';

@Module({
  imports: [AccessModule, SequenceModule],
  controllers: [ProposalController, ProposalSketchTypeController],
  providers: [ProposalService, ProposalSketchTypeService],
  exports: [ProposalService, ProposalSketchTypeService],
})
export class ProposalsModule {}
