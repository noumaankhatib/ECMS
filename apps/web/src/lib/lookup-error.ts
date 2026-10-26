/**
 * What to tell someone when a search or suggestion lookup fails.
 *
 * These lookups run in the browser and used to turn every failure into an
 * empty list, so "No matches" could really mean "your session ended" or "the
 * server is down" — and the person went on to create a duplicate of a record
 * they simply could not see. `status` is the HTTP status, or null when the
 * request never got an answer.
 */
export function lookupFailure(status: number | null): string {
  switch (status) {
    case null:
      return 'Could not load results. Check your connection and try again.';
    case 401:
      return 'Your session has ended. Sign in again to keep searching.';
    case 403:
      return 'You do not have permission to search this.';
    case 429:
      return 'Too many searches in a short time. Wait a moment and try again.';
    default:
      return 'Search is not available right now. Try again in a moment.';
  }
}
