import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { DocumentService } from './document.service';
import { DocumentController } from './documents.controller';

@Module({
  imports: [AccessModule],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentsModule {}
