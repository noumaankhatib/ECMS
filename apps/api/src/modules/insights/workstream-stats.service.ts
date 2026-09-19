import type { WorkstreamStats, WorkstreamType } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';

/**
 * The headline numbers for the top-level Planning/Supervision list pages —
 * a project-type-scoped sibling of DashboardService, not a replacement for
 * it. A BOTH project counts toward both workstreams' totals, the same rule
 * RequiredDocument.scope and DashboardService.projectCounts already follow.
 */
@Injectable()
export class WorkstreamStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async forType(type: WorkstreamType, userId: string): Promise<WorkstreamStats> {
    const visibleProjects = await this.authorization.visibleProjectIds(userId, 'project:view');
    const projectScope = visibleProjects === null ? {} : { id: { in: visibleProjects } };

    const totalProjects = await this.prisma.project.count({
      where: { ...projectScope, type: { in: [type, 'BOTH'] } },
    });

    const visibleForIssues = await this.authorization.visibleProjectIds(userId, 'issue:view');
    const issueScope = visibleForIssues === null ? {} : { projectId: { in: visibleForIssues } };

    // Explicitly tagged for this workstream, plus untagged issues (legacy, or
    // created on a project whose sole type is this one) — an untagged issue
    // on a BOTH project is ambiguous and is not counted here.
    const openIssues = await this.prisma.issue.count({
      where: {
        ...issueScope,
        status: { in: ['OPEN', 'IN_PROGRESS'] as string[] },
        OR: [{ workstreamType: type }, { workstreamType: null, project: { type } }],
      },
    });

    return { totalProjects, openIssues };
  }
}
