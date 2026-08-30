import type { FieldIssue } from './api';

/**
 * What a form knows after it has been submitted once.
 *
 * A refusal is a value, not an exception. Throwing would replace the page with
 * an error screen and lose everything the person had typed; this puts the
 * reason above the form and leaves the form intact.
 */
export interface FormState {
  readonly error?: string;
  readonly fields?: readonly FieldIssue[];
  /** Quoted by the person when asking for help, and searchable in the logs. */
  readonly requestId?: string;
}
