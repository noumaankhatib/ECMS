import type { CurrentUserResponse, Permission } from '@ecms/contracts';
import { grantsAllow } from '@ecms/contracts';
import { redirect } from 'next/navigation';

import { api, ApiError } from './api';

/**
 * Who is signed in, and what the interface should offer them.
 *
 * The grants are used to HIDE things. They are not a check. Every one of them
 * is enforced again by the API on the way in, which is the only reason it is
 * safe to make decisions from a value the browser could in principle influence
 * (PRD §8, §16).
 */
export interface Session {
  readonly user: CurrentUserResponse['user'];
  readonly grants: CurrentUserResponse['grants'];
  /** Projects this person belongs to. Empty when they hold everything globally. */
  readonly memberOf: readonly string[];
  can(permission: Permission, projectId?: string): boolean;
}

/** Returns the session, or null when nobody is signed in. */
export async function currentSession(): Promise<Session | null> {
  try {
    const me = await api.get<CurrentUserResponse>('/auth/me');
    const memberOf = await visibleProjectIds(me);

    return {
      user: me.user,
      grants: me.grants,
      memberOf,
      can(permission, projectId) {
        return grantsAllow(me.grants, permission, {
          ...(projectId === undefined ? {} : { projectId }),
          memberOf,
        });
      },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/**
 * The projects this person is on, so the interface can work out whether to
 * offer a project-scoped action.
 *
 * Read from the project list itself rather than from a dedicated endpoint. That
 * list is already scoped by the API to exactly what this person may see, so
 * asking again in a second way would be a second thing to keep correct.
 *
 * Skipped entirely for someone who holds nothing project-scoped: their answers
 * do not depend on it.
 */
async function visibleProjectIds(me: CurrentUserResponse): Promise<readonly string[]> {
  if (me.grants.project.length === 0) return [];

  try {
    const page = await api.get<{ items: { id: string }[] }>('/projects?pageSize=100');
    return page.items.map((p) => p.id);
  } catch {
    // A failure here must narrow what is offered, never widen it.
    return [];
  }
}

/** For pages that require a signed-in user. Sends them to sign in otherwise. */
export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect('/login');
  return session;
}

/**
 * For pages behind a permission.
 *
 * The redirect is a courtesy so nobody lands on a broken-looking screen. The
 * API refuses independently — this is not what protects the data.
 */
export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession();
  if (!session.can(permission)) redirect('/');
  return session;
}
