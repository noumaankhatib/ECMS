import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { MembershipService } from './membership.service';
import { ProjectService } from './project.service';
import { ProjectController } from './projects.controller';
import { WorkstreamService } from './workstream.service';

@Module({
  imports: [AccessModule],
  controllers: [ProjectController],
  providers: [ProjectService, MembershipService, WorkstreamService],
  exports: [ProjectService, MembershipService],
})
export class ProjectsModule {}
