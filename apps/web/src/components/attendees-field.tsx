'use client';

import { useState } from 'react';

/**
 * Attendees as free text, with a staff list that adds a name to it. Contractor
 * and client-side people are typed; our own people are picked.
 */
export function AttendeesField({ staff }: { staff: readonly string[] }) {
  const [value, setValue] = useState('');

  function add(name: string): void {
    if (!name) return;
    const names = value.split(',').map((n) => n.trim()).filter(Boolean);
    if (!names.includes(name)) setValue([...names, name].join(', '));
  }

  return (
    <div className="field field--wide">
      <label htmlFor="attendees">Attendees</label>
      <div className="row">
        <input
          id="attendees"
          name="attendees"
          type="text"
          value={value}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          aria-label="Add one of our staff"
          value=""
          onChange={(e) => add(e.target.value)}
        >
          <option value="">Add staff…</option>
          {staff.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <span className="hint">Pick our staff from the list; type contractor and client names.</span>
    </div>
  );
}
