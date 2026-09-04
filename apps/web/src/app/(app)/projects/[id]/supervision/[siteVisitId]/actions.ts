'use server';

import { nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

function path(projectId: string, siteVisitId: string): string {
  return `/projects/${projectId}/supervision/site-visits/${siteVisitId}`;
}

export async function createObservation(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const siteVisitId = String(form.get('siteVisitId'));

  const result = await runAction(async () => {
    await api.post(`${path(projectId, siteVisitId)}/observations`, {
      description: await text(form, 'description'),
      category: await nullableText(form, 'category'),
    });
  });

  if (!result.error) await refresh(path(projectId, siteVisitId));
  return result;
}

export async function createInstruction(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const siteVisitId = String(form.get('siteVisitId'));

  const result = await runAction(async () => {
    await api.post(`${path(projectId, siteVisitId)}/instructions`, {
      directiveText: await text(form, 'directiveText'),
      assigneeId: form.get('assigneeId') || undefined,
      dueDate: await nullableText(form, 'dueDate'),
    });
  });

  if (!result.error) await refresh(path(projectId, siteVisitId));
  return result;
}

export async function markInstructionActioned(
  projectId: string,
  siteVisitId: string,
  id: string,
  version: number,
): Promise<void> {
  await api.patch(`${path(projectId, siteVisitId)}/instructions/${id}`, {
    actionedAt: new Date().toISOString(),
    version,
  });
  await refresh(path(projectId, siteVisitId));
}
