import { PROPOSAL_TRANSITIONS, type ProposalAction, type ProposalStatus } from '@ecms/contracts';
import Link from 'next/link';

import { ActionButton, ActionForm } from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  CodeTag,
  DateText,
  PageHead,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Client, Project, Property, Proposal, ProposalSketchType, UserRow } from '@/lib/types';

import { convertProposal, transitionProposal } from '../actions';

export const metadata = { title: 'Proposal — ECMS' };

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONCEPT: 'Concept',
  CLIENT_REVISION: 'Client revision',
  APPROVED: 'Approved',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
  CONVERTED: 'Converted',
};

/**
 * The named actions on offer, and which status each one reaches. Which of
 * them is OFFERED comes from PROPOSAL_TRANSITIONS in shared contracts — the
 * same table the API checks — so the interface cannot drift into showing a
 * move the server would refuse.
 *
 * `startConcept` is the one route two different real moves share
 * (`NEW → CONCEPT` and, just as legally, `ON_HOLD → CONCEPT` — the API
 * checks only the resulting status, not which named action was used to get
 * there) so its label reads "Resume" when the proposal is on hold.
 */
const ACTIONS: {
  action: ProposalAction;
  to: ProposalStatus;
  label: (from: ProposalStatus) => string;
  confirm?: string;
}[] = [
  {
    action: 'startConcept',
    to: 'CONCEPT',
    label: (from) => (from === 'ON_HOLD' ? 'Resume' : 'Move to concept'),
  },
  { action: 'sendForClientReview', to: 'CLIENT_REVISION', label: () => 'Send for client review' },
  { action: 'approve', to: 'APPROVED', label: () => 'Approve' },
  { action: 'win', to: 'WON', label: () => 'Mark won' },
  {
    action: 'lose',
    to: 'LOST',
    label: () => 'Mark lost',
    confirm: 'Mark this proposal lost? This cannot be undone.',
  },
  { action: 'hold', to: 'ON_HOLD', label: () => 'Put on hold' },
];

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const proposal = await api.get<Proposal>(`/proposals/${id}`);

  const [client, property, sketchType, architect, convertedProject] = await Promise.all([
    proposal.clientId && session.can('client:view')
      ? api.get<Client>(`/clients/${proposal.clientId}`).catch(() => null)
      : null,
    proposal.propertyId && session.can('property:view')
      ? api.get<Property>(`/properties/${proposal.propertyId}`).catch(() => null)
      : null,
    // Fetched directly rather than from the admin list, which excludes
    // retired entries — a proposal must keep showing its own even after
    // that entry is archived (docs/phase-5-plan.md §9).
    proposal.sketchTypeId
      ? api
          .get<ProposalSketchType[]>('/proposal-sketch-types')
          .then((types) => types.find((t) => t.id === proposal.sketchTypeId) ?? null)
          .catch(() => null)
      : null,
    proposal.assignedArchitectId && session.can('user:view')
      ? api.get<UserRow>(`/users/${proposal.assignedArchitectId}`).catch(() => null)
      : null,
    proposal.convertedProjectId
      ? api.get<Project>(`/projects/${proposal.convertedProjectId}`).catch(() => null)
      : null,
  ]);

  const mayEdit = session.can('proposal:edit') && proposal.status !== 'CONVERTED';
  const legal = PROPOSAL_TRANSITIONS[proposal.status] as readonly ProposalStatus[];
  const available = mayEdit ? ACTIONS.filter((candidate) => legal.includes(candidate.to)) : [];

  const mayConvert = session.can('proposal:convert') && proposal.status === 'WON';

  return (
    <>
      <Breadcrumb
        items={[{ href: '/proposals', label: 'Proposals' }, { label: proposal.sketchNumber }]}
      />
      <PageHead title={proposal.contactName} description={proposal.sketchNumber}>
        <Badge>{STATUS_LABEL[proposal.status] ?? proposal.status}</Badge>
        {mayEdit ? (
          <Link href={`/proposals/${id}/edit`} className="button button--secondary">
            Edit
          </Link>
        ) : null}
      </PageHead>

      <div className="grid-2">
        <div className="stack">
          {available.length > 0 || mayConvert ? (
            <Card>
              <CardHead title="Status" />
              <CardBody>
                {available.length > 0 ? (
                  <div className="row">
                    {available.map((candidate) => (
                      <ActionButton
                        key={candidate.action}
                        action={transitionProposal.bind(
                          null,
                          id,
                          candidate.action,
                          proposal.version,
                        )}
                        label={candidate.label(proposal.status)}
                        variant={candidate.action === 'lose' ? 'danger' : 'secondary'}
                        {...(candidate.confirm ? { confirm: candidate.confirm } : {})}
                      />
                    ))}
                  </div>
                ) : null}
                <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
                  Only the moves that are legal from{' '}
                  <strong>
                    {(STATUS_LABEL[proposal.status] ?? proposal.status).toLowerCase()}
                  </strong>{' '}
                  are offered. The server checks again regardless.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {mayConvert ? (
            <Card>
              <CardHead title="Convert to project" />
              <CardBody>
                <ActionForm action={convertProposal} submitLabel="Convert to project">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="version" value={proposal.version} />
                  <p className="hint">
                    Creates a numbered project from this proposal and marks it converted. Requires a
                    property to be attached below.
                  </p>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <dl className="definition">
              <dt>Sketch number</dt>
              <dd className="mono">
                <CodeTag>{proposal.sketchNumber}</CodeTag>
              </dd>
              <dt>Contact phone</dt>
              <dd>
                <Value>{proposal.contactPhone}</Value>
              </dd>
              <dt>Client</dt>
              <dd>
                {client ? (
                  <Link href={`/clients/${client.id}`}>{client.name}</Link>
                ) : (
                  <span className="faint">Not attached</span>
                )}
              </dd>
              <dt>Property</dt>
              <dd>
                {property ? (
                  <Link href={`/properties/${property.id}`}>{property.name}</Link>
                ) : (
                  <span className="faint">Not attached</span>
                )}
              </dd>
              <dt>Type of sketch</dt>
              <dd>
                <Value>{sketchType?.label}</Value>
                {sketchType?.archivedAt ? (
                  <>
                    {' '}
                    <span className="badge">Retired</span>
                  </>
                ) : null}
              </dd>
              <dt>Eventual project type</dt>
              <dd>
                <Value>{proposal.projectType}</Value>
              </dd>
              <dt>Approx. area</dt>
              <dd>
                {proposal.approxAreaSqm ? `${proposal.approxAreaSqm} sqm` : <Value>{null}</Value>}
              </dd>
              <dt>Source</dt>
              <dd>
                <Value>{proposal.source}</Value>
              </dd>
              <dt>Assigned architect</dt>
              <dd>
                <Value>{architect?.displayName}</Value>
              </dd>
              <dt>Received</dt>
              <dd>
                <DateText value={proposal.receivedAt} />
              </dd>
              <dt>Due</dt>
              <dd>
                <DateText value={proposal.dueAt} />
              </dd>
              {convertedProject ? (
                <>
                  <dt>Converted project</dt>
                  <dd>
                    <Link href={`/projects/${convertedProject.id}`}>{convertedProject.code}</Link>
                  </dd>
                </>
              ) : null}
              {proposal.notes ? (
                <>
                  <dt>Notes</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{proposal.notes}</dd>
                </>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
