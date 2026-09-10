/**
 * Sequence — real, annual-reset numbering for records the client's own
 * registers already number (docs/phase-4-plan.md).
 *
 * Owns: SequenceCounter.
 * Depends on: nothing. This is a leaf module.
 */
export { SequenceModule } from './sequence.module';
export { SequenceService } from './sequence.service';
export { SEQUENCE_TYPES, type SequenceResult, type SequenceType } from './sequence.types';
