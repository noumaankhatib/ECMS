import { DuplicateAwareForm } from '@/components/duplicate-form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { requirePermission } from '@/lib/session';

import { createClient } from '../actions';
import { CLIENT_PREFILL_FIELDS, ClientFields } from '../client-fields';

export const metadata = { title: 'New client — ECMS' };

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ forProposal?: string }>;
}) {
  const session = await requirePermission('client:create');
  const { forProposal } = await searchParams;

  return (
    <>
      <Breadcrumb items={[{ href: '/clients', label: 'Clients' }, { label: 'New' }]} />
      <PageHead title="New client" />

      <Card>
        <CardBody>
          <DuplicateAwareForm
            action={createClient}
            submitLabel="Create client"
            cancelHref={forProposal ? `/proposals/${forProposal}` : '/clients'}
            basePath="/clients"
            canEdit={session.can('client:edit')}
            canOverride={session.can('directory:override_duplicate')}
            prefillFields={CLIENT_PREFILL_FIELDS}
          >
            {forProposal ? <input type="hidden" name="forProposal" value={forProposal} /> : null}
            <ClientFields />
          </DuplicateAwareForm>
        </CardBody>
      </Card>
    </>
  );
}
