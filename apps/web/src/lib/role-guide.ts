import type { PermissionScope, RoleDetail } from '@ecms/contracts';

/**
 * Turns permission codes ("proposal:convert") into the sentences a person
 * reading a role would expect ("Proposals — convert to project"), grouped by
 * area and split by where they apply.
 *
 * The split is the whole authorization model, so it is the first thing the
 * summary says: some abilities apply across the entire portfolio, others only
 * inside projects the person has been added to.
 */

interface Entry {
  readonly area: string;
  readonly action: string;
  /** The full sentence, shown as a tooltip when the label had to be short. */
  readonly detail?: string;
}

const AREAS = [
  'Clients',
  'Properties',
  'Proposals',
  'Projects',
  'Planning',
  'Supervision',
  'Issues',
  'Drawings',
  'Documents',
  'Users',
  'Settings',
  'Safeguards',
] as const;

const RESOURCE_AREA: Readonly<Record<string, string>> = {
  client: 'Clients',
  property: 'Properties',
  proposal: 'Proposals',
  project: 'Projects',
  planning: 'Planning',
  supervision: 'Supervision',
  issue: 'Issues',
  drawing: 'Drawings',
  document: 'Documents',
};

const ACTION_LABEL: Readonly<Record<string, string>> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  approve: 'Approve',
  convert: 'Convert to project',
  close: 'Close',
  archive: 'Archive',
};
const ACTION_ORDER = Object.values(ACTION_LABEL);

/** Permissions whose code does not read as "<area> <verb>". */
const SPECIAL: Readonly<Record<string, Entry>> = {
  'project:manage_members': { area: 'Projects', action: 'Manage the project team' },
  'user:view': { area: 'Users', action: 'See user accounts' },
  'user:admin': { area: 'Users', action: 'Create and manage accounts' },
  'role:view': { area: 'Users', action: 'See roles' },
  'role:admin': { area: 'Users', action: 'Assign and remove roles' },
  'sketch_type:admin': { area: 'Settings', action: 'Manage sketch types' },
  'work_template:admin': { area: 'Settings', action: 'Manage planning templates' },
  'wilayat:admin': { area: 'Settings', action: 'Manage the wilayat list' },
  'required_document:admin': { area: 'Settings', action: 'Manage required documents' },
  'admin:data': {
    area: 'Settings',
    action: 'Archive or delete data',
    detail: 'Use Data management to archive or permanently delete records.',
  },
  'directory:override_duplicate': {
    area: 'Safeguards',
    action: 'Override duplicate identity',
    detail:
      'Save a client or property whose official identity already exists, with a written reason.',
  },
  'approval:override_self': {
    area: 'Safeguards',
    action: 'Approve own work with a reason',
    detail:
      'Approve a drawing revision, submission or modification you created yourself, with a written reason kept in the audit trail.',
  },
  'workflow:override_gate': {
    area: 'Safeguards',
    action: 'Override completion checks',
    detail:
      'Complete a project or workstream before its completion conditions are met, with a written reason.',
  },
};

function entryFor(permission: string): Entry {
  const special = SPECIAL[permission];
  if (special) return special;
  const [resource = '', verb = ''] = permission.split(':');
  const area =
    RESOURCE_AREA[resource] ??
    resource.charAt(0).toUpperCase() + resource.slice(1).replace(/_/g, ' ');
  const action = ACTION_LABEL[verb] ?? verb.replace(/_/g, ' ');
  return { area, action: action.charAt(0).toUpperCase() + action.slice(1) };
}

export interface AreaLine {
  readonly area: string;
  readonly actions: readonly string[];
}

export interface RoleSummary {
  /** Abilities that apply to every project and record. */
  readonly anywhere: readonly AreaLine[];
  /** Abilities that apply only inside projects the person is a member of. */
  readonly inProjects: readonly AreaLine[];
}

function areaIndex(area: string): number {
  const i = (AREAS as readonly string[]).indexOf(area);
  return i === -1 ? AREAS.length : i;
}

function actionIndex(action: string): number {
  const i = ACTION_ORDER.indexOf(action);
  return i === -1 ? ACTION_ORDER.length : i;
}

function lines(permissions: readonly string[]): AreaLine[] {
  const byArea = new Map<string, Set<string>>();
  for (const permission of permissions) {
    const { area, action } = entryFor(permission);
    const set = byArea.get(area) ?? new Set<string>();
    set.add(action);
    byArea.set(area, set);
  }
  return [...byArea.entries()]
    .sort(([a], [b]) => areaIndex(a) - areaIndex(b) || a.localeCompare(b))
    .map(([area, actions]) => ({
      area,
      actions: [...actions].sort((x, y) => actionIndex(x) - actionIndex(y) || x.localeCompare(y)),
    }));
}

/** The summary of one or more roles' permissions (a person may hold several). */
export function summariseRoles(roles: readonly Pick<RoleDetail, 'permissions'>[]): RoleSummary {
  const global = new Set<string>();
  const project = new Set<string>();
  for (const role of roles) {
    for (const { permission, scope } of role.permissions) {
      (scope === 'GLOBAL' ? global : project).add(permission);
    }
  }
  // A global permission already covers the project case; do not list it twice.
  for (const permission of global) project.delete(permission);
  return { anywhere: lines([...global]), inProjects: lines([...project]) };
}

/** One cell of the comparison table: "View, Create; Edit†". */
export function compareCell(
  role: Pick<RoleDetail, 'permissions'>,
  area: string,
): { text: string; hasProjectScope: boolean } {
  const summary = summariseRoles([role]);
  const anywhere = summary.anywhere.find((l) => l.area === area)?.actions ?? [];
  const project = summary.inProjects.find((l) => l.area === area)?.actions ?? [];
  const parts = [anywhere.join(', '), project.map((a) => `${a}†`).join(', ')].filter(Boolean);
  return { text: parts.join('; '), hasProjectScope: project.length > 0 };
}

export function areasOf(roles: readonly Pick<RoleDetail, 'permissions'>[]): string[] {
  const seen = new Set<string>();
  for (const role of roles) {
    for (const { permission } of role.permissions) seen.add(entryFor(permission).area);
  }
  return [...seen].sort((a, b) => areaIndex(a) - areaIndex(b) || a.localeCompare(b));
}

export type { PermissionScope };

/** Abilities that change records for good, approve work or bypass a check. */
const SENSITIVE =
  /^(archive|close|approve|convert|override|assign and remove|create and manage|manage the project team|archive or delete)/i;

export function actionMeta(label: string): { sensitive: boolean; detail?: string } {
  const detail = Object.values(SPECIAL).find((e) => e.action === label)?.detail;
  return { sensitive: SENSITIVE.test(label), ...(detail ? { detail } : {}) };
}
