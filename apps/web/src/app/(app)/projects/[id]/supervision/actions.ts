'use server';

import { redirect } from 'next/navigation';

import { attempt, refresh } from '@/lib/actions';
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
