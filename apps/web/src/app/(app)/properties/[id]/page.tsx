import { formatClientName } from '@ecms/contracts';
import Link from 'next/link';

import { ContextStrip } from '@/components/context-strip';
import { ActionButton } from '@/components/form';
import { RelatedProposals } from '@/components/related-proposals';
import {
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  DetailGroup,
  DetailItem,
  Empty,
  PageHead,
  StatusBadge,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage, Project, Property } from '@/lib/types';

import { archiveProperty } from '../actions';

export const metadata = { title: 'Property — ECMS' };

const LAND_USE_LABEL: Record<string, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  AGRICULTURAL: 'Agricultural',
  INDUSTRIAL: 'Industrial',
  MIXED_USE: 'Mixed use',
  GOVERNMENT: 'Government',
};

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('property:view');
  const { id } = await params;

  const property = await api.get<Property>(`/properties/${id}`);
  const [client, projects] = await Promise.all([
    api.get<Client>(`/clients/${property.clientId}`),
    api.get<ApiPage<Project>>(`/projects?propertyId=${id}&pageSize=100`),
  ]);

  const archived = property.archivedAt !== null;
  const address = [
    property.addressLine1,
    property.addressLine2,
    property.city,
    property.postcode,
    property.country,
  ].filter(Boolean);

  return (
    <>
      <Breadcrumb
        items={[{ href: '/properties', label: 'Properties' }, { label: property.name }]}
      />
      <PageHead title={property.name} description={formatClientName(client)}>
        {archived ? <span className="badge">Archived</span> : null}
        {session.can('property:edit') && !archived ? (
          <Link href={`/properties/${id}/edit`} className="button button--secondary">
            Edit
          </Link>
        ) : null}
        {session.can('property:archive') && !archived ? (
          <ActionButton
            action={archiveProperty.bind(null, id)}
            label="Archive"
            variant="danger"
            confirm={`Archive ${property.name}? Any project on it must be dealt with first.`}
          />
        ) : null}
      </PageHead>

      <ContextStrip
        chips={[
          session.can('client:view') && {
            label: 'Client',
            text: formatClientName(client),
            href: `/clients/${client.id}`,
            sub: client.mobileNumber,
          },
        ]}
      />

      <div className="stack">
        <Card>
          <CardHead title="Projects at this property" />
          {projects.items.length === 0 ? (
            <Empty title="No projects here yet">
              Projects are created against a client and one of their properties.
            </Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.items.map((project) => (
                  <tr key={project.id}>
                    <td className="mono">
                      <Link href={`/projects/${project.id}`}>{project.code}</Link>
                    </td>
                    <td>{project.name}</td>
                    <td>
                      <StatusBadge status={project.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <RelatedProposals filter={{ propertyId: id }} session={session} />

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <DetailGroup title="Land record">
              <DetailItem label="Plot number" mono>
                <Value>{property.plotNumber}</Value>
              </DetailItem>
              <DetailItem label="Survey reference (Krookie / Land ID)" mono>
                <Value>{property.surveyReference}</Value>
              </DetailItem>
              <DetailItem label="Title deed reference (Mulkia)" mono>
                <Value>{property.titleDeedReference}</Value>
              </DetailItem>
              <DetailItem label="Block number" mono>
                <Value>{property.blockNumber}</Value>
              </DetailItem>
              <DetailItem label="Plot area">
                {property.plotArea != null ? `${property.plotArea} sqm` : <Value>{null}</Value>}
              </DetailItem>
              <DetailItem label="Type of land use">
                <Value>
                  {property.landUseType
                    ? (LAND_USE_LABEL[property.landUseType] ?? property.landUseType)
                    : null}
                </Value>
              </DetailItem>
            </DetailGroup>

            <DetailGroup title="Location">
              <DetailItem label="Wilayat / village">
                {[property.wilayat, property.village].filter(Boolean).join(' / ') || (
                  <span className="faint">—</span>
                )}
              </DetailItem>
              <DetailItem label="Address">
                {address.length === 0 ? (
                  <span className="faint">—</span>
                ) : (
                  address.map((line) => <div key={line}>{line}</div>)
                )}
              </DetailItem>
              <DetailItem label="Coordinates">
                {property.easting != null && property.northing != null ? (
                  <>
                    {property.easting} E, {property.northing} N
                    {property.projectionType ? ` (${property.projectionType})` : ''}
                    {property.mapUrl ? (
                      <>
                        {' · '}
                        <a href={property.mapUrl} target="_blank" rel="noreferrer">
                          View on map
                        </a>
                      </>
                    ) : null}
                  </>
                ) : (
                  <Value>{null}</Value>
                )}
              </DetailItem>
            </DetailGroup>

            <DetailGroup title="Ownership">
              <DetailItem label="Client">
                <Link href={`/clients/${client.id}`}>{formatClientName(client)}</Link>
              </DetailItem>
              <DetailItem label="Registered owner">
                <Value>{property.ownerName}</Value>
                {property.ownerNationalId ? ` (ID ${property.ownerNationalId})` : ''}
              </DetailItem>
              <DetailItem label="Reference" mono>
                <Value>{property.reference}</Value>
              </DetailItem>
              {property.notes ? (
                <DetailItem label="Notes" wide>
                  <span className="u-pre-wrap">{property.notes}</span>
                </DetailItem>
              ) : null}
            </DetailGroup>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
