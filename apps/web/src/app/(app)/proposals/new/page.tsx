import { PROJECT_TYPES } from '@ecms/contracts';

import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage, Property, ProposalSketchType, UserRow } from '@/lib/types';

import { createProposal } from '../actions';

export const metadata = { title: 'New proposal — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  BOTH: 'Planning and supervision',
};

export default async function NewProposalPage() {
  const session = await requirePermission('proposal:create');

  const [clients, properties, sketchTypes, users] = await Promise.all([
    api.get<ApiPage<Client>>('/clients?pageSize=100'),
    api.get<ApiPage<Property>>('/properties?pageSize=100'),
    api.get<ProposalSketchType[]>('/proposal-sketch-types'),
    session.can('user:view')
      ? api.get<ApiPage<UserRow>>('/users?pageSize=100').catch(() => null)
      : null,
  ]);

  return (
    <>
      <Breadcrumb items={[{ href: '/proposals', label: 'Proposals' }, { label: 'New' }]} />
      <PageHead
        title="New proposal"
        description="A sketch number is generated as soon as this is saved. A client or property is not required to start."
      />

      <Card>
        <CardBody>
          <ActionForm action={createProposal} submitLabel="Create proposal" cancelHref="/proposals">
            <div className="form-grid">
              <Field label="Contact name" name="contactName" required wide />
              <Field label="Contact phone" name="contactPhone" />
              <Select
                label="Client"
                name="clientId"
                hint="Attach now if known, or leave blank and add it later."
                options={clients.items.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                label="Property"
                name="propertyId"
                hint="Required before this proposal can be converted to a project."
                options={properties.items.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Select
                label="Type of sketch"
                name="sketchTypeId"
                options={sketchTypes.map((t) => ({ value: t.id, label: t.label }))}
              />
              <Select
                label="Eventual project type"
                name="projectType"
                options={PROJECT_TYPES.map((type) => ({
                  value: type,
                  label: TYPE_LABEL[type] ?? type,
                }))}
              />
              <Field label="Approx. area (sqm)" name="approxAreaSqm" type="number" />
              <Field label="Source" name="source" hint="e.g. referral, walk-in, old customer." />
              {users ? (
                <Select
                  label="Assigned architect"
                  name="assignedArchitectId"
                  options={users.items.map((u) => ({ value: u.id, label: u.displayName }))}
                />
              ) : null}
              <Field label="Received" name="receivedAt" type="date" />
              <Field label="Due" name="dueAt" type="date" />
            </div>
            <TextArea label="Notes" name="notes" />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
