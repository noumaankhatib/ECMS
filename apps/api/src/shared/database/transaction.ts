import type { Prisma } from '@prisma/client';

/**
 * A handle to work inside an open transaction.
 *
 * Operations that must be transactional take this type rather than the plain
 * client. That makes the requirement part of the signature: you cannot
 * accidentally write an audit row outside the transaction of the change it
 * describes, because there is no way to call it without a transaction handle.
 */
export type Tx = Prisma.TransactionClient;
