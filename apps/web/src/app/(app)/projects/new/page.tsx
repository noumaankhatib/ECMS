import { PROJECT_TYPES } from '@ecms/contracts';

import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage, Property } from '@/lib/types';

import { createProject } from '../actions';

export const metadata = { title: 'New project — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  BOTH: 'Planning and supervision',
};

export default async function NewProjectPage() {
  await requirePermission('project:create');

  const [clients, properties] = await Promise.all([
    api.get<ApiPage<Client>>('/clients?pageSize=100'),
    api.get<ApiPage<Property>>('/properties?pageSize=100'),
  ]);

  const clientName = new Map(clients.items.map((c) => [c.id, c.name]));

  // The property carries its client, and the API refuses a pairing that
  // disagrees. Showing the client's name against each property is what stops
  // somebody picking a plausible-looking mismatch in the first place.
  const propertyOptions = properties.items.map((property) => ({
    value: property.id,
    label: `${property.name} — ${clientName.get(property.clientId) ?? 'unknown client'}`,
    clientId: property.clientId,
  }));

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
              <Select
                label="Client"
                name="clientId"
                required
                options={clients.items.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                label="Property"
                name="propertyId"
                required
                hint="Must belong to the client above."
                options={propertyOptions}
              />
              <Field
                label="Project code"
                name="code"
                required
                hint="Unique across the portfolio."
              />
              <Field label="Name" name="name" required />
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
              <Field label="Start date" name="startDate" type="date" />
              <Field label="Target end date" name="targetEndDate" type="date" />
            </div>
            <TextArea label="Description" name="description" />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
