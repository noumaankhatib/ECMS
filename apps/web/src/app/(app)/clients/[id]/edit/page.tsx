import { DuplicateAwareForm, PrefillFromDuplicate } from '@/components/duplicate-form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client } from '@/lib/types';

import { updateClient } from '../../actions';
import { ClientFields } from '../../client-fields';

export const metadata = { title: 'Edit client — ECMS' };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('client:edit');
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
          <PrefillFromDuplicate basePath="/clients" id={id} />
          <DuplicateAwareForm
            action={updateClient}
            submitLabel="Save changes"
            cancelHref={`/clients/${id}`}
            basePath="/clients"
            canEdit
            canOverride={session.can('directory:override_duplicate')}
            prefillFields={[]}
          >
            <input type="hidden" name="id" value={id} />
            {/* The version this form was rendered from. The API refuses the
                write if the record has moved on since, rather than silently
                overwriting somebody else's edit. */}
            <input type="hidden" name="version" value={client.version} />
            {/* What the record held when the form was rendered, so only a
                changed name or identifier is checked for duplicates. */}
            <input type="hidden" name="original_name" value={client.name} />
            <input type="hidden" name="original_crNumber" value={client.crNumber ?? ''} />
            <input type="hidden" name="original_civilId" value={client.civilId ?? ''} />
            <ClientFields client={client} />
          </DuplicateAwareForm>
        </CardBody>
      </Card>
    </>
  );
}
