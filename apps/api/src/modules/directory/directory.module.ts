import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { ClientService } from './client.service';
import { ContactService } from './contact.service';
import { ClientController, ContactController, PropertyController } from './directory.controller';
import { DuplicateService } from './duplicates';
import { PropertyService } from './property.service';

@Module({
  imports: [AccessModule],
  controllers: [ClientController, ContactController, PropertyController],
  providers: [ClientService, ContactService, DuplicateService, PropertyService],
  exports: [ClientService, DuplicateService, PropertyService],
})
export class DirectoryModule {}
