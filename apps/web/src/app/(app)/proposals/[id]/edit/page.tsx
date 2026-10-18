import { formatClientName, PROJECT_TYPES, PROPOSAL_SUBMISSION_TYPES } from '@ecms/contracts';

import { EntityCombobox } from '@/components/entity-combobox';
import { ActionForm, DateField, Field, Select, TextArea } from '@/components/form';
import { SubmitterFields } from '@/components/submitter-fields';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Property, Proposal, ProposalSketchType, UserRow } from '@/lib/types';

import { updateProposal } from '../../actions';

/** Resolves just the one record a combobox needs to show as pre-selected,
 *  instead of fetching hundreds of rows just to find a label for one id. */
async function fetchOption<T>(
  path: string,
  toOption: (item: T) => { id: string; label: string },
): Promise<{ id: string; label: string } | null> {
  try {
    return toOption(await api.get<T>(path));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const metadata = { title: 'Edit proposal — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  BOTH: 'Planning and supervision',
};

const SUBMISSION_TYPE_LABEL: Record<string, string> = {
  SELF: 'Self — the client is dealing with us directly',
  OTHER: 'Other — someone is submitting on the client’s behalf',
};

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('proposal:edit');
  const { id } = await params;

  const proposal = await api.get<Proposal>(`/proposals/${id}`);
  const canSeeUsers = session.can('user:view');

  const [sketchTypes, currentClient, currentProperty, currentArchitect] = await Promise.all([
    api.get<ProposalSketchType[]>('/proposal-sketch-types'),
    proposal.clientId
      ? fetchOption<Client>(`/clients/${proposal.clientId}`, (c) => ({
          id: c.id,
          label: formatClientName(c),
        }))
      : null,
    proposal.propertyId
      ? fetchOption<Property>(`/properties/${proposal.propertyId}`, (p) => ({
          id: p.id,
          label: p.name,
        }))
      : null,
    proposal.assignedArchitectId && canSeeUsers
      ? fetchOption<UserRow>(`/users/${proposal.assignedArchitectId}`, (u) => ({
          id: u.id,
          label: u.displayName,
        }))
      : null,
  ]);

  // A retired sketch type must still appear as an option here — this
  // proposal is already using it (docs/phase-5-plan.md §9) — even though the
  // admin list, and the picker on the create form, both exclude it.
  const sketchTypeOptions =
    proposal.sketchTypeId && !sketchTypes.some((t) => t.id === proposal.sketchTypeId)
      ? [...sketchTypes, { id: proposal.sketchTypeId, label: '(retired — kept for this proposal)' }]
      : sketchTypes;

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/proposals', label: 'Proposals' },
          { href: `/proposals/${id}`, label: proposal.sketchNumber },
          { label: 'Edit' },
        ]}
      />
      <PageHead title={`Edit ${proposal.contactName}`} description={proposal.sketchNumber} />

      <Card>
        <CardBody>
          <ActionForm
            action={updateProposal}
            submitLabel="Save changes"
            cancelHref={`/proposals/${id}`}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={proposal.version} />
            <div className="form-grid">
              <Field
                label="Contact name"
                name="contactName"
                defaultValue={proposal.contactName}
                required
                wide
              />
              <Field
                label="Contact phone"
                name="contactPhone"
                defaultValue={proposal.contactPhone}
              />
              <EntityCombobox
                label="Client"
                name="clientId"
                searchUrl="/lookup/clients/search"
                placeholder="Search by name, reference, CR/Civil ID or phone"
                defaultValue={currentClient}
              />
              <SubmitterFields
                options={PROPOSAL_SUBMISSION_TYPES.map((type) => ({
                  value: type,
                  label: SUBMISSION_TYPE_LABEL[type] ?? type,
                }))}
                defaultSubmissionType={proposal.submissionType ?? undefined}
                defaultSubmittedBy={proposal.submittedBy}
                defaultRelationship={proposal.submitterRelationship}
              />
              <EntityCombobox
                label="Property"
                name="propertyId"
                searchUrl="/lookup/properties/search"
                hint="Required before this proposal can be converted to a project."
                defaultValue={currentProperty}
              />
              <Select
                label="Type of sketch"
                name="sketchTypeId"
                defaultValue={proposal.sketchTypeId ?? undefined}
                options={sketchTypeOptions.map((t) => ({ value: t.id, label: t.label }))}
              />
              <Select
                label="Eventual project type"
                name="projectType"
                defaultValue={proposal.projectType ?? undefined}
                options={PROJECT_TYPES.map((type) => ({
                  value: type,
                  label: TYPE_LABEL[type] ?? type,
                }))}
              />
              <Field
                label="Approx. area (sqm)"
                name="approxAreaSqm"
                type="number"
                defaultValue={proposal.approxAreaSqm}
              />
              <Field label="Source" name="source" defaultValue={proposal.source} />
              {canSeeUsers ? (
                <EntityCombobox
                  label="Assigned architect"
                  name="assignedArchitectId"
                  searchUrl="/lookup/users/search?browse=true&activeOnly=true&roles=PLANNING,PROJECT_MANAGER"
                  browseOnFocus
                  placeholder="Select or search an architect"
                  defaultValue={currentArchitect}
                />
              ) : null}
              <Field
                label="Survey reference (Krookie)"
                name="surveyReference"
                defaultValue={proposal.surveyReference}
                hint="Required before this proposal can be converted to a project."
              />
              <Field
                label="Title deed reference (Mulkiya)"
                name="titleDeedReference"
                defaultValue={proposal.titleDeedReference}
              />
              <DateField label="Received" name="receivedAt" defaultValue={proposal.receivedAt} />
              <DateField label="Due" name="dueAt" defaultValue={proposal.dueAt} />
            </div>
            <TextArea
              label="Requirements"
              name="requirements"
              defaultValue={proposal.requirements}
              hint="Required before this proposal can be converted to a project."
            />
            <TextArea label="Notes" name="notes" defaultValue={proposal.notes} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
