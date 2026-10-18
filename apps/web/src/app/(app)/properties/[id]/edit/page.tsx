import { LAND_USE_TYPES, PROJECTION_TYPES } from '@ecms/contracts';

import { DuplicateAwareForm, PrefillFromDuplicate } from '@/components/duplicate-form';
import { Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Property } from '@/lib/types';

import { updateProperty } from '../../actions';

export const metadata = { title: 'Edit property — ECMS' };

const LAND_USE_LABEL: Record<string, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  AGRICULTURAL: 'Agricultural',
  INDUSTRIAL: 'Industrial',
  MIXED_USE: 'Mixed use',
  GOVERNMENT: 'Government',
};

const PROJECTION_LABEL: Record<string, string> = {
  CLARKE_1880_ZONE_39: 'Old projection — Clarke 1880 Zone 39',
  CLARKE_1880_ZONE_40: 'Old projection — Clarke 1880 Zone 40',
  UTM_ZONE_39N: 'UTM Zone 39N',
  UTM_ZONE_40N: 'UTM Zone 40N',
};

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('property:edit');
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
          <PrefillFromDuplicate basePath="/properties" id={id} />
          <DuplicateAwareForm
            action={updateProperty}
            submitLabel="Save changes"
            cancelHref={`/properties/${id}`}
            basePath="/properties"
            canEdit
            canOverride={session.can('directory:override_duplicate')}
            prefillFields={[]}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={property.version} />
            {/* What the plot's identity was when the form was rendered, so only
                a change to it is checked for duplicates. The client is sent
                only to scope the name comparison; the API never moves it. */}
            <input type="hidden" name="checkClientId" value={property.clientId} />
            <input type="hidden" name="original_name" value={property.name} />
            <input type="hidden" name="original_plotNumber" value={property.plotNumber ?? ''} />
            <input type="hidden" name="original_wilayat" value={property.wilayat ?? ''} />
            {/* The client is absent on purpose. A property does not move to a
                different customer — that would be a different property. */}
            <div className="form-grid">
              <Field label="Name" name="name" defaultValue={property.name} required />
              <Field label="Reference" name="reference" defaultValue={property.reference} />
              <Field
                label="Postal address (optional)"
                name="addressLine1"
                defaultValue={property.addressLine1}
                wide
                hint="For correspondence — the plot's own location is Wilayat/Village below, not this."
              />
              <Field
                label="Address line 2"
                name="addressLine2"
                defaultValue={property.addressLine2}
                wide
              />
              <Field label="Postcode" name="postcode" defaultValue={property.postcode} />
              <Field
                label="Plot number"
                name="plotNumber"
                defaultValue={property.plotNumber}
                hint="The Krookie's plot number."
              />
              <Field label="Wilayat" name="wilayat" defaultValue={property.wilayat} />
              <Field label="Village" name="village" defaultValue={property.village} />
              <Field
                label="Survey reference (Krookie / Land ID)"
                name="surveyReference"
                defaultValue={property.surveyReference}
                hint="The Krookie's own serial — also the government land-registry number. Unique among live properties."
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
              <Field label="Block number" name="blockNumber" defaultValue={property.blockNumber} />
              <Field
                label="Plot area (sqm)"
                name="plotArea"
                type="number"
                defaultValue={property.plotArea}
              />
              <Select
                label="Type of land use"
                name="landUseType"
                defaultValue={property.landUseType ?? undefined}
                options={LAND_USE_TYPES.map((type) => ({
                  value: type,
                  label: LAND_USE_LABEL[type] ?? type,
                }))}
              />
              <p className="faint">
                Look up Easting and Northing on{' '}
                <a href="https://omanreal.com/Map" target="_blank" rel="noreferrer">
                  omanreal.com
                </a>
                . Enter all three together.
              </p>
              <Field label="Easting" name="easting" type="number" defaultValue={property.easting} />
              <Field
                label="Northing"
                name="northing"
                type="number"
                defaultValue={property.northing}
              />
              <Select
                label="Projection type"
                name="projectionType"
                defaultValue={property.projectionType ?? undefined}
                options={PROJECTION_TYPES.map((type) => ({
                  value: type,
                  label: PROJECTION_LABEL[type] ?? type,
                }))}
              />
            </div>
            <TextArea label="Notes" name="notes" defaultValue={property.notes} />
          </DuplicateAwareForm>
        </CardBody>
      </Card>
    </>
  );
}
