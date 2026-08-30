/**
 * Projects — project lifecycle, workstreams and membership.
 *
 * Owns: Project, ProjectMember, Workstream.
 * Depends on: access (authorization), audit.
 *
 * A project is the unit of authorization for the whole system. Every
 * project-scoped record resolves to exactly one project, and permission is
 * evaluated against it.
 *
 * Client and property are read through the shared Prisma client rather than by
 * importing the directory module. Directory has to count projects when deciding
 * whether something may be archived, so an import in either direction would
 * make a cycle — and the two modules only need each other's rows, not each
 * other's behaviour.
 */
export { ProjectsModule } from './projects.module';
export { ProjectService } from './project.service';
export { MembershipService } from './membership.service';
export { WorkstreamService } from './workstream.service';
