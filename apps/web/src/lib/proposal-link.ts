import { redirect } from 'next/navigation';

import { refresh } from './actions';
import { api } from './api';
import type { Property, Proposal } from './types';

/**
 * When a client or property was created from a proposal's "Ready to convert"
 * card (`?forProposal=<id>`), attach it to that proposal and go back there —
 * instead of leaving the person on the new record to find their way back.
 * Attaching a property also attaches its client if the proposal had none, and
 * fills any survey/deed/area the proposal left blank from the property (never
 * overwriting a value the proposal already has).
 */
export async function returnToProposal(
  form: FormData,
  attach: { clientId: string; propertyId?: string; property?: Property },
): Promise<void> {
  const proposalId = String(form.get('forProposal') ?? '');
  if (!proposalId) return;

  const proposal = await api.get<Proposal>(`/proposals/${proposalId}`);
  const p = attach.property;
  await api.patch(`/proposals/${proposalId}`, {
    version: proposal.version,
    ...(attach.propertyId
      ? {
          propertyId: attach.propertyId,
          ...(proposal.clientId ? {} : { clientId: attach.clientId }),
          ...(!proposal.surveyReference && p?.surveyReference
            ? { surveyReference: p.surveyReference }
            : {}),
          ...(!proposal.titleDeedReference && p?.titleDeedReference
            ? { titleDeedReference: p.titleDeedReference }
            : {}),
          ...(!proposal.approxAreaSqm && p?.plotArea ? { approxAreaSqm: p.plotArea } : {}),
        }
      : { clientId: attach.clientId }),
  });
  await refresh(`/proposals/${proposalId}`);
  redirect(`/proposals/${proposalId}`);
}
