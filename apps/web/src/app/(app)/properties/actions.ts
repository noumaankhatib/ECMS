'use server';

import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Property } from '@/lib/types';

/** The address fields, which behave identically on create and edit. */
async function addressFrom(form: FormData) {
  return {
    name: await text(form, 'name'),
    reference: await nullableText(form, 'reference'),
    addressLine1: await nullableText(form, 'addressLine1'),
    addressLine2: await nullableText(form, 'addressLine2'),
    city: await nullableText(form, 'city'),
    postcode: await nullableText(form, 'postcode'),
    country: await nullableText(form, 'country'),
    notes: await nullableText(form, 'notes'),
    plotNumber: await nullableText(form, 'plotNumber'),
    wilayat: await nullableText(form, 'wilayat'),
    village: await nullableText(form, 'village'),
    surveyReference: await nullableText(form, 'surveyReference'),
    titleDeedReference: await nullableText(form, 'titleDeedReference'),
    ownerName: await nullableText(form, 'ownerName'),
    ownerNationalId: await nullableText(form, 'ownerNationalId'),
  };
}

export async function createProperty(_state: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () =>
    api.post<Property>('/properties', {
      clientId: form.get('clientId'),
      ...(await addressFrom(form)),
    }),
  );

  if (!result.ok) return result.state;

  await refresh('/properties');
  redirect(`/properties/${result.value.id}`);
}

export async function updateProperty(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch<Property>(`/properties/${id}`, {
      ...(await addressFrom(form)),
      version: Number(form.get('version')),
    });
  });

  if (result.error) return result;

  await refresh(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

export async function archiveProperty(id: string): Promise<void> {
  await api.delete(`/properties/${id}`);
  await refresh('/properties');
  redirect('/properties');
}
