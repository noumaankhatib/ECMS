'use client';

import { useEffect, useRef, useState } from 'react';

import { lookupFailure } from '@/lib/lookup-error';

interface SavedContact {
  id: string;
  name: string;
  phone: string;
  position: string;
  isPrimary: boolean;
}

/** Sets a value the way typing would, so anything watching the input notices. */
function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Once a client is chosen on the form, lists that client's saved contacts and
 * copies the one picked into the Contact name and Contact phone boxes. Shows
 * nothing until there is something to pick (no client, or none saved), and
 * never overwrites anything — it only fills when a contact is chosen.
 */
export function ContactPicker({
  nameField = 'contactName',
  phoneField = 'contactPhone',
}: {
  nameField?: string;
  phoneField?: string;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const form = marker.current?.closest('form');
    if (!form) return;
    let latest = 0;
    const onSelected = (event: Event): void => {
      const { name, option } = (event as CustomEvent<{ name: string; option: { id: string } | null }>)
        .detail;
      if (name !== 'clientId') return;
      const ticket = ++latest;
      if (!option) {
        setContacts([]);
        return;
      }
      fetch(`/lookup/contacts?clientId=${encodeURIComponent(option.id)}`)
        .then((res) => {
          if (!res.ok) {
            if (ticket === latest) setFailure(lookupFailure(res.status));
            return [];
          }
          if (ticket === latest) setFailure(null);
          return res.json() as Promise<SavedContact[]>;
        })
        .then((list) => {
          if (ticket === latest) setContacts(list);
        })
        .catch(() => {
          if (ticket === latest) {
            setFailure(lookupFailure(null));
            setContacts([]);
          }
        });
    };
    form.addEventListener('entity-selected', onSelected);
    return () => form.removeEventListener('entity-selected', onSelected);
  }, []);

  function pick(id: string): void {
    const contact = contacts.find((c) => c.id === id);
    const form = marker.current?.closest('form');
    if (!contact || !form) return;
    const nameInput = form.elements.namedItem(nameField);
    const phoneInput = form.elements.namedItem(phoneField);
    if (nameInput instanceof HTMLInputElement) setInputValue(nameInput, contact.name);
    if (phoneInput instanceof HTMLInputElement) setInputValue(phoneInput, contact.phone);
  }

  return (
    <>
      <span ref={marker} hidden />
      {failure ? (
        <p className="hint" role="alert">
          Saved contacts could not be loaded. {failure}
        </p>
      ) : null}
      {contacts.length > 0 ? (
        <div className="field field--wide">
          <label htmlFor="saved-contact">Saved contacts for this client</label>
          <select id="saved-contact" value="" onChange={(e) => pick(e.target.value)}>
            <option value="">Pick one to fill the contact below…</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
                {contact.position ? ` — ${contact.position}` : ''}
                {contact.isPrimary ? ' (primary)' : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}
