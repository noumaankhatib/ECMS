'use server';

import type { DrawingRevisionAction } from '@ecms/contracts';

import { nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

export async function createRevision(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const drawingId = String(form.get('drawingId'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/drawings/${drawingId}/revisions`, {
      revisionCode: await text(form, 'revisionCode'),
      fileId: await nullableText(form, 'fileId'),
      notes: await nullableText(form, 'notes'),
    });
  });

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
