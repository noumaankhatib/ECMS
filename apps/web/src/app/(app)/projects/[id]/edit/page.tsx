import { PROJECT_TYPES } from '@ecms/contracts';

import { EntityCombobox } from '@/components/entity-combobox';
import { ActionForm, DateRangeFields, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Project, UserRow, Workstream } from '@/lib/types';

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
  const session = await requireSession();
  const { id } = await params;

  // No permission check here beyond being signed in. The API decides — it
  // refuses the read for a non-member and refuses the write for anyone without
  // project:edit on this project.
  const project = await api.get<Project>(`/projects/${id}`);

  // Krookie, approved drawings and the site engineer belong to the supervision
  // workstream, so they are offered only when the project has one.
  const supervision = (await api.get<Workstream[]>(`/projects/${id}/workstreams`)).find(
    (w) => w.type === 'SUPERVISION',
  );
  const canSeeUsers = session.can('user:view');
  const engineer =
    supervision?.siteEngineerId && canSeeUsers
      ? await api
          .get<UserRow>(`/users/${supervision.siteEngineerId}`)
          .then((u) => ({ id: u.id, label: u.displayName }))
          .catch(() => null)
      : null;

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
              <DateRangeFields
                startLabel="Start date"
                startName="startDate"
                startDefaultValue={forDateInput(project.startDate)}
                endLabel="Target end date"
                endName="targetEndDate"
                endDefaultValue={forDateInput(project.targetEndDate)}
              />
            </div>
            <fieldset className="stack" style={{ gap: 'var(--space-2)' }}>
              <legend>Documents received</legend>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input
                  type="checkbox"
                  name="mulkiyaReceived"
                  defaultChecked={project.mulkiyaReceived}
                  style={{ width: 'auto' }}
                />
                Mulkiya (title deed)
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input
                  type="checkbox"
                  name="idCardReceived"
                  defaultChecked={project.idCardReceived}
                  style={{ width: 'auto' }}
                />
                ID card
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input
                  type="checkbox"
                  name="agreementReceived"
                  defaultChecked={project.agreementReceived}
                  style={{ width: 'auto' }}
                />
                Agreement
              </label>
            </fieldset>
            {supervision ? (
              <>
                <input type="hidden" name="supervisionWorkstreamId" value={supervision.id} />
                <input
                  type="hidden"
                  name="supervisionWorkstreamVersion"
                  value={supervision.version}
                />
                <fieldset className="stack" style={{ gap: 'var(--space-2)' }}>
                  <legend>Supervision details</legend>
                  {canSeeUsers ? (
                    <EntityCombobox
                      label="Assigned site engineer"
                      name="siteEngineerId"
                      searchUrl="/lookup/users/search"
                      defaultValue={engineer}
                    />
                  ) : null}
                  <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      name="krookieReceived"
                      defaultChecked={supervision.krookieReceived}
                      style={{ width: 'auto' }}
                    />
                    Krookie (survey reference)
                  </label>
                  <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      name="approvedDrawingsReceived"
                      defaultChecked={supervision.approvedDrawingsReceived}
                      style={{ width: 'auto' }}
                    />
                    Approved drawings
                    <span className="hint">If not done by our company.</span>
                  </label>
                </fieldset>
              </>
            ) : null}
            <TextArea label="Description" name="description" defaultValue={project.description} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
