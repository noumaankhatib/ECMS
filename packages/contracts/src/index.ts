/**
 * Shared contracts between the API and the web application.
 *
 * Types here are DERIVED from validation schemas, never hand-written, so a
 * schema and its type cannot drift apart. Nothing in this package may import
 * from apps/ — it is a leaf.
 */

/** Project lifecycle. Agreed decision 2 — see docs/phase-1-plan.md §9. */
export const PROJECT_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** The seven roles from PRD §3. */
export const ROLES = [
  'SYSTEM_ADMINISTRATOR',
  'DIRECTOR',
  'PROJECT_MANAGER',
  'PLANNING',
  'SUPERVISION',
  'DOCUMENT_CONTROLLER',
  'CLIENT_STAKEHOLDER',
] as const;

export type Role = (typeof ROLES)[number];

/** The six permission verbs from PRD §8. */
export const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'CLOSE', 'ADMIN'] as const;

export type Action = (typeof ACTIONS)[number];

// ---------------------------------------------------------------------------
// Authentication contracts
//
// Schemas live here, shared by the API and the web application, so both
// validate against the same definition. Types are derived from the schema
// rather than written alongside it — they cannot drift apart.
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const loginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Must be a valid email address').max(320),
    // Only a presence check on sign-in. Strength rules belong on the endpoints
    // that SET a password; applying them here would tell an attacker which
    // guesses were not even worth trying.
    password: z.string().min(1, 'Password is required').max(1024),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const currentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;

// ---------------------------------------------------------------------------
// Permissions
//
// The catalogue of what can be done, to what. Shared so the web application can
// hide what a user cannot do, while the API independently REFUSES it. The UI
// hiding a button is a courtesy; the server check is the control (PRD §8, §16).
// ---------------------------------------------------------------------------

/** The things permissions apply to, in Phase 1. */
export const RESOURCES = [
  'client',
  'property',
  'project',
  'planning',
  'supervision',
  'issue',
  'user',
  'role',
] as const;
export type Resource = (typeof RESOURCES)[number];

/**
 * Written as "<resource>:<action>".
 *
 * Only combinations that mean something are listed. There is no
 * "client:approve" because nothing about a client is approved — an unusable
 * permission in the catalogue is a permission someone will eventually grant by
 * mistake.
 */
export const PERMISSIONS = [
  'client:view',
  'client:create',
  'client:edit',
  'client:archive',

  'property:view',
  'property:create',
  'property:edit',
  'property:archive',

  'project:view',
  'project:create',
  'project:edit',
  'project:close',
  'project:manage_members',

  'planning:view',
  'planning:create',
  'planning:edit',
  'planning:approve',

  'supervision:view',
  'supervision:create',
  'supervision:edit',

  'issue:view',
  'issue:create',
  'issue:edit',
  'issue:close',

  'drawing:view',
  'drawing:create',
  'drawing:approve',

  'user:view',
  'user:admin',

  'role:view',
  'role:admin',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * GLOBAL  — the holder may do this anywhere in the portfolio.
 * PROJECT — only within projects they are a member of.
 *
 * This distinction is the whole authorization model. "Project Manager" does not
 * mean someone can edit every project; it means they can edit the ones they are
 * on.
 */
export const PERMISSION_SCOPES = ['GLOBAL', 'PROJECT'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const ROLE_DEFINITIONS = [
  {
    code: 'SYSTEM_ADMINISTRATOR',
    name: 'System Administrator',
    description: 'Users, roles, permissions and system configuration.',
  },
  {
    code: 'DIRECTOR',
    name: 'Management / Director',
    description: 'Portfolio visibility, dashboards and approvals.',
  },
  {
    code: 'PROJECT_MANAGER',
    name: 'Project Manager',
    description: 'Project setup, coordination, assignments and progress.',
  },
  {
    code: 'PLANNING',
    name: 'Planning Team',
    description: 'Planning activities, submissions, drawings and approvals.',
  },
  {
    code: 'SUPERVISION',
    name: 'Supervision Team',
    description: 'Site visits, observations, instructions and issue closure.',
  },
  {
    code: 'DOCUMENT_CONTROLLER',
    name: 'Document Controller',
    description: 'Document metadata, revisions and controlled records.',
  },
  {
    code: 'CLIENT_STAKEHOLDER',
    name: 'Client / External Stakeholder',
    description: 'Restricted access to approved information when enabled.',
  },
] as const satisfies readonly { code: Role; name: string; description: string }[];

// ---------------------------------------------------------------------------
// Directory — clients, contacts, properties
// ---------------------------------------------------------------------------

/** Trims, and turns an empty string into "not provided". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

export const listQuerySchema = z
  .object({
    /** Free-text search. Matched case-insensitively against name and reference. */
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    // Capped so a caller cannot ask for the entire table in one request.
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    /** Archived records are hidden unless explicitly asked for. */
    includeArchived: z.coerce.boolean().default(false),
  })
  .strict();

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Properties are usually browsed from a client, so the list takes one.
 *
 * It has to be part of THIS schema rather than a separate parameter on the
 * handler: the schema is strict, so a query string carrying a key it does not
 * know about is refused. Reading the parameter separately and leaving it out of
 * the schema meant `?clientId=` was rejected before the handler ever saw it.
 */
