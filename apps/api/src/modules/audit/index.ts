/**
 * Audit — the append-only record of who did what.
 *
 * Owns: AuditEntry.
 * Depends on: nothing. This is a leaf module.
 *
 * Entries are written inside the same transaction as the change they describe,
 * so a change can never exist without its audit row. The application database
 * role is granted INSERT and SELECT only — it is physically unable to edit or
 * delete history (PRD §10).
 */
export { AuditService } from './audit.service';
export { AuditModule } from './audit.module';
export type { AuditAction, AuditOutcome, AuditRecord } from './audit.types';
