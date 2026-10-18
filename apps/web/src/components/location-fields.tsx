'use client';

import type { WilayatWithVillages } from '@ecms/contracts';
import { useId, useState } from 'react';


/**
 * Wilayat and village for a property.
 *
 * Both are type-or-pick fields: the wilayat list is kept by an administrator
 * (Setup → Wilayats) so the same place is spelled the same way, and the village
 * suggestions narrow to the villages already recorded under the chosen wilayat.
 * Neither blocks what is typed — an older or imported record whose spelling is
 * not on the list must still save and display exactly as written — but a
 * wilayat that is not on the list is flagged so it can be added.
 */
export function LocationFields({
  wilayats,
  defaultWilayat,
  defaultVillage,
}: {
  wilayats: readonly WilayatWithVillages[];
  defaultWilayat?: string | null | undefined;
  defaultVillage?: string | null | undefined;
}) {
  const listId = useId();
  const [wilayat, setWilayat] = useState(defaultWilayat ?? '');

  const typed = wilayat.trim().toLowerCase();
  const match = wilayats.find((w) => w.name.trim().toLowerCase() === typed);
  const villages = (match ? match.villages : wilayats.flatMap((w) => w.villages)).filter(
    (v, i, all) => all.indexOf(v) === i,
  );

  return (
    <>
      <div className="field">
        <label htmlFor="wilayat">Wilayat</label>
        <input
          id="wilayat"
          name="wilayat"
          type="text"
          list={`${listId}-wilayats`}
          autoComplete="off"
          defaultValue={defaultWilayat ?? ''}
          onChange={(event) => setWilayat(event.target.value)}
          onInput={(event) => setWilayat(event.currentTarget.value)}
          aria-describedby="wilayat-hint"
        />
        <datalist id={`${listId}-wilayats`}>
          {wilayats.map((w) => (
            <option key={w.id} value={w.name} />
          ))}
        </datalist>
        <span className="hint" id="wilayat-hint">
          {typed !== '' && !match
            ? 'Not on the list, so it will be saved as typed. Ask an administrator to add it under Setup → Wilayats.'
            : 'Pick from the list so the place is always spelled the same way.'}
        </span>
      </div>
      <div className="field">
        <label htmlFor="village">Village</label>
        <input
          id="village"
          name="village"
          type="text"
          list={`${listId}-villages`}
          autoComplete="off"
          defaultValue={defaultVillage ?? ''}
        />
        <datalist id={`${listId}-villages`}>
          {villages.map((village) => (
            <option key={village} value={village} />
          ))}
        </datalist>
        {match ? (
          <span className="hint">Suggestions are the villages already recorded in {match.name}.</span>
        ) : null}
      </div>
    </>
  );
}
