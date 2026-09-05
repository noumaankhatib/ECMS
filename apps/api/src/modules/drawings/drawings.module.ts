import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { DrawingRevisionService } from './drawing-revision.service';
import { DrawingService } from './drawing.service';
import { DrawingController, DrawingRevisionController } from './drawings.controller';

@Module({
  imports: [AccessModule],
  controllers: [DrawingController, DrawingRevisionController],
  providers: [DrawingService, DrawingRevisionService],
  exports: [DrawingService, DrawingRevisionService],
})
export class DrawingsModule {}
