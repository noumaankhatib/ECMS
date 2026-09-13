import { PROJECT_TYPES } from '@ecms/contracts';

import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type {
  Client,
  Page as ApiPage,
  Property,
  Proposal,
  ProposalSketchType,
  UserRow,
} from '@/lib/types';

import { updateProposal } from '../../actions';

export const metadata = { title: 'Edit proposal — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  BOTH: 'Planning and supervision',
};

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('proposal:edit');
  const { id } = await params;

  const [proposal, clients, properties, sketchTypes, users] = await Promise.all([
    api.get<Proposal>(`/proposals/${id}`),
    api.get<ApiPage<Client>>('/clients?pageSize=100'),
    api.get<ApiPage<Property>>('/properties?pageSize=100'),
    api.get<ProposalSketchType[]>('/proposal-sketch-types'),
    session.can('user:view')
      ? api.get<ApiPage<UserRow>>('/users?pageSize=100').catch(() => null)
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
              <Select
                label="Client"
                name="clientId"
                defaultValue={proposal.clientId ?? undefined}
                options={clients.items.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                label="Property"
                name="propertyId"
                defaultValue={proposal.propertyId ?? undefined}
                hint="Required before this proposal can be converted to a project."
                options={properties.items.map((p) => ({ value: p.id, label: p.name }))}
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
              {users ? (
                <Select
                  label="Assigned architect"
                  name="assignedArchitectId"
                  defaultValue={proposal.assignedArchitectId ?? undefined}
                  options={users.items.map((u) => ({ value: u.id, label: u.displayName }))}
                />
              ) : null}
              <Field
                label="Received"
                name="receivedAt"
                type="date"
                defaultValue={proposal.receivedAt}
              />
              <Field label="Due" name="dueAt" type="date" defaultValue={proposal.dueAt} />
            </div>
            <TextArea label="Notes" name="notes" defaultValue={proposal.notes} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
