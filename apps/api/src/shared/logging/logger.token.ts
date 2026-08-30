/**
 * Injection token for the application logger.
 *
 * Lives here rather than in app.module so that middleware and services can
 * depend on the logger without importing the root module — which would be a
 * cycle, and the lint rules would reject it.
 */
export const LOGGER = Symbol('LOGGER');
