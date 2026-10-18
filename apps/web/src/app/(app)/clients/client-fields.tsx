import { Field, Select, TextArea } from '@/components/form';
import type { Client } from '@/lib/types';

/** Carried to an existing client by "Update existing" on the duplicate panel. */
export const CLIENT_PREFILL_FIELDS = [
  'fatherName',
  'grandfatherName',
  'surname',
  'clientType',
  'crNumber',
  'civilId',
  'mobileNumber',
  'reference',
  'notes',
];

/** The client form's fields, shared by New and Edit. */
export function ClientFields({ client }: { client?: Client }) {
  return (
    <>
      <div className="form-grid">
        <Field label="First name" name="firstName" defaultValue={client?.firstName} required />
        <Field
          label="Middle name"
          name="fatherName"
          defaultValue={client?.fatherName}
          hint="Father's name, or husband's name for a married woman"
        />
        <Field
          label="Grandfather name"
          name="grandfatherName"
          defaultValue={client?.grandfatherName}
        />
        <Field label="Surname" name="surname" defaultValue={client?.surname} />
        <Field
          label="Mobile number"
          name="mobileNumber"
          defaultValue={client?.mobileNumber}
        />
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
          hint={client ? 'Must be unique.' : 'Leave blank to generate one automatically.'}
        />
        <Field
          label="CR number"
          name="crNumber"
          defaultValue={client?.crNumber}
          hint="Commercial Registration — companies."
        />
        <Field
          label="ID Card # (Civil ID)"
          name="civilId"
          defaultValue={client?.civilId}
          hint="Civil ID or passport number — individuals."
        />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={client?.notes} />
    </>
  );
}
