'use server';

import type { AdminDeleteItem, ImpactTree } from '@ecms/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { api } from '@/lib/api';
import { attempt } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

export async function fetchImpactTree(type: string, id: string): Promise<ImpactTree> {
  return api.get<ImpactTree>(`/admin/impact/${type}/${id}`);
}

export async function archiveItems(items: AdminDeleteItem[]): Promise<FormState> {
  const result = await attempt(() =>
    api.post('/admin/archive', { items }),
  );
  if (!result.ok) return result.state;
  revalidatePath('/admin/data', 'layout');
  return {};
}

export async function hardDeleteItems(
  items: AdminDeleteItem[],
  confirmName: string,
): Promise<FormState> {
  const result = await attempt(() =>
    api.post('/admin/hard-delete', { items, confirmName }),
  );
  if (!result.ok) return result.state;
  revalidatePath('/admin/data', 'layout');
  redirect('/admin/data');
}
