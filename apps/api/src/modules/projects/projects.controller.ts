import {
  addProjectMemberSchema,
  createProjectSchema,
  createWorkstreamSchema,
  projectListQuerySchema,
  projectTransitionSchema,
  updateProjectSchema,
  updateWorkstreamSchema,
  workstreamTransitionSchema,
  type AddProjectMember,
  type CreateProject,
  type CreateWorkstream,
  type Page,
  type ProjectListQuery,
  type ProjectTransition,
  type UpdateProject,
  type UpdateWorkstream,
  type WorkstreamTransition,
} from '@ecms/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Project, ProjectMember, Workstream } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission, RequirePermissionAnywhere } from '../access';

import { MembershipService } from './membership.service';
import { ProjectService } from './project.service';
import { WorkstreamService } from './workstream.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/**
 * Every route here is either scoped to one project named in the URL — which is
 * what PermissionGuard reads to decide access — or, for the list, gated by
 * holding the permission somewhere and then scoped inside the query.
 *
 * Nested paths are not decoration. They are how the guard knows which project a
 * workstream or a membership belongs to.
 */
@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly members: MembershipService,
    private readonly workstreams: WorkstreamService,
  ) {}

  /**
   * The critical case in Phase 1: someone who is not a member of a project
   * receives nothing for it here. Not a hidden button — no row.
   */
  @Get()
  @RequirePermissionAnywhere('project:view')
  list(
    @Query(new ZodValidationPipe(projectListQuerySchema)) query: ProjectListQuery,
    @Req() req: Request,
  ): Promise<Page<Project>> {
    return this.projects.list(query, actorOf(req));
  }

  @Get(':id')
  @RequirePermission('project:view')
  byId(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<Project> {
    return this.projects.byId(id, actorOf(req));
  }

  @Post()
  @RequirePermission('project:create')
  create(
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProject,
    @Req() req: Request,
  ): Promise<Project> {
    return this.projects.create(body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('project:edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProject,
    @Req() req: Request,
  ): Promise<Project> {
    return this.projects.update(id, body, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // Transitions.
  //
  // One route per named action, deliberately. There is no "set the status"
  // endpoint, because a status is not a field a caller may write (plan §5a).
  // Each action knows only its target; the transition table decides whether the
  // move is legal from where the project currently is.
  // ---------------------------------------------------------------------------

  /** Starts a draft, and resumes one that was on hold. */
  @Post(':id/activate')
  @RequirePermission('project:edit')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectTransitionSchema)) body: ProjectTransition,
    @Req() req: Request,
  ): Promise<Project> {
    return this.projects.transition(id, 'activate', body, actorOf(req));
  }

  @Post(':id/hold')
  @RequirePermission('project:edit')
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectTransitionSchema)) body: ProjectTransition,
    @Req() req: Request,
  ): Promise<Project> {
    return this.projects.transition(id, 'hold', body, actorOf(req));
  }

  @Post(':id/complete')
  @RequirePermission('project:edit')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectTransitionSchema)) body: ProjectTransition,
    @Req() req: Request,
  ): Promise<Project> {
    return this.projects.transition(id, 'complete', body, actorOf(req));
  }

  /** Closing is its own permission: it is the one move nothing comes back from. */
  @Post(':id/close')
  @RequirePermission('project:close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectTransitionSchema)) body: ProjectTransition,
    @Req() req: Request,
  ): Promise<Project> {
    return this.projects.transition(id, 'close', body, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------

  @Get(':projectId/members')
  @RequirePermission('project:view')
  listMembers(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<ProjectMember[]> {
    return this.members.list(projectId);
  }

  @Post(':projectId/members')
  @RequirePermission('project:manage_members')
  addMember(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(addProjectMemberSchema)) body: AddProjectMember,
    @Req() req: Request,
  ): Promise<ProjectMember> {
    return this.members.add(projectId, body, actorOf(req));
  }

  @Delete(':projectId/members/:userId')
  @HttpCode(204)
  @RequirePermission('project:manage_members')
  removeMember(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.members.remove(projectId, userId, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // Workstreams
  // ---------------------------------------------------------------------------

  @Get(':projectId/workstreams')
  @RequirePermission('project:view')
  listWorkstreams(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<Workstream[]> {
    return this.workstreams.listForProject(projectId);
  }

  @Post(':projectId/workstreams')
  @RequirePermission('project:edit')
  addWorkstream(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createWorkstreamSchema)) body: CreateWorkstream,
  ): Promise<Workstream> {
    return this.workstreams.create(projectId, body);
  }

  @Patch(':projectId/workstreams/:id')
  @RequirePermission('project:edit')
  updateWorkstream(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWorkstreamSchema)) body: UpdateWorkstream,
  ): Promise<Workstream> {
    return this.workstreams.update(projectId, id, body);
  }

  @Post(':projectId/workstreams/:id/status')
  @RequirePermission('project:edit')
  transitionWorkstream(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(workstreamTransitionSchema)) body: WorkstreamTransition,
  ): Promise<Workstream> {
    return this.workstreams.transition(projectId, id, body);
  }
}
