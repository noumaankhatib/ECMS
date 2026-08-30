'use server';

import type { ProjectAction } from '@ecms/contracts';
import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Project } from '@/lib/types';

export async function createProject(_state: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () =>
    api.post<Project>('/projects', {
      clientId: form.get('clientId'),
      propertyId: form.get('propertyId'),
      code: await text(form, 'code'),
      name: await text(form, 'name'),
      description: await nullableText(form, 'description'),
      type: form.get('type'),
      startDate: await nullableText(form, 'startDate'),
      targetEndDate: await nullableText(form, 'targetEndDate'),
    }),
  );

  if (!result.ok) return result.state;

  await refresh('/projects');
  redirect(`/projects/${result.value.id}`);
}

export async function updateProject(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    // Status is absent, deliberately. It is not a field anybody may write — it
    // moves only through a named transition the API validates.
    await api.patch<Project>(`/projects/${id}`, {
      code: await text(form, 'code'),
      name: await text(form, 'name'),
      description: await nullableText(form, 'description'),
      type: form.get('type'),
      startDate: await nullableText(form, 'startDate'),
      targetEndDate: await nullableText(form, 'targetEndDate'),
      version: Number(form.get('version')),
    });
  });

  if (result.error) return result;

  await refresh(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

/**
 * Moves a project to a new status.
 *
 * One function for all four named actions. The interface does not decide
 * whether the move is legal — it asks, and the API consults the transition
 * table. Anything the API refuses reaches the person as a refusal rather than
 * being pre-empted by a guess made here.
 */
export async function transitionProject(
  id: string,
  action: ProjectAction,
  version: number,
): Promise<void> {
  await api.post(`/projects/${id}/${action}`, { version });
  await refresh(`/projects/${id}`);
}

export async function addMember(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/members`, {
      userId: form.get('userId'),
      roleCode: form.get('roleCode'),
    });
  });

  if (result.error) return result;

  await refresh(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/members/${userId}`);
  await refresh(`/projects/${projectId}`);
}

export async function transitionWorkstream(
  projectId: string,
  id: string,
  to: string,
  version: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/workstreams/${id}/status`, { to, version });
  await refresh(`/projects/${projectId}`);
}
