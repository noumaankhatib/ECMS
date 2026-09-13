'use server';

import type { ProposalAction } from '@ecms/contracts';
import { redirect } from 'next/navigation';

import { attempt, nullableText, refresh, runAction, text } from '@/lib/actions';
import { api } from '@/lib/api';
import type { FormState } from '@/lib/form-state';
import type { Proposal } from '@/lib/types';

/** The action's name is not always its route — `apps/api`'s controller names
 *  each transition route by kebab-casing the action, which is not mechanical
 *  for every one of them (`sendForClientReview` → `send-for-client-review`). */
const ROUTE_FOR_ACTION: Record<ProposalAction, string> = {
  startConcept: 'start-concept',
  sendForClientReview: 'send-for-client-review',
  approve: 'approve',
  win: 'win',
  lose: 'lose',
  hold: 'hold',
  resume: 'resume',
};

export async function createProposal(_state: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(() =>
    api.post<Proposal>('/proposals', {
      contactName: form.get('contactName'),
      contactPhone: form.get('contactPhone'),
      clientId: form.get('clientId') || null,
      propertyId: form.get('propertyId') || null,
      sketchTypeId: form.get('sketchTypeId') || null,
      projectType: form.get('projectType') || null,
      approxAreaSqm: form.get('approxAreaSqm') || null,
      source: form.get('source'),
      assignedArchitectId: form.get('assignedArchitectId') || null,
      receivedAt: form.get('receivedAt'),
      dueAt: form.get('dueAt'),
      notes: form.get('notes'),
    }),
  );

  if (!result.ok) return result.state;

  await refresh('/proposals');
  redirect(`/proposals/${result.value.id}`);
}

export async function updateProposal(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.patch<Proposal>(`/proposals/${id}`, {
      contactName: await text(form, 'contactName'),
      contactPhone: await nullableText(form, 'contactPhone'),
      clientId: await nullableText(form, 'clientId'),
      propertyId: await nullableText(form, 'propertyId'),
      sketchTypeId: await nullableText(form, 'sketchTypeId'),
      projectType: await nullableText(form, 'projectType'),
      approxAreaSqm: await nullableText(form, 'approxAreaSqm'),
      source: await nullableText(form, 'source'),
      assignedArchitectId: await nullableText(form, 'assignedArchitectId'),
      receivedAt: await nullableText(form, 'receivedAt'),
      dueAt: await nullableText(form, 'dueAt'),
      notes: await nullableText(form, 'notes'),
      version: Number(form.get('version')),
    });
  });

  if (result.error) return result;

  await refresh(`/proposals/${id}`);
  redirect(`/proposals/${id}`);
}

/**
 * Moves a proposal to a new status.
 *
 * One function for all seven named actions. Which one is OFFERED comes from
 * PROPOSAL_TRANSITIONS in shared contracts, the same table the API checks —
 * the interface cannot drift into offering a move the server would refuse.
 * `WON → CONVERTED` is deliberately not reachable this way; see `convertProposal`.
 */
export async function transitionProposal(
  id: string,
  action: ProposalAction,
  version: number,
): Promise<void> {
  await api.post(`/proposals/${id}/${ROUTE_FOR_ACTION[action]}`, { version });
  await refresh(`/proposals/${id}`);
}

/**
 * The one path from `WON` to `CONVERTED`. Unlike an ordinary transition this
 * can be refused for a reason worth showing — no property attached — so it
 * runs through `runAction`/`FormState` rather than a bare `ActionButton`,
 * the same way a create or edit form surfaces a refusal above itself instead
 * of losing it to an error page.
 */
export async function convertProposal(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));

  const result = await runAction(async () => {
    await api.post(`/proposals/${id}/convert`, { version: Number(form.get('version')) });
  });

  if (result.error) return result;

  await refresh(`/proposals/${id}`);
  redirect(`/proposals/${id}`);
}
