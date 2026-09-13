'use server';

import type { SubmissionAction } from '@ecms/contracts';

import { nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

export async function createActivity(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/planning/activities`, {
      name: await text(form, 'name'),
      description: await nullableText(form, 'description'),
      assigneeId: form.get('assigneeId') || undefined,
      dueDate: await nullableText(form, 'dueDate'),
    });
  });

  if (!result.error) await refresh(`/projects/${projectId}/planning`);
  return result;
}

export async function setActivityDone(
  projectId: string,
  id: string,
  done: boolean,
  version: number,
): Promise<void> {
  await api.patch(`/projects/${projectId}/planning/activities/${id}`, { done, version });
  await refresh(`/projects/${projectId}/planning`);
}

export async function archiveActivity(projectId: string, id: string): Promise<void> {
  await api.delete(`/projects/${projectId}/planning/activities/${id}`);
  await refresh(`/projects/${projectId}/planning`);
}

export async function createMilestone(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/planning/milestones`, {
      name: await text(form, 'milestoneName'),
      targetDate: await nullableText(form, 'targetDate'),
    });
  });

  if (!result.error) await refresh(`/projects/${projectId}/planning`);
  return result;
}

/** Reaching a milestone is recorded by setting achievedDate — not a status. */
export async function markMilestoneReached(
  projectId: string,
  id: string,
  version: number,
): Promise<void> {
  await api.patch(`/projects/${projectId}/planning/milestones/${id}`, {
    achievedDate: new Date().toISOString(),
    version,
  });
  await refresh(`/projects/${projectId}/planning`);
}

export async function archiveMilestone(projectId: string, id: string): Promise<void> {
  await api.delete(`/projects/${projectId}/planning/milestones/${id}`);
  await refresh(`/projects/${projectId}/planning`);
}

export async function createSubmission(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/planning/submissions`, {
      reference: await text(form, 'reference'),
      authorityName: await text(form, 'authorityName'),
      department: form.get('department') || undefined,
      pendingWith: await nullableText(form, 'pendingWith'),
      notes: await nullableText(form, 'notes'),
    });
  });

  if (!result.error) await refresh(`/projects/${projectId}/planning`);
  return result;
}

/** One route per named action (phase-1-plan.md §5a); `returnForRevision` is
 *  the one whose URL segment isn't just its own name in kebab-case. `resume`
 *  is not here — see `resumeSubmission` below, docs/phase-6-plan.md §4. */
const ACTION_PATHS: Record<SubmissionAction, string> = {
  submit: 'submit',
  review: 'review',
  approve: 'approve',
  reject: 'reject',
  returnForRevision: 'return-for-revision',
  withdraw: 'withdraw',
  halt: 'halt',
  cancel: 'cancel',
};

function submissionPath(projectId: string, id: string): string {
  return `/projects/${projectId}/planning/submissions/${id}`;
}

/** One function for every named action — the API's own transition table
 *  decides which are actually offered, and `approve`'s own permission
 *  decides who may call it at all. */
export async function transitionSubmission(
  projectId: string,
  id: string,
  action: SubmissionAction,
  version: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/planning/submissions/${id}/${ACTION_PATHS[action]}`, {
    version,
  });
  await refresh(`/projects/${projectId}/planning`);
  await refresh(submissionPath(projectId, id));
}

/**
 * `approve` alone (docs/phase-6-plan.md §4) also carries the permit
 * reference, and its refusal ("A permit reference is required...") is worth
 * reading — so this runs through `ActionForm`/`runAction`, not the bare
 * `ActionButton` every other transition above uses, the same exception
 * Phase 5's convert action already made.
 */
export async function approveSubmission(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/planning/submissions/${id}/approve`, {
      version: Number(form.get('version')),
      permitReference: await text(form, 'permitReference'),
    });
  });

  if (!result.error) {
    await refresh(`/projects/${projectId}/planning`);
    await refresh(submissionPath(projectId, id));
  }
  return result;
}

/**
 * Not a named action in `SUBMISSION_ACTIONS` — its target depends on which
 * status the submission was halted from, which the API alone tracks
 * (`preHaltStatus`). The caller supplies nothing beyond `version`.
 */
export async function resumeSubmission(
  projectId: string,
  id: string,
  version: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/planning/submissions/${id}/resume`, { version });
  await refresh(`/projects/${projectId}/planning`);
  await refresh(submissionPath(projectId, id));
}

export async function requestClarification(
  projectId: string,
  id: string,
  version: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/planning/submissions/${id}/request-clarification`, {
    version,
  });
  await refresh(submissionPath(projectId, id));
}

export async function respondClarification(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.post(`/projects/${projectId}/planning/submissions/${id}/respond-clarification`, {
      version: Number(form.get('version')),
      response: await text(form, 'response'),
    });
  });

  if (!result.error) await refresh(submissionPath(projectId, id));
  return result;
}
