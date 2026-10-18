import { ISSUE_PRIORITIES, ISSUE_SEVERITIES, WORKSTREAM_TYPES } from '@ecms/contracts';

import { EntityCombobox } from '@/components/entity-combobox';
import { ActionForm, DateField, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Project } from '@/lib/types';

import { createIssue } from '../actions';

export const metadata = { title: 'New issue — ECMS' };

export default async function NewIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ observationId?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { observationId } = await searchParams;

  const project = await api.get<Project>(`/projects/${id}`);


  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { href: `/projects/${id}/issues`, label: 'Issues' },
          { label: 'New' },
        ]}
      />
      <PageHead title="New issue" description={project.name} />

      <Card>
        <CardBody>
          <ActionForm
            action={createIssue}
            submitLabel="Raise issue"
            cancelHref={`/projects/${id}/issues`}
          >
            <input type="hidden" name="projectId" value={id} />
            {observationId ? (
              <>
                <input type="hidden" name="observationId" value={observationId} />
                <p className="hint">Raised from a recorded observation.</p>
              </>
            ) : null}
            <Field label="Title" name="title" required />
            <TextArea label="Description" name="description" />
            <div className="form-grid">
              {project.type === 'BOTH' ? (
                <Select
                  label="Workstream"
                  name="workstreamType"
                  required
                  hint="This project runs both — say which one this issue belongs to."
                  options={WORKSTREAM_TYPES.map((w) => ({
                    value: w,
                    label: w === 'PLANNING' ? 'Planning' : 'Supervision',
                  }))}
                />
              ) : null}
              <Select
                label="Severity"
                name="severity"
                required
                defaultValue="MEDIUM"
                options={ISSUE_SEVERITIES.map((s) => ({ value: s, label: s }))}
              />
              <Select
                label="Priority"
                name="priority"
                required
                defaultValue="MEDIUM"
                options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: p }))}
              />
              <EntityCombobox
                label="Owner"
                name="ownerId"
                searchUrl="/lookup/users/search?browse=true&activeOnly=true"
                browseOnFocus
                placeholder="Select or search a person"
              />
              <DateField label="Due date" name="dueDate" />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
