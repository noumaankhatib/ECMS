'use server';

import { refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { RequiredDocument } from '@/lib/types';

export async function createRequiredDocument(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await runAction(async () => {
    await api.post<RequiredDocument>('/required-documents', {
      category: await text(form, 'category'),
      label: await text(form, 'label'),
      scope: (await text(form, 'scope')) ?? 'ANY',
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });

  if (result.error) return result;

  await refresh('/required-documents');
  return {};
}

export async function updateRequiredDocument(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch<RequiredDocument>(`/required-documents/${id}`, {
      label: await text(form, 'label'),
      scope: await text(form, 'scope'),
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });

  if (result.error) return result;

  await refresh('/required-documents');
  return {};
}

/** Retires an entry. The API never hard-deletes — a project's completeness
 *  history must keep meaning what it meant at the time (docs/phase-9-plan.md). */
export async function archiveRequiredDocument(id: string): Promise<void> {
  await api.delete(`/required-documents/${id}`);
  await refresh('/required-documents');
}
