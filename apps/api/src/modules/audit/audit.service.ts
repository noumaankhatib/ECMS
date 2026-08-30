import { Injectable } from '@nestjs/common';

import { currentRequestId, getRequestContext } from '../../shared/context/request-context';
import type { Tx } from '../../shared/database/transaction';

import type { AuditRecord } from './audit.types';

/**
 * Writes the append-only record of who did what (PRD §10).
 *
 * Deliberate design points:
 *
 *  - `record` takes a transaction handle, not the database client. The audit
 *    row is therefore written in the SAME transaction as the change it
 *    describes. If the change rolls back, so does its audit row; if the change
 *    commits, the audit row is already there. Neither can exist alone.
 *
 *  - There is no update or delete method. There is no code path to alter
 *    history, and the database would refuse it anyway — the application's
 *    account holds only INSERT and SELECT on this table.
 *
 *  - Actor and correlation id come from the request context rather than being
 *    passed in, so a caller cannot attribute an action to someone else.
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, entry: AuditRecord): Promise<void> {
    const context = getRequestContext();

    await tx.auditEntry.create({
      data: {
        requestId: currentRequestId(),
        actorUserId: context?.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        projectId: entry.projectId ?? null,
        before: entry.before === undefined ? undefined : JSON.parse(JSON.stringify(entry.before)),
        after: entry.after === undefined ? undefined : JSON.parse(JSON.stringify(entry.after)),
        outcome: entry.outcome ?? 'SUCCEEDED',
      },
    });
  }
}
