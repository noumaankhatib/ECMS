import Link from 'next/link';

import { ActionButton } from '@/components/form';
import {
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
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
      <PageHead title={property.name} description={client.name}>
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

      <div className="grid-2">
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

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <dl className="definition">
              <dt>Client</dt>
              <dd>
                <Link href={`/clients/${client.id}`}>{client.name}</Link>
              </dd>
              <dt>Reference</dt>
              <dd className="mono">
                <Value>{property.reference}</Value>
              </dd>
              <dt>Address</dt>
              <dd>
                {address.length === 0 ? (
                  <span className="faint">—</span>
                ) : (
                  address.map((line) => <div key={line}>{line}</div>)
                )}
              </dd>
              <dt>Plot number</dt>
              <dd className="mono">
                <Value>{property.plotNumber}</Value>
              </dd>
              <dt>Wilayat / village</dt>
              <dd>
                {[property.wilayat, property.village].filter(Boolean).join(' / ') || (
                  <span className="faint">—</span>
                )}
              </dd>
              <dt>Survey reference (Krookie)</dt>
              <dd className="mono">
                <Value>{property.surveyReference}</Value>
              </dd>
              <dt>Title deed reference (Mulkia)</dt>
              <dd className="mono">
                <Value>{property.titleDeedReference}</Value>
              </dd>
              <dt>Registered owner</dt>
              <dd>
                <Value>{property.ownerName}</Value>
                {property.ownerNationalId ? ` (ID ${property.ownerNationalId})` : ''}
              </dd>
              {property.notes ? (
                <>
                  <dt>Notes</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{property.notes}</dd>
                </>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
