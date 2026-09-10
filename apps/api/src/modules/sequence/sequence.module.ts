import { Module } from '@nestjs/common';

import { SequenceService } from './sequence.service';

/**
 * A leaf module: no dependency on anything else, the same posture Audit
 * takes. Not global — only modules that mint their own numbers (Projects
 * now; Proposals in Phase 5) import it explicitly.
 */
@Module({ providers: [SequenceService], exports: [SequenceService] })
export class SequenceModule {}
