'use server';

import { refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { ProposalSketchType } from '@/lib/types';

export async function createSketchType(_state: FormState, form: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    await api.post<ProposalSketchType>('/proposal-sketch-types', {
      code: await text(form, 'code'),
      label: await text(form, 'label'),
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });

  if (result.error) return result;

  await refresh('/sketch-types');
  return {};
}

export async function updateSketchType(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch<ProposalSketchType>(`/proposal-sketch-types/${id}`, {
      label: await text(form, 'label'),
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });

  if (result.error) return result;

  await refresh('/sketch-types');
  return {};
}

/** Retires an entry. The API never hard-deletes — a proposal already using
 *  it must keep displaying it (docs/phase-5-plan.md §9). */
export async function archiveSketchType(id: string): Promise<void> {
  await api.delete(`/proposal-sketch-types/${id}`);
  await refresh('/sketch-types');
}
