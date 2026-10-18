import { ActionButton, ActionForm, Field } from '@/components/form';
import { Card, CardHead, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { ProposalSketchType } from '@/lib/types';

import { archiveSketchType, createSketchType, updateSketchType } from './actions';

export const metadata = { title: 'Sketch types — ECMS' };

/**
 * The admin-managed pick list behind a proposal's "Type of Sketch" —
 * docs/phase-5-plan.md §4/§5c. A small table an administrator can add to,
 * rename, or retire; nobody edits code to add a new one.
 *
 * `GET /proposal-sketch-types` only ever returns active entries, so a
 * retired one simply stops appearing here — it still exists, and any
 * proposal already carrying it keeps showing it (see the proposal detail
 * page), it is just no longer offered as a fresh choice.
 */
export default async function SketchTypesPage() {
  // This page exists only to manage the list, so it sits behind the admin
  // permission itself rather than the weaker `proposal:view` the underlying
  // GET route also accepts — someone who can only view proposals has
  // nothing to do here.
  await requirePermission('sketch_type:admin');

  const sketchTypes = await api.get<ProposalSketchType[]>('/proposal-sketch-types');
  const sorted = [...sketchTypes].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PageHead
        title="Sketch types"
        description="The fixed list proposals pick a sketch type from. Retiring one keeps it on any proposal already using it."
      />

      <Card accent="blue">
        <CardHead title="Active types">
          <span className="count-pill">{sorted.length}</span>
        </CardHead>
        {sorted.length === 0 ? (
          <Empty title="No sketch types">Add the first one below.</Empty>
        ) : (
          <table className="ref-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Label and sort order</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((sketchType) => (
                <tr key={sketchType.id}>
                  <td>
                    <span className="ref-code">{sketchType.code}</span>
                  </td>
                  <td className="ref-edit">
                    <ActionForm action={updateSketchType} submitLabel="Save" layout="compact">
                      <input type="hidden" name="id" value={sketchType.id} />
                      <Field
                        label="Label"
                        name="label"
                        id={`label-${sketchType.id}`}
                        defaultValue={sketchType.label}
                      />
                      <Field
                        label="Sort order"
                        name="sortOrder"
                        id={`sortOrder-${sketchType.id}`}
                        type="number"
                        narrow
                        defaultValue={String(sketchType.sortOrder)}
                      />
                    </ActionForm>
                  </td>
                  <td className="ref-actions">
                    <ActionButton
                      action={archiveSketchType.bind(null, sketchType.id)}
                      label="Retire"
                      variant="danger"
                      confirm={`Retire "${sketchType.label}"? Existing proposals keep showing it; it just stops being offered as a new choice.`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="ref-add card card--accent card--green">
        <header className="card__head">
          <h2>Add a sketch type</h2>
        </header>
        <div className="card__body">
          <ActionForm action={createSketchType} submitLabel="Add" layout="inline">
            <Field
              label="Code"
              name="code"
              required
              hint="Upper-case letters, digits and underscores, e.g. TWIN_VILLA. Never editable afterwards."
            />
            <Field label="Label" name="label" required hint="What staff see and pick." />
            <Field label="Sort order" name="sortOrder" type="number" narrow defaultValue="0" />
          </ActionForm>
        </div>
      </div>
    </>
  );
}
