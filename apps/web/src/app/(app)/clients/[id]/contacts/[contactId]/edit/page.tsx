import { ActionForm, Field } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Contact } from '@/lib/types';

import { updateContact } from '../../../../actions';

export const metadata = { title: 'Edit contact — ECMS' };

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>;
}) {
  await requirePermission('client:edit');
  const { id, contactId } = await params;

  const [client, contacts] = await Promise.all([
    api.get<Client>(`/clients/${id}`),
    api.get<Contact[]>(`/clients/${id}/contacts`),
  ]);
  const contact = contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error('Contact not found');

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/clients', label: 'Clients' },
          { href: `/clients/${id}`, label: client.name },
          { label: `Edit ${contact.name}` },
        ]}
      />
      <PageHead title={`Edit ${contact.name}`} />

      <Card>
        <CardBody>
          <ActionForm
            action={updateContact}
            submitLabel="Save changes"
            cancelHref={`/clients/${id}`}
          >
            <input type="hidden" name="id" value={contact.id} />
            <input type="hidden" name="clientId" value={id} />
            {/* The version this form was rendered from. The API refuses the
                write if the record has moved on since, rather than silently
                overwriting somebody else's edit. */}
            <input type="hidden" name="version" value={contact.version} />
            <div className="form-grid">
              <Field label="Name" name="name" defaultValue={contact.name} required />
              <Field label="Position" name="position" defaultValue={contact.position} />
              <Field label="Email" name="email" type="email" defaultValue={contact.email} />
              <Field label="Phone" name="phone" defaultValue={contact.phone} />
            </div>
            <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
              <input
                type="checkbox"
                name="isPrimary"
                defaultChecked={contact.isPrimary}
                style={{ width: 'auto' }}
              />
              Main point of contact
              <span className="hint">Naming a new one replaces the current primary.</span>
            </label>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
