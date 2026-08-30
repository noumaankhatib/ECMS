/** What happened. Extended as modules are added. */
export type AuditAction =
  | 'CREATED'
  | 'UPDATED'
  | 'ARCHIVED'
  | 'RESTORED'
  | 'STATUS_CHANGED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'LOGGED_IN'
  | 'LOGGED_OUT'
  | 'LOGIN_FAILED'
  | 'PERMISSION_DENIED';

export type AuditOutcome = 'SUCCEEDED' | 'REJECTED';

export interface AuditRecord {
  readonly action: AuditAction;
  readonly entityType: string;
  /** Absent when the target does not exist — a sign-in attempt against an
   *  unknown email address, for example. */
  readonly entityId?: string | undefined;
  /** Null for records outside any project, such as user administration. */
  readonly projectId?: string | undefined;
  readonly before?: unknown;
  readonly after?: unknown;
  /**
   * REJECTED is written for refused actions — a denied approval, a blocked
   * edit. A refusal is exactly the kind of event an audit trail exists for.
   */
  readonly outcome?: AuditOutcome | undefined;
}
