import {
  addProjectMemberSchema,
  createProjectSchema,
  createWorkstreamSchema,
  projectListQuerySchema,
  projectTransitionSchema,
  updateProjectSchema,
  updateWorkstreamSchema,
  upgradeProjectToBothSchema,
  workstreamTransitionSchema,
  type AddProjectMember,
  type CreateProject,
  type CreateWorkstream,
  type GateOverride,
  type Page,
  type ProjectListQuery,
  type ProjectReadiness,
  type ProjectTransition,
  type UpdateProject,
  type UpdateWorkstream,
  type UpgradeProjectToBoth,
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
import { AuthorizationService, RequirePermission, RequirePermissionAnywhere } from '../access';

import { CompletionGateService } from './completion-gate.service';
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
 * Who may move something to Completed.
 *
 * Ordinarily, whoever may edit the project. Pushing past an unmet completion
 * gate is a separate authority (`workflow:override_gate`), held by Director
 * and System Administrator — and a Director does not edit projects, so the
 * override must stand on its own: someone without `project:edit` may complete
 * only by sending an override, and only if they hold that permission.
 *
 * Checked before the service runs, so the answer never depends on whether the
 * gate turns out to be met — the same rule the directory's duplicate
 * override follows.
 */
async function requireCompletionAuthority(
  authorization: AuthorizationService,
  actorId: string,
  projectId: string,
  override: GateOverride | undefined,
): Promise<void> {
  if (override) {
    await authorization.require(actorId, 'workflow:override_gate');
    return;
  }
  await authorization.require(actorId, 'project:edit', projectId);
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
    private readonly gates: CompletionGateService,
    private readonly authorization: AuthorizationService,
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

  /** `project:view` gets a caller this far; `requireCompletionAuthority`
   *  then decides between ordinary editing and a gate override. */
  @Post(':id/complete')
  @RequirePermission('project:view')
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectTransitionSchema)) body: ProjectTransition,
    @Req() req: Request,
  ): Promise<Project> {
    const actor = actorOf(req);
    await requireCompletionAuthority(this.authorization, actor, id, body.override);
    return this.projects.transition(id, 'complete', body, actor);
  }

  /**
   * What completing the project, and each of its workstreams, still depends
   * on — the same checks the transitions enforce, so the page can show them
   * before anyone presses the button. Read-only, computed fresh each call.
   */
  @Get(':id/readiness')
  @RequirePermission('project:view')
  readiness(@Param('id', ParseUUIDPipe) id: string): Promise<ProjectReadiness> {
    return this.gates.readiness(id);
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

  /**
   * The client's "add supervision to an existing planning project" flow.
   * Upgrades a PLANNING project to BOTH in place — same row, same code — and
   * opens its Supervision workstream. Deliberately its own action rather than
   * a `type` PATCH through `update()` (which now refuses this exact change):
   * a bare field write can't also open the workstream atomically.
   */
  @Post(':id/upgrade-to-supervision')
  @RequirePermission('project:edit')
  upgradeToSupervision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(upgradeProjectToBothSchema)) body: UpgradeProjectToBoth,
    @Req() req: Request,
  ): Promise<Project> {
    return this.projects.upgradeToSupervision(id, body, actorOf(req));
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

  /** As `complete`: editing moves a workstream; an override (Director or
   *  System Administrator) may only ever complete one. */
  @Post(':projectId/workstreams/:id/status')
  @RequirePermission('project:view')
  async transitionWorkstream(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(workstreamTransitionSchema)) body: WorkstreamTransition,
    @Req() req: Request,
  ): Promise<Workstream> {
    if (body.override && body.to !== 'COMPLETED') throw appError('FORBIDDEN');
    await requireCompletionAuthority(this.authorization, actorOf(req), projectId, body.override);
    return this.workstreams.transition(projectId, id, body);
  }
}
