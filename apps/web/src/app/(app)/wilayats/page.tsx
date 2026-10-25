import type { WilayatWithVillages } from '@ecms/contracts';

import { ActionButton, ActionForm, Field } from '@/components/form';
import { Card, CardHead, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';

import { archiveWilayat, createWilayat, updateWilayat } from './actions';

export const metadata = { title: 'Wilayats — ECMS' };

/**
 * The wilayats offered on the property form, so the same place is always
 * spelled the same way. Properties keep the text they were saved with, so
 * renaming or retiring an entry here never changes one.
 */
export default async function WilayatsPage() {
  await requirePermission('wilayat:admin');

  const wilayats = await api.get<WilayatWithVillages[]>('/wilayats');

  return (
    <>
      <PageHead
        title="Wilayats"
        description="The wilayats offered when a property is added. Properties keep the spelling they were saved with, so renaming or retiring one here changes none of them."
      />

      <Card accent="blue">
        <CardHead title="Wilayats">
          <span className="count-pill">{wilayats.length}</span>
        </CardHead>
        {wilayats.length === 0 ? (
          <Empty title="No wilayats yet">Add the first one below.</Empty>
        ) : (
          <table className="ref-table">
            <thead>
              <tr>
                <th>Name and order</th>
                <th>Villages recorded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {wilayats.map((wilayat) => (
                <tr key={wilayat.id}>
                  <td className="ref-edit">
                    <ActionForm action={updateWilayat} submitLabel="Save" layout="compact">
                      <input type="hidden" name="id" value={wilayat.id} />
                      <Field
                        label="Name"
                        name="name"
                        id={`name-${wilayat.id}`}
                        defaultValue={wilayat.name}
                      />
                      <Field
                        label="Order"
                        name="sortOrder"
                        id={`sortOrder-${wilayat.id}`}
                        type="number"
                        narrow
                        defaultValue={String(wilayat.sortOrder)}
                      />
                    </ActionForm>
                  </td>
                  <td className="ref-meta">
                    {wilayat.villages.length > 0 ? (
                      <span className="cell-sub u-mt-0">{wilayat.villages.join(', ')}</span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td className="ref-actions">
                    <ActionButton
                      action={archiveWilayat.bind(null, wilayat.id)}
                      label="Retire"
                      variant="danger"
                      confirm={`Retire "${wilayat.name}"? Properties already placed there keep it; it just stops being suggested.`}
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
          <h2>Add a wilayat</h2>
        </header>
        <div className="card__body">
          <ActionForm action={createWilayat} submitLabel="Add" layout="inline">
            <Field label="Name" name="name" required hint="As it should always be spelled." />
            <Field label="Order" name="sortOrder" type="number" narrow defaultValue="0" />
          </ActionForm>
        </div>
      </div>
    </>
  );
}
