'use client';

import { useState } from 'react';

import { Field, Select } from '@/components/form';

/**
 * "Who is submitting?" plus the two fields that only apply when someone other
 * than the client is submitting. A disabled input is not submitted, so on
 * SELF both arrive as blank and are saved as null (clearing stale values).
 */
export function SubmitterFields({
  options,
  defaultSubmissionType,
  defaultSubmittedBy,
  defaultRelationship,
}: {
  options: readonly { value: string; label: string }[];
  defaultSubmissionType?: string | undefined;
  defaultSubmittedBy?: string | null | undefined;
  defaultRelationship?: string | null | undefined;
}) {
  const [type, setType] = useState(defaultSubmissionType ?? '');
  const isSelf = type === 'SELF';
  return (
    <>
      <Select
        label="Who is submitting?"
        name="submissionType"
        options={options}
        defaultValue={defaultSubmissionType}
        onChange={setType}
      />
      <Field
        label="Submitted by"
        name="submittedBy"
        defaultValue={defaultSubmittedBy}
        disabled={isSelf}
        hint="Required if someone other than the client is submitting."
      />
      <Field
        label="Relationship to client"
        name="submitterRelationship"
        defaultValue={defaultRelationship}
        disabled={isSelf}
        hint="e.g. agent, relative, contractor."
      />
    </>
  );
}
