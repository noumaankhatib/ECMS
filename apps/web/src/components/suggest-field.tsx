'use client';

import { useId } from 'react';

/**
 * A text field that offers suggestions as a list but accepts anything typed.
 * The suggestions are advice, not a restriction.
 */
export function SuggestField({
  label,
  name,
  suggestions,
  defaultValue,
  required,
  hint,
  wide,
}: {
  label: string;
  name: string;
  suggestions: readonly string[];
  defaultValue?: string | null | undefined;
  required?: boolean;
  hint?: string;
  wide?: boolean;
}) {
  const listId = useId();
  const unique = [...new Set(suggestions.map((s) => s.trim()).filter(Boolean))];
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label htmlFor={`${name}-${listId}`}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={`${name}-${listId}`}
        name={name}
        type="text"
        list={listId}
        autoComplete="off"
        defaultValue={defaultValue ?? ''}
        required={required ?? false}
      />
      <datalist id={listId}>
        {unique.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
