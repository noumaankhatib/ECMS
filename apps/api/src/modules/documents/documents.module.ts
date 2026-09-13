import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { DocumentService } from './document.service';
import { DocumentController, RequiredDocumentController } from './documents.controller';
import { RequiredDocumentService } from './required-document.service';

@Module({
  imports: [AccessModule],
  controllers: [DocumentController, RequiredDocumentController],
  providers: [DocumentService, RequiredDocumentService],
  exports: [DocumentService, RequiredDocumentService],
})
export class DocumentsModule {}
