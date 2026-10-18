import {
  formatClientName,
  PROPOSAL_TRANSITIONS,
  type ProposalAction,
  type ProposalStatus,
} from '@ecms/contracts';
import Link from 'next/link';

import { ContextStrip, placeLine } from '@/components/context-strip';
import { EntityCombobox } from '@/components/entity-combobox';
import { ActionButton, ActionForm, Field, TextArea } from '@/components/form';
import { NextSteps, deliverySteps } from '@/components/next-steps';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  DetailGroup,
  DetailItem,
  CodeTag,
  DateText,
  PageHead,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Client, Project, Property, Proposal, ProposalSketchType, UserRow } from '@/lib/types';

import { completeForConversion, convertProposal, transitionProposal } from '../actions';

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
  const hasClient = Boolean(proposal.clientId);
  const hasProperty = Boolean(proposal.propertyId);
  const checks = [
    { label: 'Client attached', done: hasClient },
    { label: 'Property attached', done: hasProperty },
    { label: 'Survey reference (Krookie) entered', done: Boolean(proposal.surveyReference) },
    { label: 'Requirements entered', done: Boolean(proposal.requirements) },
  ];
  const ready = checks.every((check) => check.done);

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

      <ContextStrip
        chips={[
          client && {
            label: 'Client',
            text: formatClientName(client),
            href: `/clients/${client.id}`,
            sub: client.mobileNumber ?? proposal.contactPhone,
          },
          property && {
            label: 'Property',
            text: property.name,
            href: `/properties/${property.id}`,
            sub: placeLine(property),
          },
          architect && {
            label: 'Architect',
            text: architect.displayName,
            href: `/users/${architect.id}`,
          },
          convertedProject && {
            label: 'Project',
            text: convertedProject.code,
            href: `/projects/${convertedProject.id}`,
          },
        ]}
      />

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
                      action={transitionProposal.bind(null, id, candidate.action, proposal.version)}
                      label={candidate.label(proposal.status)}
                      variant={candidate.action === 'lose' ? 'danger' : 'secondary'}
                      {...(candidate.confirm ? { confirm: candidate.confirm } : {})}
                    />
                  ))}
                </div>
              ) : null}
              <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
                Only the moves that are legal from{' '}
                <strong>{(STATUS_LABEL[proposal.status] ?? proposal.status).toLowerCase()}</strong>{' '}
                are offered. The server checks again regardless.
              </p>
            </CardBody>
          </Card>
        ) : null}

        {convertedProject ? (
          <NextSteps
            title="Converted — what comes next"
            steps={[
              {
                label: `Open project ${convertedProject.code}`,
                href: `/projects/${convertedProject.id}`,
                detail: 'It starts as a Draft.',
              },
              {
                label: 'Activate the project',
                href: `/projects/${convertedProject.id}`,
                detail: 'Use Activate on its Status card to start the work.',
              },
              ...deliverySteps(convertedProject.id, convertedProject.type),
            ]}
          />
        ) : null}

        {mayConvert ? (
          <Card>
            <CardHead title="Ready to convert" />
            <CardBody>
              <ul className="guide-checklist">
                {checks.map((check) => (
                  <li key={check.label}>
                    <span
                      className="guide-checklist__box"
                      aria-hidden="true"
                      style={check.done ? { background: 'var(--success)' } : undefined}
                    />
                    {check.label}
                    <span className="sr-only">{check.done ? ' — done' : ' — missing'}</span>
                  </li>
                ))}
              </ul>

              {ready ? (
                <ActionForm action={convertProposal} submitLabel="Convert to project">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="version" value={proposal.version} />
                  <p className="hint">
                    Creates a numbered project from this proposal and marks it converted.
                  </p>
                </ActionForm>
              ) : (
                <ActionForm action={completeForConversion} submitLabel="Save details">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="version" value={proposal.version} />
                  {!hasClient ? (
                    <>
                      <EntityCombobox
                        label="Client"
                        name="clientId"
                        searchUrl="/lookup/clients/search"
                        placeholder="Search by name, reference, CR/Civil ID or phone"
                      />
                      {session.can('client:create') ? (
                        <Link
                          href={`/clients/new?forProposal=${id}`}
                          className="button button--small button--secondary"
                        >
                          Add new client
                        </Link>
                      ) : null}
                    </>
                  ) : null}
                  {!hasProperty ? (
                    <>
                      <EntityCombobox
                        label="Property"
                        name="propertyId"
                        searchUrl="/lookup/properties/search"
                        hint="Each result shows its client."
                      />
                      {session.can('property:create') && (hasClient || proposal.clientId) ? (
                        <Link
                          href={`/properties/new?forProposal=${id}&clientId=${proposal.clientId ?? ''}`}
                          className="button button--small button--secondary"
                        >
                          Add new property
                        </Link>
                      ) : (
                        <p className="hint">
                          Add or attach the client first to create a new property for them.
                        </p>
                      )}
                    </>
                  ) : null}
                  {!proposal.surveyReference ? (
                    <Field label="Survey reference (Krookie)" name="surveyReference" />
                  ) : null}
                  {!proposal.requirements ? (
                    <TextArea label="Requirements" name="requirements" />
                  ) : null}
                </ActionForm>
              )}
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHead title="Details" />
          <CardBody>
            <DetailGroup title="Inquiry">
              <DetailItem label="Sketch number" mono>
                <CodeTag>{proposal.sketchNumber}</CodeTag>
              </DetailItem>
              <DetailItem label="Type of sketch">
                <Value>{sketchType?.label}</Value>
                {sketchType?.archivedAt ? (
                  <>
                    {' '}
                    <span className="badge">Retired</span>
                  </>
                ) : null}
              </DetailItem>
              <DetailItem label="Eventual project type">
                <Value>{proposal.projectType}</Value>
              </DetailItem>
              <DetailItem label="Approx. area">
                {proposal.approxAreaSqm ? `${proposal.approxAreaSqm} sqm` : <Value>{null}</Value>}
              </DetailItem>
              <DetailItem label="Source">
                <Value>{proposal.source}</Value>
              </DetailItem>
              <DetailItem label="Assigned architect">
                {architect ? (
                  <Link href={`/users/${architect.id}`}>{architect.displayName}</Link>
                ) : (
                  <Value>{null}</Value>
                )}
              </DetailItem>
              <DetailItem label="Received">
                <DateText value={proposal.receivedAt} />
              </DetailItem>
              <DetailItem label="Due">
                <DateText value={proposal.dueAt} />
              </DetailItem>
              {convertedProject ? (
                <DetailItem label="Converted project">
                  <Link href={`/projects/${convertedProject.id}`}>{convertedProject.code}</Link>
                </DetailItem>
              ) : null}
            </DetailGroup>

            <DetailGroup title="Client and site">
              <DetailItem label="Client">
                {client ? (
                  <Link href={`/clients/${client.id}`}>{formatClientName(client)}</Link>
                ) : (
                  <span className="faint">Not attached</span>
                )}
              </DetailItem>
              <DetailItem label="Contact phone">
                <Value>{proposal.contactPhone}</Value>
              </DetailItem>
              <DetailItem label="Submitted by">
                {proposal.submissionType === 'OTHER' ? (
                  <>
                    <Value>{proposal.submittedBy}</Value>
                    {proposal.submitterRelationship ? ` (${proposal.submitterRelationship})` : ''}
                  </>
                ) : (
                  <Value>{proposal.submissionType === 'SELF' ? 'Self' : null}</Value>
                )}
              </DetailItem>
              <DetailItem label="Property">
                {property ? (
                  <Link href={`/properties/${property.id}`}>{property.name}</Link>
                ) : (
                  <span className="faint">Not attached</span>
                )}
              </DetailItem>
              <DetailItem label="Survey reference (Krookie)" mono>
                <Value>{proposal.surveyReference}</Value>
              </DetailItem>
              <DetailItem label="Title deed reference (Mulkiya)" mono>
                <Value>{proposal.titleDeedReference}</Value>
              </DetailItem>
            </DetailGroup>

            {proposal.requirements || proposal.notes ? (
              <DetailGroup title="Brief">
                {proposal.requirements ? (
                  <DetailItem label="Requirements" wide>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{proposal.requirements}</span>
                  </DetailItem>
                ) : null}
                {proposal.notes ? (
                  <DetailItem label="Notes" wide>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{proposal.notes}</span>
                  </DetailItem>
                ) : null}
              </DetailGroup>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