export const propertyListQuerySchema = listQuerySchema.extend({
  clientId: z.string().uuid().optional(),
});

export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;

export const createClientSchema = z
  .object({
    name: z.string().trim().min(1, 'A name is required').max(200),
    reference: optionalText(50),
    notes: optionalText(5000),
  })
  .strict();

export type CreateClient = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial().extend({
  /**
   * The version the caller last read. If the record has changed since, the
   * write is refused with a conflict rather than overwriting someone's edit.
   */
  version: z.number().int().min(1),
});

export type UpdateClient = z.infer<typeof updateClientSchema>;

export const createContactSchema = z
  .object({
    name: z.string().trim().min(1, 'A name is required').max(200),
    position: optionalText(150),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Must be a valid email address')
      .max(320)
      .nullish(),
    phone: optionalText(50),
    isPrimary: z.boolean().default(false),
  })
  .strict();

export type CreateContact = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema.partial().extend({
  version: z.number().int().min(1),
});

export type UpdateContact = z.infer<typeof updateContactSchema>;

export const createPropertySchema = z
  .object({
    clientId: z.string().uuid('Must reference a client'),
    name: z.string().trim().min(1, 'A name is required').max(200),
    reference: optionalText(50),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(100),
    postcode: optionalText(20),
    country: optionalText(100),
    notes: optionalText(5000),
  })
  .strict();

export type CreateProperty = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema
  .omit({ clientId: true }) // A property never moves to a different client.
  .partial()
  .extend({ version: z.number().int().min(1) });

export type UpdateProperty = z.infer<typeof updatePropertySchema>;

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

// ---------------------------------------------------------------------------
// Projects, workstreams and membership
//
// A project is the unit of authorization for the whole system. Everything
// project-scoped resolves to exactly one project, and permission is decided
// against it.
// ---------------------------------------------------------------------------

/**
 * What the consultancy is engaged to do. A project of type BOTH is opened with
 * one workstream of each kind, so the type is not merely a label — it decides
 * what work the project actually contains.
 */
export const PROJECT_TYPES = ['PLANNING', 'SUPERVISION', 'BOTH'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

/**
 * The legal moves, as DATA (plan §5a).
 *
 * Nothing may change status by having the field written. Every change goes
 * through a named action that consults this table, and an illegal move is
 * refused rather than saved. Adding a state or changing what is legal is an
 * edit here, not a rewrite of the service.
 *
 * `CLOSED` is terminal: a closed project is read-only for good.
 */
export const PROJECT_TRANSITIONS = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['ACTIVE'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
} as const satisfies Record<ProjectStatus, readonly ProjectStatus[]>;

/**
 * The named actions a caller may take, and where each one leads.
 *
 * `activate` covers both starting a draft and resuming from hold — the target
 * state is the same, and PROJECT_TRANSITIONS already says which starting states
 * are legal. There is deliberately no generic "set status".
 */
export const PROJECT_ACTIONS = {
  activate: 'ACTIVE',
  hold: 'ON_HOLD',
  complete: 'COMPLETED',
  close: 'CLOSED',
} as const satisfies Record<string, ProjectStatus>;

export type ProjectAction = keyof typeof PROJECT_ACTIONS;

export const PROJECT_ACTION_NAMES = Object.keys(PROJECT_ACTIONS) as readonly ProjectAction[];

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return (PROJECT_TRANSITIONS[from] as readonly ProjectStatus[]).includes(to);
}

