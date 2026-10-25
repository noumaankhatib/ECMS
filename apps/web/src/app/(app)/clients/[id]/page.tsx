import { formatClientName } from '@ecms/contracts';
import Link from 'next/link';

import { ActionButton, ActionForm, Field } from '@/components/form';
import { RelatedProposals } from '@/components/related-proposals';
import { RowMenu } from '@/components/row-menu';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  DetailGroup,
  DetailItem,
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
  const clientName = formatClientName(client);
  // An individual client often IS the person you'd otherwise add as a
  // contact — retyping their name/phone a second time feels redundant, so
  // offer it pre-filled (not auto-created: still an explicit, editable
  // submission, since a contact is its own record with its own lifecycle).
  const suggestSelfAsContact = client.clientType === 'INDIVIDUAL' && contacts.length === 0;

  return (
    <>
      <Breadcrumb items={[{ href: '/clients', label: 'Clients' }, { label: clientName }]} />
      <PageHead title={clientName}>
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
            confirm={`Archive ${clientName}? It stays in the record and can still be found, but it will be hidden from the list.`}
          />
        ) : null}
      </PageHead>

      <div className="stack">
        <Card>
          <CardHead title="Details" />
          <CardBody>
            <DetailGroup>
              <DetailItem label="Reference" mono>
                <Value>{client.reference}</Value>
              </DetailItem>
              <DetailItem label="Type">
                <Value>
                  {client.clientType === 'COMPANY'
                    ? 'Company'
                    : client.clientType === 'INDIVIDUAL'
                      ? 'Individual'
                      : null}
                </Value>
              </DetailItem>
              <DetailItem label="Mobile number" mono>
                <Value>{client.mobileNumber}</Value>
              </DetailItem>
              <DetailItem label="CR number" mono>
                <Value>{client.crNumber}</Value>
              </DetailItem>
              <DetailItem label="ID Card # (Civil ID)" mono>
                <Value>{client.civilId}</Value>
              </DetailItem>
              <DetailItem label="Added">
                <DateText value={client.createdAt} />
              </DetailItem>
              <DetailItem label="Projects">{projects.total}</DetailItem>
              {client.notes ? (
                <DetailItem label="Notes" wide>
                  <span className="u-pre-wrap">{client.notes}</span>
                </DetailItem>
              ) : null}
            </DetailGroup>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Contacts">
            {session.can('client:edit') && !archived ? (
              <span className="muted u-text-sm">Add one below</span>
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
                  <th>Designation</th>
                  <th>Place of work</th>
                  <th>ID #</th>
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
                      <Value>{contact.designation}</Value>
                    </td>
                    <td>
                      <Value>{contact.placeOfWork}</Value>
                    </td>
                    <td className="mono">
                      <Value>{contact.idNumber}</Value>
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
                        <RowMenu>
                          <Link href={`/clients/${id}/contacts/${contact.id}/edit`}>Edit</Link>
                          <ActionButton
                            action={archiveContact.bind(null, contact.id, id)}
                            label="Remove"
                            variant="danger"
                            confirm={`Remove ${contact.name} from this client?`}
                          />
                        </RowMenu>
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
            <details open={suggestSelfAsContact}>
              <summary className="card__head" style={{ cursor: 'pointer' }}>
                <h2 style={{ display: 'inline' }}>Add a contact</h2>
              </summary>
              <CardBody>
                {suggestSelfAsContact ? (
                  <p className="hint u-mt-0">
                    Pre-filled from {clientName}&apos;s own details — edit or just confirm.
                  </p>
                ) : null}
                <ActionForm action={addContact} submitLabel="Add contact">
                  <input type="hidden" name="clientId" value={id} />
                  <div className="form-grid">
                    <Field
                      label="Name"
                      name="name"
                      required
                      {...(suggestSelfAsContact ? { defaultValue: clientName } : {})}
                    />
                    <Field label="Position" name="position" />
                    <Field label="Designation" name="designation" />
                    <Field label="Place of work" name="placeOfWork" />
                    <Field label="ID #" name="idNumber" />
                    <Field label="Email" name="email" type="email" />
                    <Field
                      label="Phone"
                      name="phone"
                      {...(suggestSelfAsContact && client.mobileNumber
                        ? { defaultValue: client.mobileNumber }
                        : {})}
                    />
                  </div>
                  <label className="row u-gap-2 u-text-md">
                    <input
                      type="checkbox"
                      name="isPrimary"
                      className="u-w-auto"
                      defaultChecked={suggestSelfAsContact}
                    />
                    Main point of contact
                    <span className="hint">Naming a new one replaces the current primary.</span>
                  </label>
                </ActionForm>
              </CardBody>
            </details>
          </Card>
        ) : null}

        <RelatedProposals filter={{ clientId: id }} session={session} />

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
    </>
  );
}
