'use server';

import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Project } from '@/lib/types';

/**
 * The client's "add supervision to an existing planning project" flow —
 * upgrades that project to BOTH in place, same code, same row. Bound with
 * the project's id and version from the search results row that called it.
 */
export async function upgradeExistingProject(projectId: string, version: number): Promise<void> {
  await api.post<Project>(`/projects/${projectId}/upgrade-to-supervision`, { version });
  await refresh('/supervision');
  redirect(`/projects/${projectId}/supervision`);
}

/**
 * The "this planning work predates the system" branch — an ordinary new
 * SUPERVISION project, plus a plain-text note of whatever code the person
 * typed. Not a link: nothing in the system resolves it against a real row.
 */
export async function createNewSupervisionProject(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await attempt(async () =>
    api.post<Project>('/projects', {
      clientId: form.get('clientId'),
      propertyId: form.get('propertyId'),
      code: await text(form, 'code'),
      name: await text(form, 'name'),
      description: await nullableText(form, 'description'),
      type: 'SUPERVISION',
      startDate: await nullableText(form, 'startDate'),
      targetEndDate: await nullableText(form, 'targetEndDate'),
      externalPlanningReference: await nullableText(form, 'externalPlanningReference'),
    }),
  );

  if (!result.ok) return result.state;

  await refresh('/supervision');
  redirect(`/projects/${result.value.id}/supervision`);
}
