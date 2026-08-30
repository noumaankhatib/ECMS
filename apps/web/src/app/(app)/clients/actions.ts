'use server';

import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Client, Contact } from '@/lib/types';

export async function createClient(_state: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(() =>
    api.post<Client>('/clients', {
      name: form.get('name'),
      reference: form.get('reference'),
      notes: form.get('notes'),
    }),
  );

  if (!result.ok) return result.state;

  await refresh('/clients');
  redirect(`/clients/${result.value.id}`);
}

export async function updateClient(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch<Client>(`/clients/${id}`, {
      name: await text(form, 'name'),
      reference: await nullableText(form, 'reference'),
      notes: await nullableText(form, 'notes'),
      // The version the form was rendered with. If somebody else has saved in
      // the meantime the API refuses, rather than quietly discarding their edit.
      version: Number(form.get('version')),
    });
  });

  if (result.error) return result;

  await refresh(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

/**
 * Archives a client.
 *
 * The API refuses while properties or projects still point at it, and says
 * which. That refusal is allowed to reach the person: "it did not work" with no
 * reason is the most frustrating thing an interface can say.
 */
export async function archiveClient(id: string): Promise<void> {
  await api.delete(`/clients/${id}`);
  await refresh('/clients');
  redirect('/clients');
}

export async function addContact(_state: FormState, form: FormData): Promise<FormState> {
  const clientId = String(form.get('clientId'));

  const result = await runAction(async () => {
    await api.post<Contact>(`/clients/${clientId}/contacts`, {
      name: await text(form, 'name'),
      position: await nullableText(form, 'position'),
      email: await nullableText(form, 'email'),
      phone: await nullableText(form, 'phone'),
      isPrimary: form.get('isPrimary') === 'on',
    });
  });

  if (result.error) return result;

  await refresh(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function archiveContact(id: string, clientId: string): Promise<void> {
  await api.delete(`/contacts/${id}`);
  await refresh(`/clients/${clientId}`);
}
