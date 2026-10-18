'use client';

import { useEffect, useRef, useState } from 'react';

const SOURCE_FIELDS = ['plotNumber', 'village', 'wilayat'] as const;

/** "Plot 4512 – Village, Wilayat", from whichever of the three are filled. */
function suggest(values: Record<(typeof SOURCE_FIELDS)[number], string>): string {
  const plot = values.plotNumber.trim();
  const place = [values.village, values.wilayat]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(', ');
  return [plot ? `Plot ${plot}` : '', place].filter(Boolean).join(' – ');
}

/**
 * The property's Name, with a suggestion built live from the plot number,
 * village and wilayat typed further down the same form. Nothing is filled in
 * silently: the suggestion is offered, and one click copies it into the field.
 */
export function PropertyNameField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestion, setSuggestion] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const update = (): void => {
      const read = (field: (typeof SOURCE_FIELDS)[number]): string => {
        const el = form.elements.namedItem(field);
        return el instanceof HTMLInputElement ? el.value : '';
      };
      setSuggestion(
        suggest({ plotNumber: read('plotNumber'), village: read('village'), wilayat: read('wilayat') }),
      );
    };
    update();
    form.addEventListener('input', update);
    return () => form.removeEventListener('input', update);
  }, []);

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
        How you will recognise this plot in lists and search.
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
