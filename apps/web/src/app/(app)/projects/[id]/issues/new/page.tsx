import { ISSUE_PRIORITIES, ISSUE_SEVERITIES } from '@ecms/contracts';

import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Page as ApiPage, Project, ProjectMember, UserRow } from '@/lib/types';

import { createIssue } from '../actions';

export const metadata = { title: 'New issue — ECMS' };

export default async function NewIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ observationId?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { observationId } = await searchParams;

  const [project, members] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ProjectMember[]>(`/projects/${id}/members`),
  ]);

  const users = session.can('user:view')
    ? await api.get<ApiPage<UserRow>>('/users?pageSize=100').catch(() => null)
    : null;
  const userName = new Map((users?.items ?? []).map((u) => [u.id, u.displayName]));

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
              <Select
                label="Owner"
                name="ownerId"
                options={members.map((m) => ({
                  value: m.userId,
                  label: userName.get(m.userId) ?? m.userId,
                }))}
              />
              <Field label="Due date" name="dueDate" type="date" />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
