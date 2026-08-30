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
export const RESOURCES = ['client', 'property', 'project', 'user', 'role'] as const;
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
