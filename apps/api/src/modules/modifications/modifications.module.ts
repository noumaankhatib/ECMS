import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { ModificationService } from './modification.service';
import { ModificationController } from './modifications.controller';

@Module({
  imports: [AccessModule],
  controllers: [ModificationController],
  providers: [ModificationService],
  exports: [ModificationService],
})
export class ModificationsModule {}