/** A project in a terminal state accepts no further change of any kind. */
export function isProjectReadOnly(status: ProjectStatus): boolean {
  return status === 'CLOSED';
}

export const WORKSTREAM_TYPES = ['PLANNING', 'SUPERVISION'] as const;
export type WorkstreamType = (typeof WORKSTREAM_TYPES)[number];

export const WORKSTREAM_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const;
export type WorkstreamStatus = (typeof WORKSTREAM_STATUSES)[number];

/** The same rule as projects, applied to the work inside them. */
export const WORKSTREAM_TRANSITIONS = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['IN_PROGRESS'],
  COMPLETED: [],
} as const satisfies Record<WorkstreamStatus, readonly WorkstreamStatus[]>;

export function canTransitionWorkstream(from: WorkstreamStatus, to: WorkstreamStatus): boolean {
  return (WORKSTREAM_TRANSITIONS[from] as readonly WorkstreamStatus[]).includes(to);
}

/** Which workstreams a project of each type opens with. */
export const WORKSTREAMS_FOR_TYPE = {
  PLANNING: ['PLANNING'],
  SUPERVISION: ['SUPERVISION'],
  BOTH: ['PLANNING', 'SUPERVISION'],
} as const satisfies Record<ProjectType, readonly WorkstreamType[]>;

/** An optional date on a form: an empty string means "not given", not "invalid". */
const optionalDate = z
  .union([z.coerce.date(), z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullish();

export const createProjectSchema = z
  .object({
    clientId: z.string().uuid('Must reference a client'),
    propertyId: z.string().uuid('Must reference a property'),
    /** The consultancy's own project number. Unique across the portfolio. */
    code: z.string().trim().min(1, 'A project code is required').max(50),
    name: z.string().trim().min(1, 'A name is required').max(200),
    description: optionalText(5000),
    type: z.enum(PROJECT_TYPES),
    startDate: optionalDate,
    targetEndDate: optionalDate,
  })
  .strict()
  .superRefine((value, ctx) => {
    // Caught here rather than in the service: it is a property of the input,
    // and both the API and the web form get the check for free.
    if (value.startDate && value.targetEndDate && value.targetEndDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetEndDate'],
        message: 'The target end date cannot be before the start date.',
      });
    }
  });

export type CreateProject = z.infer<typeof createProjectSchema>;

/**
 * Status is absent on purpose. It is not a field a caller may write; it moves
 * only through the named actions in PROJECT_ACTIONS. Client and property are
 * absent too — a project does not move to a different site or a different
 * customer, it is a different project.
 */
export const updateProjectSchema = z
  .object({
    code: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    description: optionalText(5000),
    type: z.enum(PROJECT_TYPES).optional(),
    startDate: optionalDate,
    targetEndDate: optionalDate,
    version: z.number().int().min(1),
  })
  .strict();

export type UpdateProject = z.infer<typeof updateProjectSchema>;

export const projectListQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(PROJECT_STATUSES).optional(),
    clientId: z.string().uuid().optional(),
    propertyId: z.string().uuid().optional(),
  })
  .strict();

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

/** A reason may accompany any transition, and is kept in the audit trail. */
export const projectTransitionSchema = z
  .object({
    version: z.number().int().min(1),
    reason: optionalText(1000),
  })
  .strict();

export type ProjectTransition = z.infer<typeof projectTransitionSchema>;

export const createWorkstreamSchema = z
  .object({
    type: z.enum(WORKSTREAM_TYPES),
    name: z.string().trim().min(1, 'A name is required').max(200),
    notes: optionalText(5000),
  })
  .strict();

export type CreateWorkstream = z.infer<typeof createWorkstreamSchema>;

export const updateWorkstreamSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    notes: optionalText(5000),
    version: z.number().int().min(1),
  })
  .strict();

