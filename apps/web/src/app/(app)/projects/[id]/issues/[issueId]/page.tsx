import {
  ISSUE_PRIORITIES,
  ISSUE_SEVERITIES,
  ISSUE_TRANSITIONS,
  type IssueAction,
  type IssueStatus,
} from '@ecms/contracts';

import { EntityCombobox } from '@/components/entity-combobox';
import { ActionButton, ActionForm, DateField, Select, TextArea } from '@/components/form';
import { Badge, Breadcrumb, Card, CardBody, CardHead, DateText, DetailGroup, DetailItem, PageHead, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Issue, Project } from '@/lib/types';
import { loadUserNames } from '@/lib/user-names';

import { transitionIssue, updateIssue } from '../actions';

export const metadata = { title: 'Issue — ECMS' };

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/**
 * The named actions, and the word for each — the same shape the project
 * page uses for PROJECT_TRANSITIONS, reading the identical table the API
 * checks against so the interface cannot offer a move the server refuses.
 */
const ACTIONS: { action: IssueAction; to: IssueStatus; label: string; confirm?: string }[] = [
  { action: 'start', to: 'IN_PROGRESS', label: 'Start work' },
  { action: 'resolve', to: 'RESOLVED', label: 'Mark resolved' },
  {
    action: 'close',
    to: 'CLOSED',
    label: 'Close',
    confirm: 'Close this issue? Verify the resolution before closing.',
  },
  { action: 'reopen', to: 'OPEN', label: 'Reopen' },
];

export default async function IssuePage({
  params,
}: {
  params: Promise<{ id: string; issueId: string }>;
}) {
  const session = await requireSession();
  const { id, issueId } = await params;

  const [project, issue] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<Issue>(`/projects/${id}/issues/${issueId}`),
  ]);

  const userName = await loadUserNames([issue.ownerId]);

  const closed = project.status === 'CLOSED';
  const mayEdit = session.can('issue:edit', id) && !closed;
  const mayClose = session.can('issue:close', id) && !closed;

  const legal = ISSUE_TRANSITIONS[issue.status] as readonly IssueStatus[];
  const available = ACTIONS.filter(
    (candidate) =>
      legal.includes(candidate.to) && (candidate.action === 'close' ? mayClose : mayEdit),
  );

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { href: `/projects/${id}/issues`, label: 'Issues' },
          { label: issue.title },
        ]}
      />
      <PageHead title={issue.title} description={project.name}>
        <Badge>{STATUS_LABEL[issue.status] ?? issue.status}</Badge>
      </PageHead>

      <div className="grid-2">
        <div className="stack">
          {available.length > 0 ? (
            <Card>
              <CardHead title="Status" />
              <CardBody>
                <div className="row">
                  {available.map((candidate) => (
                    <ActionButton
                      key={candidate.action}
                      action={transitionIssue.bind(
                        null,
                        id,
                        issueId,
                        candidate.action,
                        issue.version,
                      )}
                      label={candidate.label}
                      variant={candidate.action === 'close' ? 'danger' : 'secondary'}
                      {...(candidate.confirm ? { confirm: candidate.confirm } : {})}
                    />
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
                  Only the moves legal from{' '}
                  <strong>{(STATUS_LABEL[issue.status] ?? issue.status).toLowerCase()}</strong> are
                  offered. The server checks again regardless.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {mayEdit ? (
            <Card>
              <CardHead title="Edit" />
              <CardBody>
                <ActionForm action={updateIssue} submitLabel="Save changes">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="id" value={issueId} />
                  <input type="hidden" name="version" value={issue.version} />
                  <div className="form-grid">
                    <Select
                      label="Severity"
                      name="severity"
                      required
                      defaultValue={issue.severity}
                      options={ISSUE_SEVERITIES.map((s) => ({ value: s, label: s }))}
                    />
                    <Select
                      label="Priority"
                      name="priority"
                      required
                      defaultValue={issue.priority}
                      options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: p }))}
                    />
                    <EntityCombobox
                      label="Owner"
                      name="ownerId"
                      searchUrl="/lookup/users/search?browse=true&activeOnly=true"
                      browseOnFocus
                      placeholder="Select or search a person"
                      defaultValue={
                        issue.ownerId
                          ? { id: issue.ownerId, label: userName.get(issue.ownerId) ?? issue.ownerId }
                          : null
                      }
                    />
                    <DateField
                      label="Due date"
                      name="dueDate"
                      defaultValue={issue.dueDate ? issue.dueDate.slice(0, 10) : undefined}
                    />
                  </div>
                  <TextArea
                    label="Closure notes"
                    name="closureNotes"
                    defaultValue={issue.closureNotes}
                    hint="Closure evidence. Not required to close."
                  />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <DetailGroup>
              <DetailItem label="Severity">{issue.severity}</DetailItem>
              <DetailItem label="Priority">{issue.priority}</DetailItem>
              <DetailItem label="Owner"><Value>
                  {issue.ownerId ? (userName.get(issue.ownerId) ?? issue.ownerId) : null}
                </Value></DetailItem>
              <DetailItem label="Due"><DateText value={issue.dueDate} /></DetailItem>
              {issue.description ? (
                <DetailItem label="Description" wide><span style={{ whiteSpace: 'pre-wrap' }}>{issue.description}</span></DetailItem>
              ) : null}
              {issue.closureNotes ? (
                <DetailItem label="Closure notes" wide><span style={{ whiteSpace: 'pre-wrap' }}>{issue.closureNotes}</span></DetailItem>
              ) : null}
            </DetailGroup>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
