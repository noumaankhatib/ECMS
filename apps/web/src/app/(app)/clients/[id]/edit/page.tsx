import { ActionForm, Field, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client } from '@/lib/types';

import { updateClient } from '../../actions';

export const metadata = { title: 'Edit client — ECMS' };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('client:edit');
  const { id } = await params;
  const client = await api.get<Client>(`/clients/${id}`);

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/clients', label: 'Clients' },
          { href: `/clients/${id}`, label: client.name },
          { label: 'Edit' },
        ]}
      />
      <PageHead title={`Edit ${client.name}`} />

      <Card>
        <CardBody>
          <ActionForm
            action={updateClient}
            submitLabel="Save changes"
            cancelHref={`/clients/${id}`}
          >
            <input type="hidden" name="id" value={id} />
            {/* The version this form was rendered from. The API refuses the
                write if the record has moved on since, rather than silently
                overwriting somebody else's edit. */}
            <input type="hidden" name="version" value={client.version} />
            <div className="form-grid">
              <Field label="Name" name="name" defaultValue={client.name} required wide />
              <Field label="Reference" name="reference" defaultValue={client.reference} />
            </div>
            <TextArea label="Notes" name="notes" defaultValue={client.notes} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
