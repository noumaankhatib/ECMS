'use server';

import { redirect } from 'next/navigation';

import { attempt, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { UserRow } from '@/lib/types';

export async function createUser(_state: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () =>
    api.post<UserRow>('/users', {
      email: form.get('email'),
      displayName: await text(form, 'displayName'),
      password: form.get('password'),
      roleCode: form.get('roleCode'),
    }),
  );

  if (!result.ok) return result.state;

  await refresh('/users');
  redirect(`/users/${result.value.id}`);
}

export async function updateUser(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch<UserRow>(`/users/${id}`, { displayName: await text(form, 'displayName') });
  });

  if (result.error) return result;

  await refresh(`/users/${id}`);
  redirect(`/users/${id}`);
}

/**
 * Setting somebody's password is its own form, not a field on the edit form.
 *
 * It ends every session they hold, which is not something that should be able
 * to happen as a side effect of correcting the spelling of a name.
 */
export async function setPassword(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.post(`/users/${id}/password`, { password: form.get('password') });
  });

  if (result.error) return result;

  await refresh(`/users/${id}`);
  redirect(`/users/${id}`);
}

export async function setStatus(id: string, status: 'ACTIVE' | 'DISABLED'): Promise<void> {
  await api.patch(`/users/${id}`, { status });
  await refresh(`/users/${id}`);
}

export async function assignRole(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.post(`/users/${id}/roles`, { roleCode: form.get('roleCode') });
  });

  if (result.error) return result;

  await refresh(`/users/${id}`);
  redirect(`/users/${id}`);
}

export async function removeRole(id: string, roleCode: string): Promise<void> {
  await api.delete(`/users/${id}/roles/${roleCode}`);
  await refresh(`/users/${id}`);
}
