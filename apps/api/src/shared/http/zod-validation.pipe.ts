import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { appError, type FieldIssue } from '../errors/app-error';

/**
 * Validates a request body against a schema and REPLACES it with the parsed
 * result.
 *
 * The replacement is the important part: everything downstream then sees
 * trimmed, lower-cased, correctly typed values, and normalisation lives in the
 * schema rather than being repeated in each handler.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // Named after where it actually came from. Reporting a rejected query
      // string as "(body)" once sent a diagnosis off in entirely the wrong
      // direction.
      const location = `(${metadata.type})`;
      const fields: FieldIssue[] = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || location,
        reason: issue.message,
      }));
      // Field names and reasons are safe to return. The submitted values are
      // not, and are never echoed back.
      throw appError('VALIDATION_FAILED', { fields });
    }

    return result.data;
  }
}
