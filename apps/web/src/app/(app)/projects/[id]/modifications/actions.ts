'use server';

import type { ModificationAction } from '@ecms/contracts';

import { nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

export async function createModification(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/modifications`, {
      requestText: await text(form, 'requestText'),
      impactArea: await text(form, 'impactArea'),
      costImpact: await nullableText(form, 'costImpact'),
      timeImpact: await nullableText(form, 'timeImpact'),
      drawingRevisionId: await nullableText(form, 'drawingRevisionId'),
      observationId: await nullableText(form, 'observationId'),
    });
  });

  if (!result.error) await refresh(`/projects/${projectId}/modifications`);
  return result;
}

/** One route per named action (phase-1-plan.md §5a); `returnForRevision` is
 *  the one whose URL segment isn't just its own name in kebab-case — the
 *  same map `drawings/[drawingId]/actions.ts` already keeps. */
const ACTION_PATHS: Record<ModificationAction, string> = {
  submit: 'submit',
  review: 'review',
  approve: 'approve',
  reject: 'reject',
  returnForRevision: 'return-for-revision',
};

export async function transitionModification(
  projectId: string,
  id: string,
  action: ModificationAction,
  version: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/modifications/${id}/${ACTION_PATHS[action]}`, {
    version,
  });
  await refresh(`/projects/${projectId}/modifications`);
}
