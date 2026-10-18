import { redirect } from 'next/navigation';

import { refresh } from './actions';
import { api } from './api';
import type { Proposal } from './types';

/**
 * When a client or property was created from a proposal's "Ready to convert"
 * card (`?forProposal=<id>`), attach it to that proposal and go back there —
 * instead of leaving the person on the new record to find their way back.
 * Attaching a property also attaches its client if the proposal had none.
 */
export async function returnToProposal(
  form: FormData,
  attach: { clientId: string; propertyId?: string },
): Promise<void> {
  const proposalId = String(form.get('forProposal') ?? '');
  if (!proposalId) return;

  const proposal = await api.get<Proposal>(`/proposals/${proposalId}`);
  await api.patch(`/proposals/${proposalId}`, {
    version: proposal.version,
    ...(attach.propertyId
      ? {
          propertyId: attach.propertyId,
          ...(proposal.clientId ? {} : { clientId: attach.clientId }),
        }
      : { clientId: attach.clientId }),
  });
  await refresh(`/proposals/${proposalId}`);
  redirect(`/proposals/${proposalId}`);
}
