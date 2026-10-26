'use server';

import { refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

export async function createWilayat(_state: FormState, form: FormData): Promise<FormState> {
  const result = await runAction(async () => {
    await api.post('/wilayats', {
      name: await text(form, 'name'),
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });
  if (result.error) return result;

  await refresh('/wilayats');
  return {};
}

export async function updateWilayat(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));
  const result = await runAction(async () => {
    await api.patch(`/wilayats/${id}`, {
      name: await text(form, 'name'),
      sortOrder: Number(form.get('sortOrder') || 0),
    });
  });
  if (result.error) return result;

  await refresh('/wilayats');
  return {};
}

/** Retires an entry. Properties already placed in it keep what was written. */
export async function archiveWilayat(id: string): Promise<FormState> {
  return runAction(async () => {
    await api.delete(`/wilayats/${id}`);
    await refresh('/wilayats');
  });
}
