import { ActionButton, ActionForm, Field, Select } from '@/components/form';
import { Card, CardHead, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { PlanningTemplateItem } from '@/lib/types';

import { archiveTemplateItem, createTemplateItem, updateTemplateItem } from './actions';

export const metadata = { title: 'Planning templates — ECMS' };

const SECTIONS: {
  kind: PlanningTemplateItem['kind'];
  title: string;
  empty: string;
  accent: 'blue' | 'purple';
}[] = [
  { kind: 'ACTIVITY', title: 'Standard activities', empty: 'No standard activities yet.', accent: 'blue' },
  { kind: 'MILESTONE', title: 'Standard milestones', empty: 'No standard milestones yet.', accent: 'purple' },
];

/**
 * The standard activities and milestones offered on a project's Planning page.
 *
 * They are copied by name into a project when someone ticks them, never created
 * automatically, so renaming or retiring one here changes nothing on projects
 * that already used it.
 */
export default async function PlanningTemplatesPage() {
  await requirePermission('work_template:admin');

  const items = await api.get<PlanningTemplateItem[]>('/planning-templates');

  return (
    <>
      <PageHead
        title="Planning templates"
        description="The standard activities and milestones offered on every project's Planning page. Staff tick the ones that apply; nothing is added automatically."
      />

      {SECTIONS.map((section) => {
        const rows = items
          .filter((item) => item.kind === section.kind)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <Card key={section.kind} accent={section.accent}>
            <CardHead title={section.title}>
              <span className="count-pill">{rows.length}</span>
            </CardHead>
            {rows.length === 0 ? (
              <Empty title={section.empty}>Add the first one below.</Empty>
            ) : (
              <table className="ref-table">
                <thead>
                  <tr>
                    <th>Name and order</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td className="ref-edit">
                        <ActionForm action={updateTemplateItem} submitLabel="Save" layout="compact">
                          <input type="hidden" name="id" value={item.id} />
                          <Field
                            label="Name"
                            name="name"
                            id={`name-${item.id}`}
                            defaultValue={item.name}
                          />
                          <Field
                            label="Order"
                            name="sortOrder"
                            id={`sortOrder-${item.id}`}
                            type="number"
                            narrow
                            defaultValue={String(item.sortOrder)}
                          />
                        </ActionForm>
                      </td>
                      <td className="ref-actions">
                        <ActionButton
                          action={archiveTemplateItem.bind(null, item.id)}
                          label="Retire"
                          variant="danger"
                          confirm={`Retire "${item.name}"? Projects that already used it are unaffected; it just stops being offered.`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        );
      })}

      <div className="ref-add card card--accent card--green">
        <header className="card__head">
          <h2>Add to the list</h2>
        </header>
        <div className="card__body">
          <ActionForm action={createTemplateItem} submitLabel="Add" layout="inline">
            <Select
              label="Type"
              name="kind"
              required
              options={[
                { value: 'ACTIVITY', label: 'Activity' },
                { value: 'MILESTONE', label: 'Milestone' },
              ]}
            />
            <Field label="Name" name="name" required />
            <Field label="Order" name="sortOrder" type="number" narrow defaultValue="0" />
          </ActionForm>
        </div>
      </div>
    </>
  );
}
