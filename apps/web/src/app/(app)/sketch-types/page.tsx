import { ActionButton, ActionForm, Field } from '@/components/form';
import { Card, CardBody, CardHead, Empty, PageHead } from '@/components/ui';
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

      <Card>
        <CardHead title="Active types" />
        {sorted.length === 0 ? (
          <Empty title="No sketch types">Add the first one below.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Label</th>
                <th>Sort order</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((sketchType) => (
                <tr key={sketchType.id}>
                  <td className="mono">{sketchType.code}</td>
                  <td>
                    <ActionForm action={updateSketchType} submitLabel="Save">
                      <input type="hidden" name="id" value={sketchType.id} />
                      <div className="row">
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
                          defaultValue={String(sketchType.sortOrder)}
                        />
                      </div>
                    </ActionForm>
                  </td>
                  <td>{sketchType.sortOrder}</td>
                  <td className="right">
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

      <Card>
        <CardHead title="Add a sketch type" />
        <CardBody>
          <ActionForm action={createSketchType} submitLabel="Add">
            <div className="form-grid">
              <Field
                label="Code"
                name="code"
                required
                hint="Upper-case letters, digits and underscores only, e.g. TWIN_VILLA. Never editable afterwards."
              />
              <Field label="Label" name="label" required hint="What staff see and pick." />
              <Field label="Sort order" name="sortOrder" type="number" defaultValue="0" />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