export type UpdateWorkstream = z.infer<typeof updateWorkstreamSchema>;

export const workstreamTransitionSchema = z
  .object({
    to: z.enum(WORKSTREAM_STATUSES),
    version: z.number().int().min(1),
  })
  .strict();

export type WorkstreamTransition = z.infer<typeof workstreamTransitionSchema>;

/**
 * Membership of a project.
 *
 * `roleCode` records what this person does HERE. It is not what decides their
 * permissions — that comes from their global role, narrowed to the projects
 * they belong to (see docs/phase-1-plan.md §5).
 */
export const addProjectMemberSchema = z
  .object({
    userId: z.string().uuid('Must reference a user'),
    roleCode: z.enum(ROLES),
  })
  .strict();

export type AddProjectMember = z.infer<typeof addProjectMemberSchema>;

// ---------------------------------------------------------------------------
// User administration
//
// Until now the only way to create a user was the break-glass CLI. These are
// what the administration screens talk to.
// ---------------------------------------------------------------------------

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Password rules, in one place, applied wherever a password is SET.
 *
 * Deliberately not applied at sign-in: telling an attacker which guesses were
 * not even worth trying is a gift. Length is the rule that actually matters —
 * NIST dropped the composition requirements years ago because they push people
 * towards `Passw0rd!` and nothing else.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(1024, 'That is longer than 1024 characters');

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Must be a valid email address').max(320),
    displayName: z.string().trim().min(1, 'A name is required').max(200),
    password: passwordSchema,
    roleCode: z.enum(ROLES),
  })
  .strict();

export type CreateUser = z.infer<typeof createUserSchema>;

/**
 * Editing a user never touches their password. Setting someone else's password
 * is a separate, deliberate act with its own endpoint, so it cannot happen as a
 * side effect of correcting a typo in a name.
 */
export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict();

export type UpdateUser = z.infer<typeof updateUserSchema>;

export const setPasswordSchema = z.object({ password: passwordSchema }).strict();
export type SetPassword = z.infer<typeof setPasswordSchema>;

export const assignRoleSchema = z.object({ roleCode: z.enum(ROLES) }).strict();
export type AssignRole = z.infer<typeof assignRoleSchema>;

/** What the interface is told about a user. Never includes the password hash. */
export interface UserSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly roles: readonly Role[];
  readonly createdAt: string;
}

/**
 * What the signed-in person may do, sent to the browser so the interface can
 * hide what they cannot.
 *
 * This is a COURTESY, not a control. Every one of these is enforced again by
 * the API, which is the only thing standing between a determined caller and the
 * data (PRD §8, §16). Hiding a button prevents confusion; it prevents nothing
 * else.
 */
export interface CurrentUserGrants {
  readonly global: readonly Permission[];
  /** Held only within projects the person belongs to. */
  readonly project: readonly Permission[];
}

export interface CurrentUserResponse {
  readonly user: CurrentUser;
  readonly grants: CurrentUserGrants;
}

/**
 * Answers "should I show this?" the same way the server answers "may they?".
 *
 * `projectId` is required for a project-scoped permission, and its absence
 * means hidden — which mirrors the API refusing a project-scoped permission
 * with no project named, rather than quietly widening it.
 */
export function grantsAllow(
  grants: CurrentUserGrants,
  permission: Permission,
  options: { projectId?: string; memberOf?: readonly string[] } = {},
): boolean {
  if (grants.global.includes(permission)) return true;
  if (!grants.project.includes(permission)) return false;
  if (!options.projectId) return false;
  return (options.memberOf ?? []).includes(options.projectId);
}

// ---------------------------------------------------------------------------
// Approvals — one shared state machine (docs/phase-3-plan.md §4), consumed by
// submissions here and by drawing revisions later, rather than reimplemented
// per module. This is `phase-1-plan.md` §5a's `Approval` row.
// ---------------------------------------------------------------------------

export const APPROVAL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED_FOR_REVISION',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_TRANSITIONS = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'],
  APPROVED: [],
  REJECTED: [],
  RETURNED_FOR_REVISION: ['SUBMITTED'],
} as const satisfies Record<ApprovalStatus, readonly ApprovalStatus[]>;

