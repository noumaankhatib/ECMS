import type { UserWork } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';

/** How many of each kind to return; the page links on for the rest. */
const LIMIT = 50;

const PROJECT = { select: { code: true, name: true } } as const;

const isoDate = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);

/**
 * The open activities and issues assigned to one person.
 *
 * "Open" means what the rest of the system means by it: an activity not yet
 * done and not archived, an issue not yet closed. Only projects the PERSON
 * ASKING may see are included, so looking at a colleague's page never shows
 * work on a project the viewer could not open themselves.
 */
@Injectable()
export class UserWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async forUser(viewerId: string, userId: string): Promise<UserWork> {
    const visible = await this.authorization.visibleProjectIds(viewerId, 'project:view');
    if (visible !== null && visible.length === 0) return { activities: [], issues: [] };
    const inScope = visible === null ? {} : { projectId: { in: visible } };

    const [activities, issues] = await Promise.all([
      this.prisma.planningActivity.findMany({
        where: { assigneeId: userId, done: false, archivedAt: null, ...inScope },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
        take: LIMIT,
        select: { id: true, name: true, dueDate: true, projectId: true, project: PROJECT },
      }),
      this.prisma.issue.findMany({
        where: { ownerId: userId, status: { not: 'CLOSED' }, ...inScope },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }],
        take: LIMIT,
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          projectId: true,
          project: PROJECT,
        },
      }),
    ]);

    return {
      activities: activities.map((a) => ({
        id: a.id,
        title: a.name,
        projectId: a.projectId,
        projectCode: a.project.code,
        projectName: a.project.name,
        dueDate: isoDate(a.dueDate),
      })),
      issues: issues.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        projectId: i.projectId,
        projectCode: i.project.code,
        projectName: i.project.name,
        dueDate: isoDate(i.dueDate),
      })),
    };
  }
}
