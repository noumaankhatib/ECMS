import { ActionForm, Field, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Property } from '@/lib/types';

import { updateProperty } from '../../actions';

export const metadata = { title: 'Edit property — ECMS' };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('property:edit');
  const { id } = await params;
  const property = await api.get<Property>(`/properties/${id}`);

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/properties', label: 'Properties' },
          { href: `/properties/${id}`, label: property.name },
          { label: 'Edit' },
        ]}
      />
      <PageHead title={`Edit ${property.name}`} />

      <Card>
        <CardBody>
          <ActionForm
            action={updateProperty}
            submitLabel="Save changes"
            cancelHref={`/properties/${id}`}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={property.version} />
            {/* The client is absent on purpose. A property does not move to a
                different customer — that would be a different property. */}
            <div className="form-grid">
              <Field label="Name" name="name" defaultValue={property.name} required />
              <Field label="Reference" name="reference" defaultValue={property.reference} />
              <Field
                label="Address line 1"
                name="addressLine1"
                defaultValue={property.addressLine1}
                wide
              />
              <Field
                label="Address line 2"
                name="addressLine2"
                defaultValue={property.addressLine2}
                wide
              />
              <Field label="Town or city" name="city" defaultValue={property.city} />
              <Field label="Postcode" name="postcode" defaultValue={property.postcode} />
              <Field label="Country" name="country" defaultValue={property.country} />
              <Field
                label="Plot number"
                name="plotNumber"
                defaultValue={property.plotNumber}
                hint="The Krookie's plot number."
              />
              <Field label="Wilayat" name="wilayat" defaultValue={property.wilayat} />
              <Field label="Village" name="village" defaultValue={property.village} />
              <Field
                label="Survey reference"
                name="surveyReference"
                defaultValue={property.surveyReference}
                hint="The Krookie's own serial."
              />
              <Field
                label="Title deed reference"
                name="titleDeedReference"
                defaultValue={property.titleDeedReference}
                hint="The Mulkia's deed reference."
              />
              <Field
                label="Owner name"
                name="ownerName"
                defaultValue={property.ownerName}
                hint="Per the title deed."
              />
              <Field
                label="Owner national ID"
                name="ownerNationalId"
                defaultValue={property.ownerNationalId}
              />
            </div>
            <TextArea label="Notes" name="notes" defaultValue={property.notes} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
