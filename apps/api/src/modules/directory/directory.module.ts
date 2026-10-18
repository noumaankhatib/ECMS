import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { SequenceModule } from '../sequence';

import { ClientService } from './client.service';
import { ContactService } from './contact.service';
import {
  ClientController,
  ContactController,
  PropertyController,
  WilayatController,
} from './directory.controller';
import { DuplicateService } from './duplicates';
import { PropertyService } from './property.service';
import { WilayatService } from './wilayat.service';

@Module({
  imports: [AccessModule, SequenceModule],
  controllers: [ClientController, ContactController, PropertyController, WilayatController],
  providers: [ClientService, ContactService, DuplicateService, PropertyService, WilayatService],
  exports: [ClientService, DuplicateService, PropertyService],
})
export class DirectoryModule {}
