import { formatClientName, LAND_USE_TYPES, PROJECTION_TYPES } from '@ecms/contracts';

import { DuplicateAwareForm } from '@/components/duplicate-form';
import { EntityCombobox } from '@/components/entity-combobox';
import { Field, Select, TextArea } from '@/components/form';
import { FormAutofill } from '@/components/form-autofill';
import { PropertyNameField } from '@/components/property-name-field';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client } from '@/lib/types';

import { createProperty } from '../actions';
import { PROPERTY_PREFILL_FIELDS } from '../prefill-fields';

export const metadata = { title: 'New property — ECMS' };

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

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; forProposal?: string }>;
}) {
  const session = await requirePermission('property:create');
  const params = await searchParams;

  // Archived clients are excluded: the API refuses a property on one, so
  // offering it would only lead somebody to a refusal they could not have
  // predicted. The search endpoint behind the combobox already excludes
  // them by default, same as the plain list did.
  const preselectedClient = params.clientId
    ? await api
        .get<Client>(`/clients/${params.clientId}`)
        .then((c) => ({
          id: c.id,
          label: formatClientName(c),
          meta: {
            name: formatClientName(c),
            idNumber: c.civilId ?? c.crNumber ?? '',
            mobile: c.mobileNumber ?? '',
          },
        }))
        .catch(() => null)
    : null;

  return (
    <>
      <Breadcrumb items={[{ href: '/properties', label: 'Properties' }, { label: 'New' }]} />
      <PageHead title="New property" />

      <Card>
        <CardBody>
          <DuplicateAwareForm
            action={createProperty}
            submitLabel="Create property"
            cancelHref={params.forProposal ? `/proposals/${params.forProposal}` : '/properties'}
            basePath="/properties"
            canEdit={session.can('property:edit')}
            canOverride={session.can('directory:override_duplicate')}
            prefillFields={PROPERTY_PREFILL_FIELDS}
          >
            {params.forProposal ? (
              <input type="hidden" name="forProposal" value={params.forProposal} />
            ) : null}
            <FormAutofill
              rules={[
                { source: 'clientId', target: 'ownerName', key: 'name' },
                { source: 'clientId', target: 'ownerNationalId', key: 'idNumber' },
              ]}
            />
            <div className="form-grid">
              <EntityCombobox
                label="Client"
                name="clientId"
                required
                wide
                searchUrl="/lookup/clients/search"
                placeholder="Search by name, reference, CR/Civil ID or phone"
                defaultValue={preselectedClient}
              />
              <PropertyNameField />
              <Field
                label="Reference"
                name="reference"
                hint="Leave blank to generate one automatically."
              />
              <Field
                label="Postal address (optional)"
                name="addressLine1"
                wide
                hint="For correspondence — the plot's own location is Wilayat/Village below, not this."
              />
              <Field label="Address line 2" name="addressLine2" wide />
              <Field label="Postcode" name="postcode" />
              <Field label="Plot number" name="plotNumber" hint="The Krookie's plot number." />
              <Field label="Wilayat" name="wilayat" />
              <Field label="Village" name="village" />
              <Field
                label="Survey reference (Krookie / Land ID)"
                name="surveyReference"
                hint="The Krookie's own serial — also the government land-registry number. Leave blank if not yet known; unique among live properties once set."
              />
              <Field
                label="Title deed reference"
                name="titleDeedReference"
                hint="The Mulkia's deed reference."
              />
              <Field
                label="Owner name"
                name="ownerName"
                hint="Per the title deed. Filled from the client; change it if the deed owner is someone else."
              />
              <Field label="Owner national ID" name="ownerNationalId" />
              <Field label="Block number" name="blockNumber" />
              <Field label="Plot area (sqm)" name="plotArea" type="number" />
              <Select
                label="Type of land use"
                name="landUseType"
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
              <Field label="Easting" name="easting" type="number" />
              <Field label="Northing" name="northing" type="number" />
              <Select
                label="Projection type"
                name="projectionType"
                options={PROJECTION_TYPES.map((type) => ({
                  value: type,
                  label: PROJECTION_LABEL[type] ?? type,
                }))}
              />
            </div>
            <TextArea label="Notes" name="notes" />
          </DuplicateAwareForm>
        </CardBody>
      </Card>
    </>
  );
}
