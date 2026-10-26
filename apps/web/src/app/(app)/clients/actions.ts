'use server';

import { formatClientName, type DuplicateMatch } from '@ecms/contracts';
import { redirect } from 'next/navigation';

import { nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import { changed, checkThenSave } from '@/lib/duplicate-check';
import type { FormState } from '@/lib/form-state';
import { returnToProposal } from '@/lib/proposal-link';
import type { Client, Contact } from '@/lib/types';

/** The client's own fields, identical on create and edit. */
async function clientFrom(form: FormData) {
  return {
    firstName: await text(form, 'firstName'),
    fatherName: await nullableText(form, 'fatherName'),
    grandfatherName: await nullableText(form, 'grandfatherName'),
    surname: await nullableText(form, 'surname'),
    reference: await nullableText(form, 'reference'),
    notes: await nullableText(form, 'notes'),
    clientType: await nullableText(form, 'clientType'),
    crNumber: await nullableText(form, 'crNumber'),
    civilId: await nullableText(form, 'civilId'),
    mobileNumber: await nullableText(form, 'mobileNumber'),
  };
}

export async function createClient(_state: FormState, form: FormData): Promise<FormState> {
  const fields = await clientFrom(form);

  const result = await checkThenSave(
    form,
    () =>
      api.post<DuplicateMatch[]>('/clients/duplicates', {
        name: formatClientName(fields),
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
  const backToProposal = await returnToProposal(form, { clientId: result.value.id });
  if (backToProposal) return backToProposal;
  redirect(`/clients/${result.value.id}`);
}

export async function updateClient(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));
  const fields = await clientFrom(form);

  // Only what this edit changes is checked — see `changed`. Any of the 4
  // name parts changing is treated as the name changing.
  const nameChanged =
    changed(form, 'firstName') ??
    changed(form, 'fatherName') ??
    changed(form, 'grandfatherName') ??
    changed(form, 'surname');
  const crNumber = changed(form, 'crNumber');
  const civilId = changed(form, 'civilId');

  const result = await checkThenSave(
    form,
    async () =>
      nameChanged || crNumber || civilId
        ? api.post<DuplicateMatch[]>('/clients/duplicates', {
            ...(nameChanged ? { name: formatClientName(fields) } : {}),
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
export async function archiveClient(id: string): Promise<FormState> {
  return runAction(async () => {
    await api.delete(`/clients/${id}`);
    await refresh('/clients');
    redirect('/clients');
  });
}

export async function addContact(_state: FormState, form: FormData): Promise<FormState> {
  const clientId = String(form.get('clientId'));

  const result = await runAction(async () => {
    await api.post<Contact>(`/clients/${clientId}/contacts`, {
      name: await text(form, 'name'),
      position: await nullableText(form, 'position'),
      designation: await nullableText(form, 'designation'),
      placeOfWork: await nullableText(form, 'placeOfWork'),
      idNumber: await nullableText(form, 'idNumber'),
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
      designation: await nullableText(form, 'designation'),
      placeOfWork: await nullableText(form, 'placeOfWork'),
      idNumber: await nullableText(form, 'idNumber'),
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

export async function archiveContact(id: string, clientId: string): Promise<FormState> {
  return runAction(async () => {
    await api.delete(`/contacts/${id}`);
    await refresh(`/clients/${clientId}`);
  });
}
