'use server';

import type { DrawingRevisionAction } from '@ecms/contracts';

import { nullableText, refresh, runAction } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

export async function createRevision(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const drawingId = String(form.get('drawingId'));

  const body = new FormData();
  body.set('revisionCode', String(form.get('revisionCode') ?? ''));
  const notes = await nullableText(form, 'notes');
  if (notes) body.set('notes', notes);

  // Optional — a revision may be registered before the scanned file is
  // ready, the same as before this form could upload one at all.
  const file = form.get('file');
  if (file instanceof File && file.size > 0) body.set('file', file);

  const result = await runAction(() =>
    api.postForm(`/projects/${projectId}/drawings/${drawingId}/revisions`, body),
  );

  if (!result.error) await refresh(`/projects/${projectId}/drawings/${drawingId}`);
  return result;
}

/** One route per named action (phase-1-plan.md §5a); `returnForRevision` is
 *  the one whose URL segment isn't just its own name in kebab-case — the
 *  same map `planning/actions.ts` already keeps for `Submission`. */
const ACTION_PATHS: Record<DrawingRevisionAction, string> = {
  submit: 'submit',
  review: 'review',
  approve: 'approve',
  reject: 'reject',
  returnForRevision: 'return-for-revision',
};

export async function transitionRevision(
  projectId: string,
  drawingId: string,
  id: string,
  action: DrawingRevisionAction,
  version: number,
): Promise<void> {
  await api.post(
    `/projects/${projectId}/drawings/${drawingId}/revisions/${id}/${ACTION_PATHS[action]}`,
    { version },
  );
  await refresh(`/projects/${projectId}/drawings/${drawingId}`);
}
