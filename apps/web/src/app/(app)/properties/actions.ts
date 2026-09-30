'use server';

import type { DuplicateMatch } from '@ecms/contracts';
import { redirect } from 'next/navigation';

import { nullableText, refresh, text } from '@/lib/actions';
import { api } from '@/lib/api';
import { changed, checkThenSave } from '@/lib/duplicate-check';
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
  const clientId = String(form.get('clientId') ?? '');
  const fields = await addressFrom(form);

  const result = await checkThenSave(
    form,
    () =>
      api.post<DuplicateMatch[]>('/properties/duplicates', {
        ...(clientId ? { clientId } : {}),
        ...(fields.name ? { name: fields.name } : {}),
        ...(fields.plotNumber ? { plotNumber: fields.plotNumber } : {}),
        ...(fields.wilayat ? { wilayat: fields.wilayat } : {}),
        ...(fields.surveyReference ? { surveyReference: fields.surveyReference } : {}),
      }),
    (duplicateOverride) =>
      api.post<Property>('/properties', {
        clientId,
        ...fields,
        ...(duplicateOverride ? { duplicateOverride } : {}),
      }),
  );

  if (!result.ok) return result.state;

  await refresh('/properties');
  redirect(`/properties/${result.value.id}`);
}

export async function updateProperty(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));
  const fields = await addressFrom(form);

  // A plot's identity is its number AND wilayat, so a change to either is
  // checked against the pair it will have afterwards.
  const plotChanged = changed(form, 'plotNumber') ?? changed(form, 'wilayat');
  const name = changed(form, 'name');
  const surveyReference = changed(form, 'surveyReference');

  const result = await checkThenSave(
    form,
    async () =>
      plotChanged || name || surveyReference
        ? api.post<DuplicateMatch[]>('/properties/duplicates', {
            excludeId: id,
            ...(name ? { name, clientId: String(form.get('checkClientId')) } : {}),
            ...(plotChanged && fields.plotNumber && fields.wilayat
              ? { plotNumber: fields.plotNumber, wilayat: fields.wilayat }
              : {}),
            ...(surveyReference ? { surveyReference } : {}),
          })
        : [],
    (duplicateOverride) =>
      api.patch<Property>(`/properties/${id}`, {
        ...fields,
        ...(duplicateOverride ? { duplicateOverride } : {}),
        version: Number(form.get('version')),
      }),
  );

  if (!result.ok) return result.state;

  await refresh(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

export async function archiveProperty(id: string): Promise<void> {
  await api.delete(`/properties/${id}`);
  await refresh('/properties');
  redirect('/properties');
}
