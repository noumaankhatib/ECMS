import { Field, Select, TextArea } from '@/components/form';
import type { Client } from '@/lib/types';

/** Carried to an existing client by "Update existing" on the duplicate panel. */
export const CLIENT_PREFILL_FIELDS = ['clientType', 'crNumber', 'civilId', 'reference', 'notes'];

/** The client form's fields, shared by New and Edit. */
export function ClientFields({ client }: { client?: Client }) {
  return (
    <>
      <div className="form-grid">
        <Field label="Name" name="name" defaultValue={client?.name} required wide />
        <Select
          label="Type"
          name="clientType"
          defaultValue={client?.clientType ?? undefined}
          options={[
            { value: 'COMPANY', label: 'Company' },
            { value: 'INDIVIDUAL', label: 'Individual' },
          ]}
        />
        <Field
          label="Reference"
          name="reference"
          defaultValue={client?.reference}
          hint="Your own reference for this client. Must be unique."
        />
        <Field
          label="CR number"
          name="crNumber"
          defaultValue={client?.crNumber}
          hint="Commercial Registration — companies."
        />
        <Field
          label="Civil ID"
          name="civilId"
          defaultValue={client?.civilId}
          hint="Civil ID or passport number — individuals."
        />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={client?.notes} />
    </>
  );
}
