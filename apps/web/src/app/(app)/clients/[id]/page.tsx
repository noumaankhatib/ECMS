import Link from 'next/link';

import { ActionButton, ActionForm, Field } from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  DateText,
  Empty,
  PageHead,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Contact, Page as ApiPage, Project, Property } from '@/lib/types';

import { addContact, archiveClient, archiveContact } from '../actions';

export const metadata = { title: 'Client — ECMS' };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('client:view');
  const { id } = await params;

  // Fetched together rather than one after another. Three sequential round
  // trips would be three times the latency for no reason — none of them
  // depends on the others.
  const [client, contacts, properties, projects] = await Promise.all([
    api.get<Client>(`/clients/${id}`),
    api.get<Contact[]>(`/clients/${id}/contacts`),
    api.get<ApiPage<Property>>(`/properties?clientId=${id}&pageSize=100`),
    api.get<ApiPage<Project>>(`/projects?clientId=${id}&pageSize=100`),
  ]);

  const archived = client.archivedAt !== null;

  return (
    <>
      <Breadcrumb items={[{ href: '/clients', label: 'Clients' }, { label: client.name }]} />
      <PageHead title={client.name}>
        {archived ? <span className="badge">Archived</span> : null}
        {session.can('client:edit') && !archived ? (
          <Link href={`/clients/${id}/edit`} className="button button--secondary">
            Edit
          </Link>
        ) : null}
        {session.can('client:archive') && !archived ? (
          <ActionButton
            action={archiveClient.bind(null, id)}
            label="Archive"
            variant="danger"
            confirm={`Archive ${client.name}? It stays in the record and can still be found, but it will be hidden from the list.`}
          />
        ) : null}
      </PageHead>

      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Contacts">
              {session.can('client:edit') && !archived ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  Add one below
                </span>
              ) : null}
            </CardHead>
            {contacts.length === 0 ? (
              <Empty title="No contacts yet">Add the people you deal with at this client.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        {contact.name}
                        {contact.isPrimary ? (
                          <>
                            {' '}
                            <Badge>Primary</Badge>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <Value>{contact.position}</Value>
                      </td>
                      <td>
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`}>{contact.email}</a>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td className="nowrap">
                        <Value>{contact.phone}</Value>
                      </td>
                      <td className="right">
                        {session.can('client:edit') && !archived ? (
                          <ActionButton
                            action={archiveContact.bind(null, contact.id, id)}
                            label="Remove"
                            variant="danger"
                            confirm={`Remove ${contact.name} from this client?`}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {session.can('client:edit') && !archived ? (
            <Card>
              <CardHead title="Add a contact" />
              <CardBody>
                <ActionForm action={addContact} submitLabel="Add contact">
                  <input type="hidden" name="clientId" value={id} />
                  <div className="form-grid">
                    <Field label="Name" name="name" required />
                    <Field label="Position" name="position" />
                    <Field label="Email" name="email" type="email" />
                    <Field label="Phone" name="phone" />
                  </div>
                  <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                    <input type="checkbox" name="isPrimary" style={{ width: 'auto' }} />
                    Main point of contact
                    <span className="hint">Naming a new one replaces the current primary.</span>
                  </label>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Properties">
              {session.can('property:create') && !archived ? (
                <Link href={`/properties/new?clientId=${id}`} className="button button--small">
                  New property
                </Link>
              ) : null}
            </CardHead>
            {properties.items.length === 0 ? (
              <Empty title="No properties">Sites belonging to this client appear here.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Town or city</th>
                    <th>Postcode</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.items.map((property) => (
                    <tr key={property.id}>
                      <td>
                        <Link href={`/properties/${property.id}`}>{property.name}</Link>
                      </td>
                      <td>
                        <Value>{property.city}</Value>
                      </td>
                      <td className="mono">
                        <Value>{property.postcode}</Value>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Details" />
            <CardBody>
              <dl className="definition">
                <dt>Reference</dt>
                <dd className="mono">
                  <Value>{client.reference}</Value>
                </dd>
                <dt>Added</dt>
                <dd>
                  <DateText value={client.createdAt} />
                </dd>
                <dt>Projects</dt>
                <dd>{projects.total}</dd>
                {client.notes ? (
                  <>
                    <dt>Notes</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{client.notes}</dd>
                  </>
                ) : null}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
