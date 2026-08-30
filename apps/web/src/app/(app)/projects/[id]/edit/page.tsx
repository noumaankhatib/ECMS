import { PROJECT_TYPES } from '@ecms/contracts';

import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Project } from '@/lib/types';

import { updateProject } from '../../actions';

export const metadata = { title: 'Edit project — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
  BOTH: 'Planning and supervision',
};

/** A date for an <input type="date">, which wants YYYY-MM-DD and nothing else. */
const forDateInput = (value: string | null): string | undefined =>
  value ? new Date(value).toISOString().slice(0, 10) : undefined;

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  // No permission check here beyond being signed in. The API decides — it
  // refuses the read for a non-member and refuses the write for anyone without
  // project:edit on this project.
  const project = await api.get<Project>(`/projects/${id}`);

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { label: 'Edit' },
        ]}
      />
      <PageHead title={`Edit ${project.name}`} />

      <Card>
        <CardBody>
          <ActionForm
            action={updateProject}
            submitLabel="Save changes"
            cancelHref={`/projects/${id}`}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={project.version} />
            {/* Client, property and status are all absent. The first two would
                make it a different project; the third moves only through a
                named transition on the project page. */}
            <div className="form-grid">
              <Field label="Project code" name="code" defaultValue={project.code} required />
              <Field label="Name" name="name" defaultValue={project.name} required />
              <Select
                label="Type"
                name="type"
                required
                defaultValue={project.type}
                options={PROJECT_TYPES.map((type) => ({
                  value: type,
                  label: TYPE_LABEL[type] ?? type,
                }))}
              />
              <div />
              <Field
                label="Start date"
                name="startDate"
                type="date"
                defaultValue={forDateInput(project.startDate)}
              />
              <Field
                label="Target end date"
                name="targetEndDate"
                type="date"
                defaultValue={forDateInput(project.targetEndDate)}
              />
            </div>
            <TextArea label="Description" name="description" defaultValue={project.description} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