export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return (APPROVAL_TRANSITIONS[from] as readonly ApprovalStatus[]).includes(to);
}

// ---------------------------------------------------------------------------
// Planning — activities, milestones and submissions
//
// docs/phase-2-plan.md §4 promised that Phase 3's Approvals module would
// extend a submission's status set rather than replace it — this is that.
// `WITHDRAWN` is layered on top of the shared approval table as a
// submission-specific edge; the shared table has no reason to know about it.
// ---------------------------------------------------------------------------

export const SUBMISSION_STATUSES = [...APPROVAL_STATUSES, 'WITHDRAWN'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_TRANSITIONS = {
  DRAFT: [...APPROVAL_TRANSITIONS.DRAFT, 'WITHDRAWN'],
  SUBMITTED: [...APPROVAL_TRANSITIONS.SUBMITTED, 'WITHDRAWN'],
  UNDER_REVIEW: [...APPROVAL_TRANSITIONS.UNDER_REVIEW],
  APPROVED: [...APPROVAL_TRANSITIONS.APPROVED],
  REJECTED: [...APPROVAL_TRANSITIONS.REJECTED],
  RETURNED_FOR_REVISION: [...APPROVAL_TRANSITIONS.RETURNED_FOR_REVISION],
  WITHDRAWN: [],
} as const satisfies Record<SubmissionStatus, readonly SubmissionStatus[]>;

export function canTransitionSubmission(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return (SUBMISSION_TRANSITIONS[from] as readonly SubmissionStatus[]).includes(to);
}

/**
 * The named actions a caller may take, and where each one leads — the same
 * shape `PROJECT_ACTIONS` and `ISSUE_ACTIONS` use, and for the same reason:
 * no generic "set status" operation (`phase-1-plan.md` §5a). `submit` covers
 * both a draft's first submission and a resubmission after being returned
 * for revision, the same way `activate` covers two starting states in
 * `PROJECT_ACTIONS` — the target is identical, and the transition table
 * already says which starting states are legal.
 */
export const SUBMISSION_ACTIONS = {
  submit: 'SUBMITTED',
  review: 'UNDER_REVIEW',
  approve: 'APPROVED',
  reject: 'REJECTED',
  returnForRevision: 'RETURNED_FOR_REVISION',
  withdraw: 'WITHDRAWN',
} as const satisfies Record<string, SubmissionStatus>;

export type SubmissionAction = keyof typeof SUBMISSION_ACTIONS;

export const SUBMISSION_ACTION_NAMES = Object.keys(
  SUBMISSION_ACTIONS,
) as readonly SubmissionAction[];

export const createPlanningActivitySchema = z
  .object({
    name: z.string().trim().min(1, 'A name is required').max(200),
    description: optionalText(5000),
    assigneeId: z.string().uuid().nullish(),
    dueDate: optionalDate,
  })
  .strict();

export type CreatePlanningActivity = z.infer<typeof createPlanningActivitySchema>;

export const updatePlanningActivitySchema = createPlanningActivitySchema.partial().extend({
  /** The only field a caller writes directly rather than through an action — there
   * is no PRD-defined workflow around "done", just a checkbox. */
  done: z.boolean().optional(),
  version: z.number().int().min(1),
});

export type UpdatePlanningActivity = z.infer<typeof updatePlanningActivitySchema>;

export const createMilestoneSchema = z
  .object({
    name: z.string().trim().min(1, 'A name is required').max(200),
    targetDate: optionalDate,
  })
  .strict();

export type CreateMilestone = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    targetDate: optionalDate,
    /** Set once, by reaching it — not something a caller un-sets casually. */
    achievedDate: optionalDate,
    version: z.number().int().min(1),
  })
  .strict();

export type UpdateMilestone = z.infer<typeof updateMilestoneSchema>;

export const createSubmissionSchema = z
  .object({
    reference: z.string().trim().min(1, 'A reference is required').max(100),
    authorityName: z.string().trim().min(1, 'The authority is required').max(200),
    notes: optionalText(5000),
  })
  .strict();

export type CreateSubmission = z.infer<typeof createSubmissionSchema>;

