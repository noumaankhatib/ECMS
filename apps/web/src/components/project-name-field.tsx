'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The project's Name, with a suggestion built from the client and property
 * picked above it in the same form. Offered, never filled in silently.
 */
export function ProjectNameField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [labels, setLabels] = useState<{ clientId: string; propertyId: string }>({
    clientId: '',
    propertyId: '',
  });
  const [name, setName] = useState('');

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onSelected = (event: Event): void => {
      const detail = (event as CustomEvent<{ name: string; option: { label: string } | null }>)
        .detail;
      if (detail.name === 'clientId' || detail.name === 'propertyId') {
        setLabels((current) => ({ ...current, [detail.name]: detail.option?.label ?? '' }));
      }
    };
    form.addEventListener('entity-selected', onSelected);
    return () => form.removeEventListener('entity-selected', onSelected);
  }, []);

  const suggestion = [labels.clientId, labels.propertyId].filter(Boolean).join(' – ');
  const offer = suggestion !== '' && suggestion !== name.trim();

  return (
    <div className="field">
      <label htmlFor="name">
        Name<span aria-hidden="true"> *</span>
      </label>
      <input
        ref={inputRef}
        id="name"
        name="name"
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-describedby="name-hint"
      />
      <span className="hint" id="name-hint">
        How you will recognise this project in lists and search.
        {offer ? (
          <>
            {' '}
            Suggestion:{' '}
            <button type="button" className="link-button" onClick={() => setName(suggestion)}>
              {suggestion}
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}
