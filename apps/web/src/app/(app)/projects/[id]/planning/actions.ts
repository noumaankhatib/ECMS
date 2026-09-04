'use server';

import type { SubmissionStatus } from '@ecms/contracts';

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
      notes: await nullableText(form, 'notes'),
    });
  });

  if (!result.error) await refresh(`/projects/${projectId}/planning`);
  return result;
}

/** One function for both legal moves — the API's own transition table decides
 *  which are actually offered (see SUBMISSION_TRANSITIONS in the page). */
export async function transitionSubmission(
  projectId: string,
  id: string,
  to: SubmissionStatus,
  version: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/planning/submissions/${id}/status`, { to, version });
  await refresh(`/projects/${projectId}/planning`);
}
