'use server';

import { nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

function path(projectId: string, submissionId: string): string {
  return `/projects/${projectId}/planning/submissions/${submissionId}`;
}

export async function createReview(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const submissionId = String(form.get('submissionId'));

  const result = await runAction(async () => {
    await api.post(`${path(projectId, submissionId)}/reviews`, {
      reviewDate: form.get('reviewDate'),
      reviewerName: await nullableText(form, 'reviewerName'),
      comments: await nullableText(form, 'comments'),
      responseDueAt: form.get('responseDueAt') || undefined,
    });
  });

  if (!result.error) await refresh(path(projectId, submissionId));
  return result;
}

/** A review's response — free text, so this runs through `ActionForm` like
 *  any other create form, not the bare `ActionButton` a plain flag flip
 *  would use. Identifiers travel as hidden inputs, the same way
 *  `convertProposal` reads `id`/`version`. */
export async function recordReviewResponse(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const submissionId = String(form.get('submissionId'));
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch(`${path(projectId, submissionId)}/reviews/${id}`, {
      responseText: await text(form, 'responseText'),
      respondedAt: new Date().toISOString(),
      version: Number(form.get('version')),
    });
  });

  if (!result.error) await refresh(path(projectId, submissionId));
  return result;
}

export async function createMeeting(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const submissionId = String(form.get('submissionId'));

  const result = await runAction(async () => {
    await api.post(`${path(projectId, submissionId)}/meetings`, {
      required: form.get('required') === 'on',
      meetingAt: form.get('meetingAt') || undefined,
      attendees: await nullableText(form, 'attendees'),
      purpose: await nullableText(form, 'purpose'),
    });
  });

  if (!result.error) await refresh(path(projectId, submissionId));
  return result;
}

/** A meeting's outcome — recorded once, the moment it has actually
 *  happened; `heldAt` is stamped here rather than asked for. */
export async function recordMeetingOutcome(_state: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get('projectId'));
  const submissionId = String(form.get('submissionId'));
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch(`${path(projectId, submissionId)}/meetings/${id}`, {
      outcome: await text(form, 'outcome'),
      heldAt: new Date().toISOString(),
      version: Number(form.get('version')),
    });
  });

  if (!result.error) await refresh(path(projectId, submissionId));
  return result;
}
