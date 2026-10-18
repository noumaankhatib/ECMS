import { PROJECT_TYPES, PROPOSAL_SUBMISSION_TYPES } from '@ecms/contracts';

import { ContactPicker } from '@/components/contact-picker';
import { EntityCombobox } from '@/components/entity-combobox';
import { ActionForm, DateField, Field, Select, TextArea } from '@/components/form';
import { FormAutofill } from '@/components/form-autofill';
import { SubmitterFields } from '@/components/submitter-fields';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { ProposalSketchType } from '@/lib/types';

import { createProposal } from '../actions';

export const metadata = { title: 'New proposal — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  BOTH: 'Planning and supervision',
};

const SUBMISSION_TYPE_LABEL: Record<string, string> = {
  SELF: 'Self — the client is dealing with us directly',
  OTHER: 'Other — someone is submitting on the client’s behalf',
};

export default async function NewProposalPage() {
  const session = await requirePermission('proposal:create');

  const sketchTypes = await api.get<ProposalSketchType[]>('/proposal-sketch-types');
  const canSeeUsers = session.can('user:view');

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
              <FormAutofill
                rules={[
                  { source: 'clientId', target: 'contactName', key: 'name' },
                  { source: 'clientId', target: 'contactPhone', key: 'mobile' },
                ]}
              />
              <EntityCombobox
                label="Client"
                name="clientId"
                searchUrl="/lookup/clients/search"
                placeholder="Search by name, reference, CR/Civil ID or phone"
                hint="Attach now if known, or leave blank and add it later."
              />
              <ContactPicker />
              <Field
                label="Contact name"
                name="contactName"
                required
                wide
                hint="Filled from the client; change it if someone else is the contact."
              />
              <Field label="Contact phone" name="contactPhone" />
              <SubmitterFields
                options={PROPOSAL_SUBMISSION_TYPES.map((type) => ({
                  value: type,
                  label: SUBMISSION_TYPE_LABEL[type] ?? type,
                }))}
              />
              <EntityCombobox
                label="Property"
                name="propertyId"
                searchUrl="/lookup/properties/search"
                hint="Required before this proposal can be converted to a project."
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
              {canSeeUsers ? (
                <EntityCombobox
                  label="Assigned architect"
                  name="assignedArchitectId"
                  searchUrl="/lookup/users/search?browse=true&activeOnly=true&roles=PLANNING,PROJECT_MANAGER"
                  browseOnFocus
                  placeholder="Select or search an architect"
                />
              ) : null}
              <Field label="Survey reference (Krookie)" name="surveyReference" required />
              <Field label="Title deed reference (Mulkiya)" name="titleDeedReference" />
              <DateField label="Received" name="receivedAt" />
              <DateField label="Due" name="dueAt" />
            </div>
            <TextArea label="Requirements" name="requirements" required />
            <TextArea label="Notes" name="notes" />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
