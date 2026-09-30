'use server';

import type { DuplicateMatch } from '@ecms/contracts';
import { redirect } from 'next/navigation';

import { nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import { changed, checkThenSave } from '@/lib/duplicate-check';
import type { FormState } from '@/lib/form-state';
import type { Client, Contact } from '@/lib/types';

/** The client's own fields, identical on create and edit. */
async function clientFrom(form: FormData) {
  return {
    name: await text(form, 'name'),
    reference: await nullableText(form, 'reference'),
    notes: await nullableText(form, 'notes'),
    clientType: await nullableText(form, 'clientType'),
    crNumber: await nullableText(form, 'crNumber'),
    civilId: await nullableText(form, 'civilId'),
  };
}

export async function createClient(_state: FormState, form: FormData): Promise<FormState> {
  const fields = await clientFrom(form);

  const result = await checkThenSave(
    form,
    () =>
      api.post<DuplicateMatch[]>('/clients/duplicates', {
        name: fields.name,
        crNumber: fields.crNumber ?? undefined,
        civilId: fields.civilId ?? undefined,
      }),
    (duplicateOverride) =>
      api.post<Client>('/clients', {
        ...fields,
        ...(duplicateOverride ? { duplicateOverride } : {}),
      }),
  );

  if (!result.ok) return result.state;

  await refresh('/clients');
  redirect(`/clients/${result.value.id}`);
}

export async function updateClient(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));
  const fields = await clientFrom(form);

  // Only what this edit changes is checked — see `changed`.
  const name = changed(form, 'name');
  const crNumber = changed(form, 'crNumber');
  const civilId = changed(form, 'civilId');

  const result = await checkThenSave(
    form,
    async () =>
      name || crNumber || civilId
        ? api.post<DuplicateMatch[]>('/clients/duplicates', {
            ...(name ? { name } : {}),
            ...(crNumber ? { crNumber } : {}),
            ...(civilId ? { civilId } : {}),
            excludeId: id,
          })
        : [],
    (duplicateOverride) =>
      api.patch<Client>(`/clients/${id}`, {
        ...fields,
        ...(duplicateOverride ? { duplicateOverride } : {}),
        // The version the form was rendered with. If somebody else has saved in
        // the meantime the API refuses, rather than quietly discarding their edit.
        version: Number(form.get('version')),
      }),
  );

  if (!result.ok) return result.state;

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

export async function updateContact(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));
  const clientId = String(form.get('clientId'));

  const result = await runAction(async () => {
    await api.patch<Contact>(`/contacts/${id}`, {
      name: await text(form, 'name'),
      position: await nullableText(form, 'position'),
      email: await nullableText(form, 'email'),
      phone: await nullableText(form, 'phone'),
      isPrimary: form.get('isPrimary') === 'on',
      version: Number(form.get('version')),
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
