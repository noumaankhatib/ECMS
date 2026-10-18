'use server';

import { refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { PlanningTemplateItem } from '@/lib/types';

export async function createTemplateItem(_state: FormState, form: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    await api.post<PlanningTemplateItem>('/planning-templates', {
      kind: await text(form, 'kind'),
      name: await text(form, 'name'),
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });
  if (result.error) return result;

  await refresh('/planning-templates');
  return {};
}

export async function updateTemplateItem(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));
  const result = await runAction(async () => {
    await api.patch<PlanningTemplateItem>(`/planning-templates/${id}`, {
      name: await text(form, 'name'),
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });
  if (result.error) return result;

  await refresh('/planning-templates');
  return {};
}

/** Retires an entry. Projects that already used it are unaffected. */
export async function archiveTemplateItem(id: string): Promise<void> {
  await api.delete(`/planning-templates/${id}`);
  await refresh('/planning-templates');
}