export const updateSubmissionSchema = z
  .object({
    reference: z.string().trim().min(1).max(100).optional(),
    authorityName: z.string().trim().min(1).max(200).optional(),
    notes: optionalText(5000),
    version: z.number().int().min(1),
  })
  .strict();

export type UpdateSubmission = z.infer<typeof updateSubmissionSchema>;

export const submissionTransitionSchema = z
  .object({
    version: z.number().int().min(1),
    /** An approval decision's own comment — "why this move, right now" — the
     *  same role `reason` plays on `ProjectTransition`. */
    reason: optionalText(1000),
  })
  .strict();

export type SubmissionTransition = z.infer<typeof submissionTransitionSchema>;

// ---------------------------------------------------------------------------
// Supervision — site visits, observations and instructions
//
// docs/phase-2-plan.md §4. None of the three carries a status: PRD §6 gives
// observations and instructions no lifecycle of its own ("assign owners and
// due dates" is closer to a simple task than a workflow), and a site visit is
// simply a fact once it has happened. None is archived either, for the same
// reason Submission is not — there is nothing to hide a historical record
// from. `supervisionListQuerySchema` therefore drops `includeArchived`, the
// one field of `listQuerySchema` that would have nothing to filter on.
// ---------------------------------------------------------------------------

export const supervisionListQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type SupervisionListQuery = z.infer<typeof supervisionListQuerySchema>;

export const createSiteVisitSchema = z
  .object({
    visitDate: z.coerce.date(),
    attendees: optionalText(2000),
    notes: optionalText(5000),
  })
  .strict();

export type CreateSiteVisit = z.infer<typeof createSiteVisitSchema>;

export const updateSiteVisitSchema = createSiteVisitSchema.partial().extend({
  version: z.number().int().min(1),
});

export type UpdateSiteVisit = z.infer<typeof updateSiteVisitSchema>;

export const createObservationSchema = z
  .object({
    description: z.string().trim().min(1, 'A description is required').max(5000),
    category: optionalText(100),
  })
  .strict();

export type CreateObservation = z.infer<typeof createObservationSchema>;

export const updateObservationSchema = createObservationSchema.partial().extend({
  version: z.number().int().min(1),
});

export type UpdateObservation = z.infer<typeof updateObservationSchema>;

export const createInstructionSchema = z
  .object({
    directiveText: z.string().trim().min(1, 'Directive text is required').max(5000),
    assigneeId: z.string().uuid().nullish(),
    dueDate: optionalDate,
  })
  .strict();

export type CreateInstruction = z.infer<typeof createInstructionSchema>;

export const updateInstructionSchema = createInstructionSchema.partial().extend({
  /** Set once, when the instruction has been carried out — a completion mark,
   *  not a status, the same treatment `Milestone.achievedDate` gets. */
  actionedAt: optionalDate,
  version: z.number().int().min(1),
});

export type UpdateInstruction = z.infer<typeof updateInstructionSchema>;

// ---------------------------------------------------------------------------
// Issues — the fourth state machine in the system (phase-1-plan.md §5a).
//
// docs/phase-2-plan.md §4-§5. An issue is optionally raised from an
// observation, carries severity and priority as catalogues rather than fixed
// enums, and moves Open → In Progress → Resolved → Closed, with reopening
// from either Resolved or Closed recorded back to Open.
// ---------------------------------------------------------------------------

export const ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/**
 * Not archived — same reasoning as `supervisionListQuerySchema` — but an
 * issue does have a status worth filtering a list by, which neither
 * supervision entity does.
 */
export const issueListQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    status: z.enum(ISSUE_STATUSES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type IssueListQuery = z.infer<typeof issueListQuerySchema>;

export const ISSUE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_TRANSITIONS = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
} as const satisfies Record<IssueStatus, readonly IssueStatus[]>;

/**
 * The named actions a caller may take, and where each one leads — the same
 * shape `PROJECT_ACTIONS` uses, and for the same reason: there is no generic
 * "set status" operation for any of the four state machines in this system.
 * `reopen` covers both starting points ISSUE_TRANSITIONS already allows.
 */
export const ISSUE_ACTIONS = {
  start: 'IN_PROGRESS',
  resolve: 'RESOLVED',
  close: 'CLOSED',
  reopen: 'OPEN',
} as const satisfies Record<string, IssueStatus>;

