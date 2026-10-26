'use client';

import { useEffect, useRef, useState } from 'react';

import { lookupFailure } from '@/lib/lookup-error';

export interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
  /** Extra values other fields on the form can copy — see `FormAutofill`. */
  meta?: Record<string, string>;
}

/**
 * A type-ahead replacement for a `<Select>` backed by a list that can grow
 * past a single page (clients, properties, users) — the same debounced
 * fetch-as-you-type pattern the ⌘K command palette already uses
 * (`command-palette.tsx`), just rendered inline as one form field instead of
 * a modal. A plain `<select>` populated from the first 100 rows silently
 * drops anything past that; this re-queries the real list on every keystroke
 * instead of ever loading it all upfront.
 *
 * Submits as a single hidden `name` field holding the chosen id — the rest
 * is local, client-only UI state. Leaving it blank is valid wherever the
 * underlying field is optional.
 */
export function EntityCombobox({
  label,
  name,
  searchUrl,
  placeholder,
  hint,
  required,
  wide,
  defaultValue,
  browseOnFocus,
}: {
  label: string;
  name: string;
  /** Proxy route returning `ComboboxOption[]` for `?q=<term>`, e.g. `/lookup/clients/search` (not under `/api/`, which nginx sends to the backend). */
  searchUrl: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  defaultValue?: ComboboxOption | null;
  /** Lists the first few options as soon as the field is opened, before
   *  anything is typed — for short lists (staff) where browsing beats guessing
   *  a search term. Typing still narrows the list. */
  browseOnFocus?: boolean;
}) {
  const [text, setText] = useState(defaultValue?.label ?? '');
  const [selectedId, setSelectedId] = useState(defaultValue?.id ?? '');
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 2 && !(browseOnFocus && open && trimmed.length === 0)) {
      setOptions([]);
      setFailure(null);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`${searchUrl}${searchUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(trimmed)}`)
        .then((res) => {
          if (!res.ok) {
            setFailure(lookupFailure(res.status));
            return [];
          }
          setFailure(null);
          return res.json() as Promise<ComboboxOption[]>;
        })
        .then(setOptions)
        .catch(() => {
          setFailure(lookupFailure(null));
          setOptions([]);
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [text, searchUrl, browseOnFocus, open]);

  // A preselected option (e.g. arriving from a client's page) is announced once
  // so dependent fields fill exactly as if it had been picked.
  useEffect(() => {
    if (!defaultValue?.meta) return;
    const handle = setTimeout(() => announce(defaultValue), 0);
    return () => clearTimeout(handle);
    // Once, on mount.
  }, []);

  const inputId = `${name}-search`;

  /** Tells the rest of the form what was picked (or cleared), so fields that
   *  depend on it (`FormAutofill`, name suggestions) can follow. */
  function announce(option: ComboboxOption | null): void {
    containerRef.current?.dispatchEvent(
      new CustomEvent('entity-selected', { bubbles: true, detail: { name, option } }),
    );
  }

  return (
    <div
      className={`field${wide ? ' field--wide' : ''}`}
      ref={containerRef}
      style={{ position: 'relative' }}
    >
      <label htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input type="hidden" name={name} value={selectedId} required={required ?? false} />
      <input
        id={inputId}
        type="text"
        value={text}
        placeholder={placeholder ?? 'Type to search...'}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(event) => {
          setText(event.target.value);
          setSelectedId('');
          setOpen(true);
          announce(null);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (text.trim().length >= 2 || (browseOnFocus && text.trim().length === 0)) ? (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-raised)',
            maxHeight: 240,
            overflowY: 'auto',
            margin: '4px 0 0',
            padding: 4,
            listStyle: 'none',
          }}
        >
          {loading ? (
            <li style={{ padding: 8, color: 'var(--text-muted)', fontSize: 14 }}>Searching...</li>
          ) : options.length === 0 ? (
            <li
              role={failure ? 'alert' : undefined}
              style={{ padding: 8, color: failure ? 'var(--danger-text)' : 'var(--text-muted)', fontSize: 14 }}
            >
              {failure ?? 'No matches.'}
            </li>
          ) : (
            options.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === selectedId}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(option.id);
                    setText(option.label);
                    setOpen(false);
                    announce(option);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    background: 'none',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'var(--text)',
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {option.label}
                  {option.sublabel ? (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
                      {option.sublabel}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
