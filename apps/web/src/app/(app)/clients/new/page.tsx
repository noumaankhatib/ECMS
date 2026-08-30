import { ActionForm, Field, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { requirePermission } from '@/lib/session';

import { createClient } from '../actions';

export const metadata = { title: 'New client — ECMS' };

export default async function NewClientPage() {
  await requirePermission('client:create');

  return (
    <>
      <Breadcrumb items={[{ href: '/clients', label: 'Clients' }, { label: 'New' }]} />
      <PageHead title="New client" />

      <Card>
        <CardBody>
          <ActionForm action={createClient} submitLabel="Create client" cancelHref="/clients">
            <div className="form-grid">
              <Field label="Name" name="name" required wide />
              <Field
                label="Reference"
                name="reference"
                hint="Your own reference for this client. Must be unique."
              />
            </div>
            <TextArea label="Notes" name="notes" />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
