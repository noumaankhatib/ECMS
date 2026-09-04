'use server';

import type { IssueAction } from '@ecms/contracts';
import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Issue } from '@/lib/types';

export async function createIssue(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await attempt(async () =>
    api.post<Issue>(`/projects/${projectId}/issues`, {
      title: await text(form, 'title'),
      description: await nullableText(form, 'description'),
      observationId: form.get('observationId') || undefined,
      severity: form.get('severity'),
      priority: form.get('priority'),
      ownerId: form.get('ownerId') || undefined,
      dueDate: await nullableText(form, 'dueDate'),
    }),
  );

  if (!result.ok) return result.state;

  await refresh(`/projects/${projectId}/issues`);
  redirect(`/projects/${projectId}/issues/${result.value.id}`);
}

/** Everything but status — that moves only through `transitionIssue`. */
export async function updateIssue(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch(`/projects/${projectId}/issues/${id}`, {
      severity: form.get('severity'),
      priority: form.get('priority'),
      ownerId: form.get('ownerId') || null,
      dueDate: await nullableText(form, 'dueDate'),
      closureNotes: await nullableText(form, 'closureNotes'),
      version: Number(form.get('version')),
    });
  });

  if (!result.error) await refresh(`/projects/${projectId}/issues/${id}`);
  return result;
}

/** One function for all four named actions — start, resolve, close, reopen.
 *  The interface does not decide whether the move is legal; the API's own
 *  transition table does, the same shape ProjectsController uses. */
export async function transitionIssue(
  projectId: string,
  id: string,
  action: IssueAction,
  version: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/issues/${id}/${action}`, { version });
  await refresh(`/projects/${projectId}/issues/${id}`);
}
