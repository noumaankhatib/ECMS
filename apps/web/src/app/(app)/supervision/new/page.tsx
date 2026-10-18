import Link from 'next/link';

import { EntityCombobox } from '@/components/entity-combobox';
import {
  ActionButton,
  ActionForm,
  DateRangeFields,
  Field,
  TextArea,
} from '@/components/form';
import { Breadcrumb, Card, CardBody, CardHead, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Page as ApiPage, Project } from '@/lib/types';

import { createNewSupervisionProject, upgradeExistingProject } from './actions';

export const metadata = { title: 'New supervision — ECMS' };

/**
 * The client's own two-path flow for starting supervision work:
 *
 *  - Search for planning work already in the system and upgrade that project
 *    in place (same code, same row) — the ordinary case, since planning
 *    almost always comes first.
 *  - Or, if the planning work predates this system, record a plain-text
 *    reference to the old code and start a fresh supervision project. Not a
 *    link — nothing here resolves it against a real record.
 */
export default async function NewSupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const session = await requirePermission('project:edit');
  const params = await searchParams;
  const search = params.search?.trim() ?? '';
  const canSeeUsers = session.can('user:view');

  // `type=PLANNING` also returns BOTH projects — correct for the Planning
  // list page, wrong here: a BOTH project already has supervision, so
  // upgrading it would always be refused. Only a project that is still
  // PLANNING-only is a real candidate for this action.
  const results = search
    ? await api
        .get<ApiPage<Project>>(
          `/projects?${new URLSearchParams({ type: 'PLANNING', search, pageSize: '10' }).toString()}`,
        )
        .then((page) => ({ ...page, items: page.items.filter((p) => p.type === 'PLANNING') }))
    : null;

  return (
    <>
      <Breadcrumb items={[{ href: '/supervision', label: 'Supervision' }, { label: 'New' }]} />
      <PageHead
        title="Add supervision"
        description="Find the planning project this supervision work belongs to, or start fresh."
      />

      <Card>
        <CardHead title="Find an existing planning project" />
        <CardBody>
          <form className="row" style={{ marginBottom: results ? 'var(--space-4)' : 0 }}>
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Search by code or name"
              aria-label="Search planning projects"
              style={{ maxWidth: 320 }}
            />
            <button type="submit" className="button button--secondary">
              Search
            </button>
          </form>

          {results ? (
            results.items.length === 0 ? (
              <p className="muted">
                No matching planning project — this will be recorded as a new supervision project
                with a reference to the code you typed, below.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.items.map((project) => (
                    <tr key={project.id}>
                      <td className="mono">{project.code}</td>
                      <td>{project.name}</td>
                      <td className="right">
                        <ActionButton
                          action={upgradeExistingProject.bind(null, project.id, project.version)}
                          label="Use this project"
                          variant="primary"
                          confirm={`Add supervision to ${project.code} — ${project.name}? It keeps its code and gains a supervision workstream.`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Can't find it? This planning work isn't in the system" />
        <CardBody>
          <ActionForm
            action={createNewSupervisionProject}
            submitLabel="Create supervision project"
            cancelHref="/supervision"
          >
            <div className="form-grid">
              <EntityCombobox
                label="Client"
                name="clientId"
                required
                searchUrl="/lookup/clients/search"
                placeholder="Search by name, reference, CR/Civil ID or phone"
              />
              <EntityCombobox
                label="Property"
                name="propertyId"
                required
                searchUrl="/lookup/properties/search"
                hint="Must belong to the client above — each result shows its client."
              />
              <Field label="Name" name="name" required />
              <Field
                label="External planning reference"
                name="externalPlanningReference"
                defaultValue={search}
                hint="The old code this planning work was known by, if any — a note, not a link."
              />
              <DateRangeFields
                startLabel="Start date"
                startName="startDate"
                endLabel="Target end date"
                endName="targetEndDate"
              />
              {canSeeUsers ? (
                <EntityCombobox
                  label="Assigned site engineer"
                  name="siteEngineerId"
                  searchUrl="/lookup/users/search"
                />
              ) : null}
            </div>
            <fieldset className="stack" style={{ gap: 'var(--space-2)' }}>
              <legend>Documents received</legend>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="mulkiyaReceived" style={{ width: 'auto' }} />
                Mulkiya (title deed)
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="idCardReceived" style={{ width: 'auto' }} />
                ID card
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="agreementReceived" style={{ width: 'auto' }} />
                Agreement
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="krookieReceived" style={{ width: 'auto' }} />
                Krookie (survey reference)
              </label>
              <label className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                <input type="checkbox" name="approvedDrawingsReceived" style={{ width: 'auto' }} />
                Approved drawings
                <span className="hint">If not done by our company.</span>
              </label>
            </fieldset>
            <TextArea label="Description" name="description" />
          </ActionForm>
        </CardBody>
      </Card>

      <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-3)' }}>
        Prefer a project with no supervision at all? <Link href="/projects/new">Create one</Link>{' '}
        directly instead.
      </p>
    </>
  );
}
