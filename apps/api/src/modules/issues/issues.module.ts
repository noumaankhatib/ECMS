import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { IssueService } from './issue.service';
import { IssuesController } from './issues.controller';

@Module({
  imports: [AccessModule],
  controllers: [IssuesController],
  providers: [IssueService],
  exports: [IssueService],
})
export class IssuesModule {}
