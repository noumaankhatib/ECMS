import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage } from '@/lib/types';

import { createProperty } from '../actions';

export const metadata = { title: 'New property — ECMS' };

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requirePermission('property:create');
  const params = await searchParams;

  // Archived clients are excluded: the API refuses a property on one, so
  // offering it would only lead somebody to a refusal they could not have
  // predicted.
  const clients = await api.get<ApiPage<Client>>('/clients?pageSize=100');

  return (
    <>
      <Breadcrumb items={[{ href: '/properties', label: 'Properties' }, { label: 'New' }]} />
      <PageHead title="New property" />

      <Card>
        <CardBody>
          <ActionForm
            action={createProperty}
            submitLabel="Create property"
            cancelHref="/properties"
          >
            <div className="form-grid">
              <Select
                label="Client"
                name="clientId"
                required
                wide
                {...(params.clientId ? { defaultValue: params.clientId } : {})}
                options={clients.items.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Field label="Name" name="name" required />
              <Field label="Reference" name="reference" hint="Unique among live properties." />
              <Field label="Address line 1" name="addressLine1" wide />
              <Field label="Address line 2" name="addressLine2" wide />
              <Field label="Town or city" name="city" />
              <Field label="Postcode" name="postcode" />
              <Field label="Country" name="country" />
              <Field label="Plot number" name="plotNumber" hint="The Krookie's plot number." />
              <Field label="Wilayat" name="wilayat" />
              <Field label="Village" name="village" />
              <Field
                label="Survey reference"
                name="surveyReference"
                hint="The Krookie's own serial."
              />
              <Field
                label="Title deed reference"
                name="titleDeedReference"
                hint="The Mulkia's deed reference."
              />
              <Field label="Owner name" name="ownerName" hint="Per the title deed." />
              <Field label="Owner national ID" name="ownerNationalId" />
            </div>
            <TextArea label="Notes" name="notes" />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
