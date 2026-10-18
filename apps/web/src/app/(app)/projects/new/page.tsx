import { PROJECT_TYPES } from '@ecms/contracts';

import { EntityCombobox } from '@/components/entity-combobox';
import { ActionForm, DateRangeFields, Field, Select, TextArea } from '@/components/form';
import { ProjectNameField } from '@/components/project-name-field';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { requirePermission } from '@/lib/session';

import { createProject } from '../actions';

export const metadata = { title: 'New project — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  BOTH: 'Planning and supervision',
};

export default async function NewProjectPage() {
  await requirePermission('project:create');

  return (
    <>
      <Breadcrumb items={[{ href: '/projects', label: 'Projects' }, { label: 'New' }]} />
      <PageHead
        title="New project"
        description="You are added to it automatically, so you can carry on working on it."
      />

      <Card>
        <CardBody>
          <ActionForm action={createProject} submitLabel="Create project" cancelHref="/projects">
            <div className="form-grid">
              <EntityCombobox
                label="Client"
                name="clientId"
                required
                searchUrl="/lookup/clients/search"
                placeholder="Search by name, reference, CR/Civil ID or phone"
              />
              <EntityCombobox
                label="Property"
                name="propertyId"
                required
                searchUrl="/lookup/properties/search"
                hint="Must belong to the client above — each result shows its client."
              />
              <Field
                label="Project code"
                name="code"
                hint="Leave blank to generate one automatically for the selected type."
              />
              <ProjectNameField />
              <Select
                label="Type"
                name="type"
                required
                hint="Decides which workstreams the project opens with."
                options={PROJECT_TYPES.map((type) => ({
                  value: type,
                  label: TYPE_LABEL[type] ?? type,
                }))}
              />
              <div />
              <DateRangeFields
                startLabel="Start date"
                startName="startDate"
                endLabel="Target end date"
                endName="targetEndDate"
              />
            </div>
            <fieldset className="stack" style={{ gap: 'var(--space-2)' }}>
              <legend>Documents received</legend>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="mulkiyaReceived" style={{ width: 'auto' }} />
                Mulkiya (title deed)
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="idCardReceived" style={{ width: 'auto' }} />
                ID card
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="agreementReceived" style={{ width: 'auto' }} />
                Agreement
              </label>
            </fieldset>
            <TextArea label="Description" name="description" />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
