'use server';

import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Document } from '@/lib/types';

export async function createDocument(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to upload.' };
  }

  const body = new FormData();
  body.set('category', String(form.get('category') ?? ''));
  body.set('title', String(form.get('title') ?? ''));
  const description = await nullableText(form, 'description');
  if (description) body.set('description', description);
  body.set('file', file);

  const result = await attempt(() =>
    api.postForm<Document>(`/projects/${projectId}/documents`, body),
  );

  if (!result.ok) return result.state;

  await refresh(`/projects/${projectId}/documents`);
  redirect(`/projects/${projectId}/documents/${result.value.id}`);
}

/** Metadata only — there is no re-upload (docs/phase-3-plan.md §6). A new
 *  file is a new document, the same way a new drawing revision is a new
 *  row rather than an edit to the old one. */
export async function updateDocument(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch(`/projects/${projectId}/documents/${id}`, {
      category: await text(form, 'category'),
      title: await text(form, 'title'),
      description: await nullableText(form, 'description'),
      version: Number(form.get('version')),
    });
  });

  if (!result.error) await refresh(`/projects/${projectId}/documents/${id}`);
  return result;
}

export async function archiveDocument(projectId: string, id: string): Promise<void> {
  await api.delete(`/projects/${projectId}/documents/${id}`);
  await refresh(`/projects/${projectId}/documents`);
}
