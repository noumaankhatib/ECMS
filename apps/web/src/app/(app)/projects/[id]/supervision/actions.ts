'use server';

import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, runAction } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { SiteVisit } from '@/lib/types';

export async function createSiteVisit(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await attempt(() =>
    api.post<SiteVisit>(`/projects/${projectId}/supervision/site-visits`, {
      visitDate: form.get('visitDate'),
      attendees: form.get('attendees') || undefined,
      notes: form.get('notes') || undefined,
    }),
  );

  if (!result.ok) return result.state;

  await refresh(`/projects/${projectId}/supervision`);
  redirect(`/projects/${projectId}/supervision/${result.value.id}`);
}

function agreementsPath(projectId: string): string {
  return `/projects/${projectId}/supervision/agreements`;
}

export async function createAgreement(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await runAction(async () => {
    await api.post(`${agreementsPath(projectId)}`, {
      type: form.get('type'),
      visitsAllowed: form.get('visitsAllowed'),
      amount: form.get('amount'),
      startDate: form.get('startDate'),
      endDate: form.get('endDate') || undefined,
      notes: await nullableText(form, 'notes'),
    });
  });

  if (!result.error) {
    await refresh(agreementsPath(projectId));
    await refresh(`/projects/${projectId}`);
  }
  return result;
}

export async function renewAgreement(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.post(`${agreementsPath(projectId)}/${id}/renew`, {
      version: Number(form.get('version')),
      amount: form.get('amount') || undefined,
      visitsAllowed: form.get('visitsAllowed') || undefined,
      startDate: form.get('startDate') || undefined,
      endDate: form.get('endDate') || undefined,
    });
  });

  if (!result.error) {
    await refresh(agreementsPath(projectId));
    await refresh(`/projects/${projectId}`);
  }
  return result;
}
