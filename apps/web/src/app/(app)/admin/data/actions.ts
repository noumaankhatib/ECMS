'use server';

import type { AdminDeleteItem, ImpactTree } from '@ecms/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { attempt } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

export async function fetchImpactTree(type: string, id: string): Promise<ImpactTree> {
  return api.get<ImpactTree>(`/admin/impact/${type}/${id}`);
}

export async function archiveItems(items: AdminDeleteItem[]): Promise<FormState> {
  const result = await attempt(() => api.post('/admin/archive', { items }));
  if (!result.ok) return result.state;
  revalidatePath('/admin/data', 'layout');
  return {};
}

export async function hardDeleteItems(
  items: AdminDeleteItem[],
  confirmName: string,
  root: AdminDeleteItem,
): Promise<FormState> {
  const result = await attempt(() => api.post('/admin/hard-delete', { items, confirmName, root }));
  if (!result.ok) {
    // There is no form to highlight here, so say what was actually wrong.
    const reason = result.state.fields?.[0]?.reason;
    return reason ? { ...result.state, error: reason } : result.state;
  }
  revalidatePath('/admin/data', 'layout');
  redirect('/admin/data');
}
