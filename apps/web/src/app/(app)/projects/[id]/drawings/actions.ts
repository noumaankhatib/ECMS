'use server';

import { redirect } from 'next/navigation';

import { attempt, refresh, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Drawing } from '@/lib/types';

export async function createDrawing(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await attempt(async () =>
    api.post<Drawing>(`/projects/${projectId}/drawings`, {
      number: await text(form, 'number'),
      title: await text(form, 'title'),
    }),
  );

  if (!result.ok) return result.state;

  await refresh(`/projects/${projectId}/drawings`);
  redirect(`/projects/${projectId}/drawings/${result.value.id}`);
}