export type IssueAction = keyof typeof ISSUE_ACTIONS;

export const ISSUE_ACTION_NAMES = Object.keys(ISSUE_ACTIONS) as readonly IssueAction[];

export function canTransitionIssue(from: IssueStatus, to: IssueStatus): boolean {
  return (ISSUE_TRANSITIONS[from] as readonly IssueStatus[]).includes(to);
}

export const createIssueSchema = z
  .object({
    title: z.string().trim().min(1, 'A title is required').max(200),
    description: optionalText(5000),
    /** Set once, at creation — the same treatment `Property.clientId` gets;
     *  an issue does not move to a different observation afterward. */
    observationId: z.string().uuid().nullish(),
    severity: z.enum(ISSUE_SEVERITIES).default('MEDIUM'),
    priority: z.enum(ISSUE_PRIORITIES).default('MEDIUM'),
    ownerId: z.string().uuid().nullish(),
    dueDate: optionalDate,
  })
  .strict();

export type CreateIssue = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = createIssueSchema
  .omit({ observationId: true })
  .partial()
  .extend({
    /** Closure evidence (PRD §6). Free text, editable independently of the
     *  close transition — not required to close, and not tied to it. */
    closureNotes: optionalText(5000),
    version: z.number().int().min(1),
  });

export type UpdateIssue = z.infer<typeof updateIssueSchema>;

export const issueTransitionSchema = z
  .object({
    version: z.number().int().min(1),
    reason: optionalText(1000),
  })
  .strict();

export type IssueTransition = z.infer<typeof issueTransitionSchema>;

// ---------------------------------------------------------------------------
// Drawings — the strictest invariant in the system (docs/phase-3-plan.md §5).
//
// A drawing revision's status is `ApprovalStatus`, unchanged — it consumes
// the shared table directly, with no extra edge the way Submission's
// `WITHDRAWN` is. There is no "edit" verb: a revision is created, and moves
// through the approval actions, and nothing about its content may ever
// change once written (`drawing:create` covers the former, `drawing:approve`
// the decisions).
// ---------------------------------------------------------------------------

/**
 * Not archived, and not paged by status the way issues are — a drawing
 * register has no equivalent of "hide the closed ones".
 */
export const drawingListQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type DrawingListQuery = z.infer<typeof drawingListQuerySchema>;

export const createDrawingSchema = z
  .object({
    number: z.string().trim().min(1, 'A drawing number is required').max(100),
    title: z.string().trim().min(1, 'A title is required').max(200),
  })
  .strict();

export type CreateDrawing = z.infer<typeof createDrawingSchema>;

export const createDrawingRevisionSchema = z
  .object({
    revisionCode: z.string().trim().min(1, 'A revision code is required').max(50),
    /** Set once a real Drive account exists to upload to
     *  (docs/phase-3-plan.md §7) — null is the honest answer until then. */
    fileId: optionalText(500),
    notes: optionalText(5000),
  })
  .strict();

export type CreateDrawingRevision = z.infer<typeof createDrawingRevisionSchema>;

export const drawingRevisionTransitionSchema = z
  .object({
    version: z.number().int().min(1),
    reason: optionalText(1000),
  })
  .strict();

export type DrawingRevisionTransition = z.infer<typeof drawingRevisionTransitionSchema>;

/**
 * The named actions a caller may take on a revision, and where each one
 * leads — reusing `ApprovalStatus` and `canTransitionApproval` directly,
 * with no submission-style extra edge.
 */
export const DRAWING_REVISION_ACTIONS = {
  submit: 'SUBMITTED',
  review: 'UNDER_REVIEW',
  approve: 'APPROVED',
  reject: 'REJECTED',
  returnForRevision: 'RETURNED_FOR_REVISION',
} as const satisfies Record<string, ApprovalStatus>;

export type DrawingRevisionAction = keyof typeof DRAWING_REVISION_ACTIONS;

export const DRAWING_REVISION_ACTION_NAMES = Object.keys(
  DRAWING_REVISION_ACTIONS,
) as readonly DrawingRevisionAction[];
