import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { ClientService } from './client.service';
import { ContactService } from './contact.service';
import { ClientController, ContactController, PropertyController } from './directory.controller';
import { PropertyService } from './property.service';

@Module({
  imports: [AccessModule],
  controllers: [ClientController, ContactController, PropertyController],
  providers: [ClientService, ContactService, PropertyService],
  exports: [ClientService, PropertyService],
})
export class DirectoryModule {}
